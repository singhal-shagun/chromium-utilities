// src/core/storage.js
// Settings storage: apiKey in chrome.storage.local, baseUrl/model in chrome.storage.sync.

const DEFAULTS = {
  baseUrl: "https://api.openai.com",
  model: "gpt-4o-mini",
};

export async function getSettings() {
  const [sync, local] = await Promise.all([
    chrome.storage.sync.get(["baseUrl", "model"]),
    chrome.storage.local.get(["apiKey"]),
  ]);
  return {
    baseUrl: typeof sync.baseUrl === "string" && sync.baseUrl ? sync.baseUrl : DEFAULTS.baseUrl,
    model: typeof sync.model === "string" && sync.model ? sync.model : DEFAULTS.model,
    apiKey: typeof local.apiKey === "string" ? local.apiKey : "",
  };
}

export async function saveSettings({ baseUrl, apiKey, model }) {
  const syncUpdate = {};
  if (typeof baseUrl === "string" && baseUrl.trim()) {
    syncUpdate.baseUrl = baseUrl.trim();
  }
  if (typeof model === "string" && model.trim()) {
    syncUpdate.model = model.trim();
  }
  const localUpdate = {};
  if (typeof apiKey === "string") {
    localUpdate.apiKey = apiKey;
  }
  await Promise.all([
    Object.keys(syncUpdate).length ? chrome.storage.sync.set(syncUpdate) : Promise.resolve(),
    Object.keys(localUpdate).length ? chrome.storage.local.set(localUpdate) : Promise.resolve(),
  ]);
}
