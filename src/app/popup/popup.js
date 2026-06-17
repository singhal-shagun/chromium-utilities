// src/app/popup/popup.js
import { getSettings } from "../../core/storage.js";
import { chatCompletions } from "../../core/llm.js";
import { toDownloadUrl } from "../../core/markdown.js";
import { inferFilename } from "../../core/filename.js";

const MAX_HTML_BYTES = 200 * 1024; // 200 KB
const SYSTEM_PROMPT =
  "Convert the following HTML (a sequence of selected elements) to clean, semantic Markdown. " +
  "Strip scripts, styles, ads, and navigation. Keep each element as a coherent section in the order " +
  "presented. Output only the Markdown.";

const rowsEl = document.getElementById("rows");
const rowTemplate = document.getElementById("row-template");
const addRowBtn = document.getElementById("add-row");
const convertBtn = document.getElementById("convert");
const filenameEl = document.getElementById("filename");
const statusEl = document.getElementById("status");
const spinnerEl = document.getElementById("spinner");
const fallbackEl = document.getElementById("fallback");
const fallbackTextEl = document.getElementById("fallback-text");
const copyBtn = document.getElementById("copy-btn");
const missingEl = document.getElementById("missing-settings");
const openOptionsEl = document.getElementById("open-options");

let activeTabId = null;
let activeTabUrl = null;
let busy = false;
let downloadUrl = null; // { url, kind }

function setStatus(text, kind) {
  statusEl.textContent = text || "";
  statusEl.classList.remove("status--ok", "status--err");
  if (kind === "ok") statusEl.classList.add("status--ok");
  if (kind === "err") statusEl.classList.add("status--err");
}

function setBusy(b) {
  busy = b;
  convertBtn.disabled = b;
  addRowBtn.disabled = b;
  convertBtn.textContent = b ? "Converting\u2026" : "Convert";
  spinnerEl.hidden = !b;
}

function makeRow() {
  const node = rowTemplate.content.firstElementChild.cloneNode(true);
  const removeBtn = node.querySelector(".row__remove");
  removeBtn.addEventListener("click", () => {
    node.remove();
  });
  rowsEl.appendChild(node);
  return node;
}

function getRowSelectors() {
  return Array.from(rowsEl.querySelectorAll(".row")).map((row) => {
    const sel = row.querySelector(".row__selector").value.trim();
    return { row, selector: sel };
  });
}

function setRowError(row, message) {
  const errEl = row.querySelector(".row__error");
  errEl.textContent = message || "";
  row.classList.toggle("row--error", Boolean(message));
}

function clearAllRowErrors() {
  rowsEl.querySelectorAll(".row").forEach((r) => setRowError(r, ""));
}

function countValidRows() {
  const rows = getRowSelectors();
  const filled = rows.filter((r) => r.selector);
  return { filled, total: rows.length };
}

function updateStatusForValid() {
  const { filled } = countValidRows();
  if (filled.length === 0) {
    setStatus("Add at least one selector.", "err");
    return;
  }
  setStatus(`${filled.length} selector${filled.length === 1 ? "" : "s"} ready.`);
}

function isUnsupportedUrl(url) {
  if (!url) return true;
  return /^(chrome|edge|about|chrome-extension|moz-extension):/i.test(url);
}

function showFallback(md) {
  fallbackTextEl.value = md;
  fallbackEl.hidden = false;
}

function hideFallback() {
  fallbackEl.hidden = true;
  fallbackTextEl.value = "";
  revokeDownloadUrl();
}

function revokeDownloadUrl() {
  if (downloadUrl && downloadUrl.kind === "blob") {
    try {
      URL.revokeObjectURL(downloadUrl.url);
    } catch (_) {
      // ignore
    }
  }
  downloadUrl = null;
}

function setFilenameFromTab(tab) {
  const title = tab && tab.title ? tab.title : "";
  filenameEl.value = inferFilename(title);
}

async function loadTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) {
    setStatus("No active tab found.", "err");
    return null;
  }
  activeTabId = tab.id;
  activeTabUrl = tab.url || "";
  setFilenameFromTab(tab);
  return tab;
}

async function refreshMissingSettings() {
  const s = await getSettings();
  const missing = !s.apiKey;
  missingEl.hidden = !missing;
  return { settings: s, missing };
}

async function injectExtractor(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["src/core/extract.js"],
  });
}

async function runExtractInTab(tabId, selector) {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: (sel) => window.__extractBySelector(sel),
    args: [selector],
  });
  return result;
}

async function ensureInjected(tabId) {
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => typeof window.__extractBySelector === "function",
    });
    if (result === true) return;
  } catch (_) {
    // fall through
  }
  await injectExtractor(tabId);
}

function utf8ByteLength(str) {
  return new TextEncoder().encode(str).length;
}

async function onConvert() {
  if (busy) return;
  hideFallback();
  clearAllRowErrors();

  if (activeTabId == null) {
    const tab = await loadTab();
    if (!tab) return;
  }

  if (isUnsupportedUrl(activeTabUrl)) {
    setStatus("This page cannot be scripted (browser-internal page).", "err");
    return;
  }

  const { settings, missing } = await refreshMissingSettings();
  if (missing) {
    setStatus("Open Options to set your API key.", "err");
    return;
  }

  const { filled } = countValidRows();
  if (filled.length === 0) {
    setStatus("Add at least one non-empty selector.", "err");
    return;
  }

  setBusy(true);
  setStatus("Validating selectors\u2026");
  try {
    await ensureInjected(activeTabId);
  } catch (e) {
    setBusy(false);
    setStatus("Could not inject extractor: " + (e && e.message ? e.message : String(e)), "err");
    return;
  }

  const htmls = [];
  let failed = 0;
  for (const { row, selector } of filled) {
    let res;
    try {
      res = await runExtractInTab(activeTabId, selector);
    } catch (e) {
      setRowError(row, "Extraction error: " + (e && e.message ? e.message : String(e)));
      failed += 1;
      continue;
    }
    if (!res || !res.ok) {
      setRowError(row, (res && res.error) || "Selector did not match exactly one element.");
      failed += 1;
      continue;
    }
    htmls.push(res.html);
  }

  if (failed > 0) {
    setBusy(false);
    const { filled: f2 } = countValidRows();
    setStatus(
      `${f2.length - failed} of ${f2.length} selectors valid. Fix errors and try again.`,
      "err",
    );
    return;
  }

  const concatenated = htmls.join("\n\n");
  const bytes = utf8ByteLength(concatenated);
  if (bytes > MAX_HTML_BYTES) {
    setBusy(false);
    setStatus(
      `HTML too large (${(bytes / 1024).toFixed(1)} KB > ${MAX_HTML_BYTES / 1024} KB). ` +
        "Narrow your selectors.",
      "err",
    );
    return;
  }

  setStatus("Converting via LLM\u2026");
  let md;
  try {
    const result = await chatCompletions({
      baseUrl: settings.baseUrl,
      apiKey: settings.apiKey,
      model: settings.model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: "```html\n" + concatenated + "\n```" },
      ],
    });
    md = result.text;
  } catch (e) {
    setBusy(false);
    setStatus("LLM error: " + (e && e.message ? e.message : String(e)), "err");
    return;
  }

  setStatus("Starting download\u2026");
  const filename = filenameEl.value || "converted.md";
  revokeDownloadUrl();
  downloadUrl = toDownloadUrl(md);
  let downloadId = null;
  try {
    downloadId = await chrome.downloads.download({
      url: downloadUrl.url,
      filename,
      saveAs: true,
      conflictAction: "uniquify",
    });
  } catch (e) {
    showFallback(md);
    setBusy(false);
    setStatus("Download was blocked. Use the box below to copy the Markdown manually.", "err");
    return;
  }

  if (downloadId == null || typeof downloadId !== "number") {
    showFallback(md);
    setBusy(false);
    setStatus("Download was blocked. Use the box below to copy the Markdown manually.", "err");
    return;
  }

  // Revoke blob URL after Chrome has had a chance to read it.
  setTimeout(revokeDownloadUrl, 60_000);

  setBusy(false);
  setStatus(`Downloaded as ${filename}.`, "ok");
}

function onAddRow() {
  if (busy) return;
  makeRow();
  const rows = rowsEl.querySelectorAll(".row");
  const last = rows[rows.length - 1];
  if (last) last.querySelector(".row__selector").focus();
  updateStatusForValid();
}

async function onCopyFallback() {
  try {
    await navigator.clipboard.writeText(fallbackTextEl.value);
    setStatus("Copied to clipboard.", "ok");
  } catch (e) {
    setStatus("Copy failed: " + (e && e.message ? e.message : String(e)), "err");
  }
}

function onOpenOptions(e) {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
}

window.addEventListener("DOMContentLoaded", async () => {
  addRowBtn.addEventListener("click", onAddRow);
  convertBtn.addEventListener("click", onConvert);
  copyBtn.addEventListener("click", onCopyFallback);
  openOptionsEl.addEventListener("click", onOpenOptions);

  makeRow();
  await loadTab();
  await refreshMissingSettings();
  updateStatusForValid();
});
