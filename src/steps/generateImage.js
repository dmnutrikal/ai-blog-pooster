import { pathToFileURL } from 'node:url';
import { image } from '../providers/openai.js';
import { graphql } from '../lib/shopify.js';
import { config } from '../config.js';

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
function buildImagePrompt(article, topic) {
  // English adaptation is already sitting on the article object — reuse it
  // as the concept anchor instead of translating title_bg/keyword ourselves.
  const concept = article.title_en || topic.keyword;

  return [
    `A clean, editorial lifestyle photograph illustrating the theme: "${concept}".`,
    'Style: bright, natural, wellness/lifestyle aesthetic, soft natural lighting, minimal ' +
      'and airy composition, shallow depth of field.',
    'Subject matter: everyday lifestyle, food, and natural ingredients — for example fresh ' +
      'fruit, a glass of water or smoothie, a calm skincare or wellness routine moment, ' +
      'natural textures. General depiction of healthy-looking skin in an everyday context is fine.',
    'No text, no words, no typography, no logos, no watermarks anywhere in the image.',
    'Do NOT include: medical or clinical settings, hospital or pharmacy imagery, before/after ' +
      'comparison shots, doctors or people in white lab coats, pills or capsules presented as ' +
      'medicine, close-ups implying wrinkles or joints are being medically treated or cured, or ' +
      'any imagery that implies a medical claim or treatment.',
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

// article: needs title_en (falls back to topic.keyword). topic: { keyword, angle }.
// Image generation/upload is best-effort: on any failure this logs a warning
// and returns imageUrl: null rather than throwing, so the pipeline can still
// publish the article without a featured image.
export async function generateImage(article, topic) {
  const imagePrompt = buildImagePrompt(article, topic);
  let imageUrl = null;

  try {
    const imageData = await image(imagePrompt);
    const imageBytes = await getImageBytes(imageData);
    const filename = `collagenlab-article-${Date.now()}.png`;
    imageUrl = await uploadToShopifyFiles(imageBytes, filename);
  } catch (err) {
    console.warn(`generateImage: failed to generate/upload featured image, continuing without one — ${err.message}`);
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
