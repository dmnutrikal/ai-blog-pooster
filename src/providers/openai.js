import OpenAI from 'openai';
import { config } from '../config.js';

// Every OpenAI call in this project goes through this file. Nothing else
// should `import OpenAI from 'openai'` directly.
const client = new OpenAI({ apiKey: config.openai.apiKey });

// Text generation — Terra for articles, Luna for compliance checks.
// NOTE: Terra/Luna are reasoning-tier models and reject any `temperature`
// other than the default (1) — omit the param entirely unless a caller
// explicitly passes one and knows the target model supports it.
// TODO: add response_format json_schema per-caller once writeArticle.js and
// compliance.js land and we know their exact shapes.
export async function generate({
  model = config.openai.models.terra,
  system,
  prompt,
  messages,
  temperature,
  json = false,
} = {}) {
  const finalMessages =
    messages ?? [...(system ? [{ role: 'system', content: system }] : []), { role: 'user', content: prompt }];

  const response = await client.chat.completions.create({
    model,
    messages: finalMessages,
    ...(temperature !== undefined ? { temperature } : {}),
    ...(json ? { response_format: { type: 'json_object' } } : {}),
  });

  return response.choices[0].message.content;
}

// Embeddings — used for product/article/topic vectors matched via the
// match_products / match_articles RPCs.
export async function embed(input, { model = config.openai.models.embedding } = {}) {
  const response = await client.embeddings.create({ model, input });
  if (Array.isArray(input)) {
    return response.data.map((item) => item.embedding);
  }
  return response.data[0].embedding;
}

// Featured-image generation. Response item may carry either `b64_json` or
// `url` depending on the model/request — callers must handle both.
export async function image(
  prompt,
  { model = config.openai.models.image, size = config.image.size, quality = config.image.quality } = {}
) {
  const response = await client.images.generate({ model, prompt, size, quality });
  return response.data[0];
}
