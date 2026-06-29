; (function () {
  "use strict"

  const DEFAULT_BASE_URL = "http://localhost:3000"
  const MAX_HTML_BYTES = 200 * 1024

  // ─── Injected content ───────────────────────────────────────────

  /**
   * Inject extract.js into a tab via chrome.scripting.executeScript.
   * Returns a promise that resolves when injection completes.
   */
  async function ensureExtractInjected(tabId) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["src/content-scripts/extract.js"]
      })
    } catch (err) {
      throw new Error(`Failed to inject extract script: ${err.message}`)
    }
  }

  // ─── Storage helpers ────────────────────────────────────────────

  async function getSettings() {
    const defaults = { companionBaseUrl: DEFAULT_BASE_URL }
    return new Promise((resolve, reject) => {
      chrome.storage.sync.get(defaults, (result) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError)
        } else {
          resolve(result)
        }
      })
    })
  }

  // ─── Pre-flight health check ────────────────────────────────────

  async function healthCheck(baseUrl) {
    const url = `${baseUrl.replace(/\/+$/, "")}/api/companion-app-connection-test`
    const response = await fetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(5000)
    })
    if (!response.ok) {
      throw new Error(`Health check returned ${response.status}`)
    }
  }

  // ─── Extraction ─────────────────────────────────────────────────

  async function extractSelectors(tabId, selectors) {
    const results = []
    for (const selector of selectors) {
      const frames = await chrome.scripting.executeScript({
        target: { tabId },
        func: (sel) => {
          if (typeof window.__HTML_TO_MD_EXTRACT === "function") {
            return window.__HTML_TO_MD_EXTRACT(sel)
          }
          return {
            ok: false,
            count: 0,
            html: "",
            error: "Extract helper not loaded."
          }
        },
        args: [selector]
      })
      const result = frames?.[0]?.result
      if (!result || !result.ok) {
        throw new Error(
          `Selector "${selector}": ${result?.error || "extraction failed"}`
        )
      }
      results.push(result)
    }
    return results
  }

  // ─── POST to companion ──────────────────────────────────────────

  async function postHtmlAndGetZip(baseUrl, concatenatedHtml) {
    const url = `${baseUrl.replace(/\/+$/, "")}/api/html-elements-to-markdown`
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ html: concatenatedHtml })
    })
    if (!response.ok) {
      let detail = ""
      try {
        const body = await response.text()
        detail = body ? ` — ${body.slice(0, 500)}` : ""
      } catch {
        // ignore read errors
      }
      throw new Error(`Companion app returned ${response.status}${detail}`)
    }
    // The response is a ZIP archive (binary blob)
    const blob = await response.blob()
    return blob
  }

  // ─── Download ZIP ───────────────────────────────────────────────

  function downloadZip(blob, filename) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = async () => {
        const dataUrl = reader.result
        try {
          const downloadId = await chrome.downloads.download({
            url: dataUrl,
            filename: `${filename.replace(/\.zip$/i, "")}.zip`,
            saveAs: true
          })
          resolve(downloadId)
        } catch (err) {
          reject(err)
        }
      }
      reader.onerror = () => reject(new Error("Failed to read ZIP blob"))
      reader.readAsDataURL(blob)
    })
  }

  // ─── Notifications ──────────────────────────────────────────────

  function showNotification(title, message) {
    try {
      chrome.notifications.create({
        type: "basic",
        iconUrl: chrome.runtime.getURL("icons/icon128.png"),
        title: title,
        message: message,
        contextMessage: "HTML → Markdown"
      })
    } catch (_) {
      // Notification icon not available; skip gracefully
    }
  }

  // ─── Message handler (side panel ↔ service worker) ─────────────

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    // Probe a tab to check if we have injection permission
    if (msg.type === "check-permission") {
      chrome.scripting
        .executeScript({ target: { tabId: msg.tabId }, func: () => true })
        .then(() => sendResponse({ ok: true }))
        .catch((err) => {
          if (/cannot access/i.test(err.message)) {
            sendResponse({ ok: false, needsPermission: true })
          } else {
            sendResponse({ ok: false, error: err.message })
          }
        })
      return true
    }

    // Resolve the active tab (service worker has activeTab access)
    if (msg.type === "resolve-tab") {
      chrome.tabs
        .query({ active: true, lastFocusedWindow: true })
        .then((tabs) => {
          if (tabs.length > 0) {
            sendResponse({
              tabId: tabs[0].id,
              title: tabs[0].title || "page"
            })
          } else {
            sendResponse({ error: "No active tab found." })
          }
        })
        .catch((err) => sendResponse({ error: err.message }))
      return true // keep channel open for async response
    }

    // Inject picker.js into a tab and start the picker UI
    if (msg.type === "inject-picker") {
      chrome.scripting
        .executeScript({
          target: { tabId: msg.tabId },
          files: ["src/content-scripts/picker.js"]
        })
        .then(() =>
          chrome.tabs.sendMessage(msg.tabId, {
            type: "html-markdown-picker-start"
          })
        )
        .then(() => sendResponse({ ok: true }))
        .catch((err) => {
          if (/cannot access/i.test(err.message)) {
            sendResponse({ error: err.message, needsPermission: true })
          } else {
            sendResponse({ error: err.message })
          }
        })
      return true
    }

    // Validate a selector by injecting extract.js and running it
    if (msg.type === "validate-selector") {
      const doValidate = () =>
        chrome.scripting.executeScript({
          target: { tabId: msg.tabId },
          func: (sel) => {
            if (typeof window.__HTML_TO_MD_EXTRACT === "function") {
              return window.__HTML_TO_MD_EXTRACT(sel)
            }
            return {
              ok: false,
              count: 0,
              html: "",
              error: "Extract helper not loaded."
            }
          },
          args: [msg.selector]
        })

      ensureExtractInjected(msg.tabId)
        .then(doValidate)
        .then((frames) => {
          const result = frames?.[0]?.result
          sendResponse(result || { ok: false, error: "No result from page." })
        })
        .catch((err) => {
          if (/cannot access/i.test(err.message)) {
            sendResponse({ error: err.message, needsPermission: true })
          } else {
            sendResponse({ error: err.message })
          }
        })
      return true
    }
  })

  // ─── Port message handler (popup ↔ service worker) ──────────────

  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== "html-markdown-convert") {
      return
    }

    port.onMessage.addListener(async (msg) => {
      if (msg.type !== "start-convert") {
        return
      }

      const { selectors, filename, tabId } = msg

      try {
        // ── Step 1: Pre-flight health check ────────────────────────
        const settings = await getSettings()
        const baseUrl = settings.companionBaseUrl || DEFAULT_BASE_URL
        await healthCheck(baseUrl)
        port.postMessage({ step: "connection", status: "success" })

        // ── Step 2: Extraction ─────────────────────────────────────
        await ensureExtractInjected(tabId)
        const results = await extractSelectors(tabId, selectors)

        // Concatenate HTML
        const concatenatedHtml = results.map((r) => r.html).join("\n\n")
        const byteLength = new TextEncoder().encode(concatenatedHtml).length
        if (byteLength > MAX_HTML_BYTES) {
          throw new Error(
            `Concatenated HTML exceeds ${MAX_HTML_BYTES} bytes (${byteLength} bytes). Reduce the number of selectors.`
          )
        }

        port.postMessage({ step: "extraction", status: "success" })

        // ── Step 3: Upload & Download ──────────────────────────────
        const zipBlob = await postHtmlAndGetZip(baseUrl, concatenatedHtml)
        port.postMessage({ step: "upload", status: "success" })

        // ── Download ZIP ───────────────────────────────────────────
        await downloadZip(zipBlob, filename)

        // ── Notification ───────────────────────────────────────────
        showNotification(
          "Conversion Complete",
          `"${filename}.zip" has been downloaded.`
        )

        port.postMessage({
          step: "done",
          status: "success",
          filename: `${filename}.zip`
        })
      } catch (error) {
        port.postMessage({
          step: "error",
          status: "error",
          message: error.message
        })
        showNotification("Conversion Failed", error.message)
      }
    })
  })

  // ─── Side panel: open on action click ──────────────────────────

  try {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
  } catch (_) {
    // Side panel API may not be available in all Chrome versions
  }
})()
