import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { readFile, readdir } from 'node:fs/promises';
import { image, editImage } from '../providers/openai.js';
import { graphql } from '../lib/shopify.js';
import { config, STORE } from '../config.js';
import { IMAGE_RULES } from '../lib/storeRegulatory.js';
import { IMAGE } from '../lib/storeContent.js';

// Product cutouts live with the store, not the engine: stores/<STORE>/products/.
const PRODUCTS_DIR = config.store.paths.products;

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

// What an image must never show is the active store's IMAGE_RULES
// (stores/<STORE>/regulatory.js); how its product is styled is its IMAGE
// content (stores/<STORE>/content.js).
const COMPLIANCE_BLOCK = IMAGE_RULES;

function conceptFor(article, topic) {
  // English adaptation is already sitting on the article object — reuse it
  // as the concept anchor instead of translating title_bg/keyword ourselves.
  return article.title_en || topic.keyword;
}

// Label-appropriate styling props — per store, see IMAGE.propsFor in
// stores/<STORE>/content.js.
function propsForFlavor(flavorLabel) {
  return IMAGE.propsFor(flavorLabel);
}

// Primary path: the model renders the real product pouch directly into a new lifestyle scene
// via the Images edit endpoint (gpt-image-2 — see config.openai.models.image) — validated
// through prototyping to reproduce the label's exact text reliably, unlike gpt-image-1. topic
// .angle carries the calendar cluster (topics.angle = cluster_bg, see loadCalendar.js) for
// non-calendar/ad-hoc topics it's just their free-form angle — either way it's a reasonable
// steer for scene variety. side ('left'/'right') places the pouch off-center by rule of thirds.
function buildProductScenePrompt(article, topic, style, flavor, side) {
  const concept = conceptFor(article, topic);
  const clusterHint = topic.angle ? ` (cluster/theme: "${topic.angle}")` : '';
  const propsText = propsForFlavor(flavor.label);
  // "pouch", "bottle", ... — whatever this store's cutouts actually show.
  const pkg = IMAGE.packaging;

  return [
    `Using the attached reference image of ${IMAGE.describeReference(flavor.label)}, place THIS EXACT product ${pkg} naturally into a new lifestyle scene illustrating the theme: "${concept}"${clusterHint}.`,
    `Scene: ${style.sceneText}`,
    `Product angle: show the ${pkg} at a natural THREE-QUARTER angle — slightly turned, not flat ` +
      'head-on — standing upright on the surface, so it reads with real dimensional depth ' +
      'rather than a flat label shot.',
    `Composition: position the ${pkg} OFF-CENTER following the rule of thirds, in the ${side} ` +
      'third of the frame, with the rest of the scene balancing the composition through ' +
      'negative space — uncluttered, not crowded. Camera at eye level or very slightly above.',
    `Depth of field: shallow — the ${pkg} itself in crisp sharp focus, the background gently ` +
      'blurred, like real product photography shot on a fast lens.',
    `Scale and grounding: the ${pkg} occupies roughly 30-38% of the total image height, standing ` +
      'solidly on the surface with a soft, realistic contact shadow beneath its base. Light the ' +
      'scene with one believable soft light source from one side, casting consistent ' +
      'directional shadows.',
    `Styling props: ${propsText}, arranged so they lead the eye toward the ${pkg} rather than ` +
      'crowding or competing with it.',
    `ABSOLUTE packaging fidelity: reproduce the ${pkg} and ALL of its label text EXACTLY as shown ` +
      'in the reference image — identical shape, colours, logo, layout, and every word of text. ' +
      'Do NOT alter, re-letter, re-spell, translate, or restyle any text on the packaging, and ' +
      'do NOT add or remove any text.',
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
    IMAGE.lifestyleSubject,
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

// Discovers flavor cutouts by globbing stores/<STORE>/products/*.png rather than a hardcoded list, so
// adding/renaming/removing a cutout file needs no code change. "Salted-Caramel.png" ->
// { slug: 'salted-caramel', file: 'Salted-Caramel.png', label: 'Salted Caramel' }.
async function listFlavors() {
  const files = (await readdir(PRODUCTS_DIR)).filter((f) => f.toLowerCase().endsWith('.png'));
  return files.map((file) => {
    const base = path.basename(file, path.extname(file));
    return { slug: base.toLowerCase(), file, label: base.replace(/-/g, ' ') };
  });
}

// Cutouts named by product handle (e.g. stores/gutexpert/products/lactase.png)
// are matched to the article's linked product, so the image shows the product
// the article actually links. Stores whose cutouts are named otherwise (e.g.
// collagenlab's per-flavor files) never match and keep the random pick.
function pickFlavor(flavors, productHandle) {
  const { forceFlavorSlug } = config.image;
  if (forceFlavorSlug) {
    const forced = flavors.find((f) => f.slug === forceFlavorSlug);
    if (forced) return forced;
    console.warn(`generateImage: IMAGE_FORCE_FLAVOR="${forceFlavorSlug}" matches no discovered flavor — picking randomly instead.`);
  }
  const forProduct = productHandle ? flavors.find((f) => f.slug === productHandle.toLowerCase()) : null;
  return forProduct ?? pickRandom(flavors);
}

async function generateProductSceneImage(article, topic, productHandle) {
  const flavors = await listFlavors();
  if (flavors.length === 0) {
    throw new Error(`No .png product cutouts found in ${PRODUCTS_DIR}`);
  }
  const flavor = pickFlavor(flavors, productHandle);
  console.log(`  -> image cutout: ${path.join(PRODUCTS_DIR, flavor.file)}`);
  const style = pickRandom(config.image.sceneStyles);
  const side = Math.random() < 0.5 ? 'left' : 'right';
  const imagePrompt = buildProductScenePrompt(article, topic, style, flavor, side);

  const cutoutPath = path.join(PRODUCTS_DIR, flavor.file);
  const cutoutBuffer = await readFile(cutoutPath);
  // quality:'high' is deliberately hardcoded (not config.image.quality, which defaults to
  // 'medium' for cost) — validated through prototyping specifically at 'high'; label-text
  // fidelity on the edit endpoint was never tested at a lower quality tier.
  const imageData = await editImage(imagePrompt, cutoutBuffer, flavor.file, { quality: 'high' });
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
// productHandle: the matched product's handle, if any — see pickFlavor().
// Image generation/upload is best-effort: on any failure this logs a warning and returns
// imageUrl: null rather than throwing, so the pipeline can still publish the article without a
// featured image.
// Primary path renders the real product pouch (stores/<STORE>/products/) directly into a lifestyle
// scene via the Images edit endpoint (see buildProductScenePrompt/editImage). If that fails for
// any reason (no cutouts found, edit endpoint error, etc.) this falls back to a text-only
// lifestyle scene (no product) rather than leaving the article with no image at all.
export async function generateImage(article, topic, { productHandle = null } = {}) {
  let imageUrl = null;
  let imagePrompt = null;

  try {
    const result = await generateProductSceneImage(article, topic, productHandle);
    imagePrompt = result.imagePrompt;
    const filename = `${STORE}-article-${Date.now()}.png`;
    imageUrl = await uploadToShopifyFiles(result.imageBytes, filename);
    return { imageUrl, imagePrompt };
  } catch (err) {
    console.warn(`generateImage: product-in-scene render failed, falling back to text-only lifestyle image — ${err.message}`);
  }

  try {
    const result = await generateLifestyleImage(article, topic);
    imagePrompt = result.imagePrompt;
    const filename = `${STORE}-article-${Date.now()}.png`;
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
