// src/core/llm.js
// Calls an OpenAI-compatible chat-completions endpoint via the Vercel AI SDK.
// `ai` and `@ai-sdk/openai-compatible` are loaded at runtime from esm.sh
// through the import map declared on popup.html / options.html.

import { generateText } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

/**
 * Generate a Markdown response from a user-configured OpenAI-compatible endpoint.
 *
 * @param {Object}   args
 * @param {string}   args.baseUrl   Base URL, with or without a trailing `/v1`.
 *                                   The provider handles the `/chat/completions` suffix.
 * @param {string}   args.apiKey    API key (sent as `Authorization: Bearer <apiKey>`).
 * @param {string}   args.model     Model id (e.g. `MiniMax-M3`).
 * @param {Array}    args.messages  AI SDK messages: `[{ role, content }, ...]`.
 * @param {number?}  args.maxTokens Optional cap on output tokens.
 * @param {AbortSignal?} args.signal Optional abort signal (e.g. for timeouts).
 * @returns {Promise<{text: string, finishReason: string, usage: object}>}
 * @throws {Error} on network / API failures.
 */
export async function chatCompletions({
  baseUrl,
  apiKey,
  model,
  messages,
  maxTokens,
  signal,
}) {
  const provider = createOpenAICompatible({
    name: "user-configured",
    apiKey,
    baseURL: normalizeBaseUrl(baseUrl),
  });

  try {
    const result = await generateText({
      model: provider(model),
      messages,
      ...(typeof maxTokens === "number" ? { maxOutputTokens: maxTokens } : {}),
      ...(signal ? { abortSignal: signal } : {}),
      maxRetries: 1,
    });
    return {
      text: result.text,
      finishReason: result.finishReason,
      usage: result.usage,
    };
  } catch (err) {
    // Normalize the AI SDK error to a single message so the popup status area
    // can show something readable.
    const status = err && err.statusCode ? ` (${err.statusCode})` : "";
    const body = err && err.responseBody ? `: ${String(err.responseBody).slice(0, 300)}` : "";
    const message = (err && err.message) ? err.message : String(err);
    throw new Error(`LLM request failed${status}${body ? body : ""} \u2014 ${message}`);
  }
}

function normalizeBaseUrl(baseUrl) {
  let s = (baseUrl || "").trim();
  if (!s) {
    s = "https://api.openai.com/v1";
  }
  s = s.replace(/\/+$/, "");
  // If the user did NOT include `/v1`, append it. The AI SDK's OpenAI-compatible
  // provider expects a complete base URL that already points at the API root.
  if (!/\/v\d+$/i.test(s)) {
    s = s + "/v1";
  }
  return s;
}
