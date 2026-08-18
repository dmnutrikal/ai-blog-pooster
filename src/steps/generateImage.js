import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { image, editImage } from '../providers/openai.js';
import { graphql } from '../lib/shopify.js';
import { config } from '../config.js';

const PRODUCTS_DIR = path.join(path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url)))), 'assets', 'products');

function pickRandom(list) {
  return list[Math.floor(Math.random() * list.length)];
}

const STAGED_UPLOADS_CREATE = `
  mutation StagedUploadsCreate($input: [StagedUploadInput!]!) {
    stagedUploadsCreate(input: $input) {
      stagedTargets {
        url
        resourceUrl
        parameters {
          name
          value
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const FILE_CREATE = `
  mutation FileCreate($files: [FileCreateInput!]!) {
    fileCreate(files: $files) {
      files {
        id
        fileStatus
        ... on MediaImage {
          image {
            url
          }
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const FILE_STATUS_QUERY = `
  query FileStatus($id: ID!) {
    node(id: $id) {
      ... on MediaImage {
        fileStatus
        image {
          url
        }
      }
    }
  }
`;

// TODO: CollagenLab-specific brand/aesthetic tuning (exact color palette,
// props, model presence/absence) may need adjusting once there's real
// feedback on generated images.
const COMPLIANCE_BLOCK =
  'No text, no words, no typography, no logos, no watermarks anywhere in the image other than ' +
  'what is already printed on the reference product pouch itself (when a reference is used). ' +
  'Do NOT include: medical or clinical settings, hospital or pharmacy imagery, before/after ' +
  'comparison shots, doctors or people in white lab coats, pills or capsules presented as ' +
  'medicine, close-ups implying wrinkles or joints are being medically treated or cured, any ' +
  'invented claim text or badges, or any imagery that implies a medical claim or treatment. No ' +
  'people in the frame.';

function conceptFor(article, topic) {
  // English adaptation is already sitting on the article object — reuse it
  // as the concept anchor instead of translating title_bg/keyword ourselves.
  return article.title_en || topic.keyword;
}

// Primary path: renders the real product pouch (a cutout from assets/products/) into a new
// lifestyle scene via the Images edit endpoint, instead of generating a scene from text alone —
// gives believable perspective/lighting/contact-shadow instead of a flat pasted-on look.
// topic.angle carries the calendar cluster (topics.angle = cluster_bg, see loadCalendar.js) for
// non-calendar/ad-hoc topics it's just their free-form angle — either way it's a reasonable
// steer for scene variety.
function buildProductScenePrompt(article, topic, style, flavor) {
  const concept = conceptFor(article, topic);
  const clusterHint = topic.angle ? ` (cluster/theme: "${topic.angle}")` : '';

  return [
    `Using the attached reference image of a CollagenLab collagen-peptide pouch (flavor: ${flavor.label}), place THIS EXACT product pouch naturally into a new lifestyle scene illustrating the theme: "${concept}"${clusterHint}.`,
    `Scene: ${style.sceneText}`,
    'Product placement: the pouch must sit IN the scene with believable perspective, resting ' +
      'naturally on the surface (not floating), with lighting, color temperature, and shadow ' +
      'direction matched to the scene, plus a real soft contact shadow where it touches the ' +
      'surface. Compose it so it is clearly present but not dominating — roughly a third of the ' +
      'frame, positioned off-center (not dead-center) in the lower portion of the shot.',
    'Packaging fidelity: keep the pouch exactly as shown in the reference — same label design, ' +
      'colours, wordmark, and flavour text. Do NOT redesign, restyle, relabel, or change the ' +
      'packaging in any way; only change its lighting/perspective to match the new scene.',
    COMPLIANCE_BLOCK,
  ].join(' ');
}

// Fallback path (also the only path if flavor cutouts are ever unavailable): the original
// text-only lifestyle scene, no product pouch.
function buildLifestylePrompt(article, topic) {
  const concept = conceptFor(article, topic);

  return [
    `A clean, editorial lifestyle photograph illustrating the theme: "${concept}".`,
    'Style: bright, natural, wellness/lifestyle aesthetic, soft natural lighting, minimal ' +
      'and airy composition, shallow depth of field.',
    'Subject matter: everyday lifestyle, food, and natural ingredients — for example fresh ' +
      'fruit, a glass of water or smoothie, a calm skincare or wellness routine moment, ' +
      'natural textures. General depiction of healthy-looking skin in an everyday context is fine.',
    COMPLIANCE_BLOCK,
  ].join(' ');
}

async function getImageBytes(imageData) {
  if (imageData.b64_json) {
    return Buffer.from(imageData.b64_json, 'base64');
  }
  if (imageData.url) {
    const res = await fetch(imageData.url);
    if (!res.ok) {
      throw new Error(`Failed to download generated image: HTTP ${res.status}`);
    }
    return Buffer.from(await res.arrayBuffer());
  }
  throw new Error('image() response contained neither b64_json nor url');
}

async function pollForImageUrl(fileId, { attempts = 10, delayMs = 1000 } = {}) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const data = await graphql(FILE_STATUS_QUERY, { id: fileId });
    const node = data.node;

    if (node?.image?.url) {
      return node.image.url;
    }
    if (node?.fileStatus === 'FAILED') {
      throw new Error('Shopify reported fileStatus=FAILED while processing the uploaded image');
    }

    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  throw new Error('Timed out waiting for Shopify to finish processing the uploaded image');
}

async function uploadToShopifyFiles(imageBytes, filename) {
  const stagedData = await graphql(STAGED_UPLOADS_CREATE, {
    input: [
      {
        resource: 'FILE',
        filename,
        mimeType: 'image/png',
        fileSize: String(imageBytes.length),
        httpMethod: 'POST',
      },
    ],
  });

  if (stagedData.stagedUploadsCreate.userErrors.length > 0) {
    throw new Error(`stagedUploadsCreate failed: ${JSON.stringify(stagedData.stagedUploadsCreate.userErrors)}`);
  }

  const target = stagedData.stagedUploadsCreate.stagedTargets[0];

  const formData = new FormData();
  for (const { name, value } of target.parameters) {
    formData.append(name, value);
  }
  formData.append('file', new Blob([imageBytes], { type: 'image/png' }), filename);

  const uploadRes = await fetch(target.url, { method: 'POST', body: formData });
  if (!uploadRes.ok) {
    throw new Error(`Staged upload to Shopify storage failed: HTTP ${uploadRes.status}`);
  }

  const fileData = await graphql(FILE_CREATE, {
    files: [{ alt: filename, contentType: 'IMAGE', originalSource: target.resourceUrl }],
  });

  if (fileData.fileCreate.userErrors.length > 0) {
    throw new Error(`fileCreate failed: ${JSON.stringify(fileData.fileCreate.userErrors)}`);
  }

  const file = fileData.fileCreate.files[0];
  return file.image?.url ?? (await pollForImageUrl(file.id));
}

function pickFlavor() {
  const { flavors, forceFlavorSlug } = config.image;
  if (forceFlavorSlug) {
    const forced = flavors.find((f) => f.slug === forceFlavorSlug);
    if (forced) return forced;
    console.warn(`generateImage: IMAGE_FORCE_FLAVOR="${forceFlavorSlug}" matches no configured flavor — picking randomly instead.`);
  }
  return pickRandom(flavors);
}

async function generateProductSceneImage(article, topic) {
  const flavor = pickFlavor();
  const style = pickRandom(config.image.sceneStyles);
  const imagePrompt = buildProductScenePrompt(article, topic, style, flavor);

  const cutoutPath = path.join(PRODUCTS_DIR, flavor.file);
  const cutoutBuffer = await readFile(cutoutPath);
  const imageData = await editImage(imagePrompt, cutoutBuffer, flavor.file);
  const imageBytes = await getImageBytes(imageData);

  return { imagePrompt, imageBytes };
}

async function generateLifestyleImage(article, topic) {
  const imagePrompt = buildLifestylePrompt(article, topic);
  const imageData = await image(imagePrompt);
  const imageBytes = await getImageBytes(imageData);

  return { imagePrompt, imageBytes };
}

// article: needs title_en (falls back to topic.keyword). topic: { keyword, angle }.
// Image generation/upload is best-effort: on any failure this logs a warning and returns
// imageUrl: null rather than throwing, so the pipeline can still publish the article without a
// featured image.
// Primary path renders a real product pouch (assets/products/) into a lifestyle scene via the
// Images edit endpoint (see buildProductScenePrompt/editImage). If that fails for any reason
// (bad reference file, edit endpoint error, etc.) this falls back to the previous text-only
// lifestyle scene (no product) rather than leaving the article with no image at all.
export async function generateImage(article, topic) {
  let imageUrl = null;
  let imagePrompt = null;

  try {
    const result = await generateProductSceneImage(article, topic);
    imagePrompt = result.imagePrompt;
    const filename = `collagenlab-article-${Date.now()}.png`;
    imageUrl = await uploadToShopifyFiles(result.imageBytes, filename);
    return { imageUrl, imagePrompt };
  } catch (err) {
    console.warn(`generateImage: product-in-scene edit failed, falling back to text-only lifestyle image — ${err.message}`);
  }

  try {
    const result = await generateLifestyleImage(article, topic);
    imagePrompt = result.imagePrompt;
    const filename = `collagenlab-article-${Date.now()}.png`;
    imageUrl = await uploadToShopifyFiles(result.imageBytes, filename);
  } catch (err) {
    console.warn(`generateImage: fallback lifestyle image also failed, continuing without one — ${err.message}`);
  }

  return { imageUrl, imagePrompt };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const testTopic = { keyword: 'колаген за кожа', angle: 'ползи и научна информация' };
  const testArticle = { title_en: 'Collagen for Skin: The Science, Types and How to Choose Wisely' };

  generateImage(testArticle, testTopic)
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
