import { generate } from '../providers/openai.js';

const JSON_ONLY_REMINDER =
  'Reminder: respond with STRICT JSON only — no markdown code fences, no commentary before or ' +
  'after, no preamble. Output must start with { and end with }.';

// Calls generate() with json mode, parses the result, and retries once with
// a stricter "JSON only" reminder if parsing fails before giving up.
export async function generateJson({ model, system, prompt }) {
  const raw = await generate({ model, system, prompt, json: true });

  try {
    return JSON.parse(raw);
  } catch {
    const retryRaw = await generate({
      model,
      system,
      prompt: `${prompt}\n\n${JSON_ONLY_REMINDER}`,
      json: true,
    });

    try {
      return JSON.parse(retryRaw);
    } catch (retryErr) {
      throw new Error(`Model did not return valid JSON after retry: ${retryErr.message}\nRaw output: ${retryRaw}`);
    }
  }
}
