// src/app/options/options.js
import { getSettings, saveSettings } from "../../core/storage.js";
import { chatCompletions } from "../../core/llm.js";

const form = document.getElementById("settings-form");
const baseUrlEl = document.getElementById("baseUrl");
const apiKeyEl = document.getElementById("apiKey");
const modelEl = document.getElementById("model");
const saveBtn = document.getElementById("save-btn");
const testBtn = document.getElementById("test-btn");
const statusEl = document.getElementById("status");

function setStatus(text, kind) {
  statusEl.textContent = text || "";
  statusEl.classList.remove("status--ok", "status--err");
  if (kind === "ok") statusEl.classList.add("status--ok");
  if (kind === "err") statusEl.classList.add("status--err");
}

function setBusy(busy) {
  saveBtn.disabled = busy;
  testBtn.disabled = busy;
}

async function load() {
  const s = await getSettings();
  baseUrlEl.value = s.baseUrl || "";
  apiKeyEl.value = s.apiKey || "";
  modelEl.value = s.model || "";
}

async function onSave(e) {
  e.preventDefault();
  setStatus("");
  setBusy(true);
  try {
    await saveSettings({
      baseUrl: baseUrlEl.value,
      apiKey: apiKeyEl.value,
      model: modelEl.value,
    });
    setStatus("Saved.", "ok");
  } catch (err) {
    setStatus("Save failed: " + (err && err.message ? err.message : String(err)), "err");
  } finally {
    setBusy(false);
  }
}

async function onTest() {
  setStatus("");
  setBusy(true);
  try {
    const settings = await getSettings();
    if (!settings.apiKey) {
      setStatus("Enter an API key first.", "err");
      return;
    }
    await chatCompletions({
      baseUrl: settings.baseUrl,
      apiKey: settings.apiKey,
      model: settings.model,
      maxTokens: 5,
      messages: [{ role: "user", content: "ping" }],
    });
    setStatus("OK", "ok");
  } catch (err) {
    setStatus("Failed: " + (err && err.message ? err.message : String(err)), "err");
  } finally {
    setBusy(false);
  }
}

window.addEventListener("DOMContentLoaded", () => {
  form.addEventListener("submit", onSave);
  testBtn.addEventListener("click", onTest);
  load();
});
