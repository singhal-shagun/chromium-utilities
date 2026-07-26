; (function () {
    "use strict"

    importScripts("../core/constants.js")

    const DEFAULT_BASE_URL = globalThis.COMPANION_DEFAULT_BASE_URL
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
        let response
        try {
            response = await fetch(url, {
                method: "GET",
                signal: AbortSignal.timeout(5000)
            })
        } catch (err) {
            // fetch throws a generic "Failed to fetch" (TypeError) when the
            // companion app is not running / not reachable. Make it actionable.
            throw new Error(
                `Companion app not reachable at ${baseUrl}. ` +
                `Make sure it is running and allowed (host_permissions). ` +
                `Original error: ${err.message}`
            )
        }
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

    // ─── Service worker keep-alive ──────────────────────────────────
    // MV3 service workers are killed after ~30s of inactivity. A pending
    // fetch() that is simply waiting for a response does NOT count as
    // activity, so long-running companion calls get interrupted. Writing
    // to chrome.storage.local (or any extension API) resets the idle
    // timer, keeping the worker alive while the request waits.
    function createHeartbeat(intervalMs = 20000) {
        let timer = null
        const tick = () => {
            // Trivial write — the call itself (not the value) resets the
            // service worker idle timer. 20s < 30s leaves a safe margin.
            chrome.storage.local
                .set({ __swHeartbeat: Date.now() })
                .catch(() => { })
        }
        return {
            start() {
                if (timer) return
                tick()
                timer = setInterval(tick, intervalMs)
            },
            stop() {
                if (timer) {
                    clearInterval(timer)
                    timer = null
                }
            }
        }
    }

    // ─── POST to companion ──────────────────────────────────────────

    async function postHtmlAndGetZip(baseUrl, concatenatedHtml, pageUrl) {
        const url = `${baseUrl.replace(/\/+$/, "")}/api/html-elements-to-markdown`
        // Keep the service worker alive across a slow companion response.
        const heartbeat = createHeartbeat()
        heartbeat.start()
        try {
            const response = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json; charset=utf-8" },
                // Send the source page URL so the companion can resolve relative
                // <img> src attributes (e.g. `/assets/...`) to their real origin.
                body: JSON.stringify({
                    html: concatenatedHtml,
                    url: pageUrl || null
                })
            })
            if (!response.ok) {
                let detail = ""
                try {
                    const body = await response.text()
                    detail = body ? ` — ${body.slice(0, 500)}` : ""
                } catch {
                    // ignore read errors
                }
                throw new Error(
                    `Companion app returned ${response.status}${detail}`
                )
            }
            // The response is a ZIP archive (binary blob)
            const blob = await response.blob()
            return blob
        } finally {
            heartbeat.stop()
        }
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
        const iconUrl = chrome.runtime.getURL("icons/icon128.png")
        const baseOpts = {
            type: "basic",
            title: title,
            message: message,
            contextMessage: "HTML → Markdown"
        }

        // Pass a callback (not a promise) so the async image-download failure
        // from Chrome's notification internals cannot surface as an
        // "Uncaught (in promise)" rejection in the extension's error log.
        chrome.notifications.create({ ...baseOpts, iconUrl }, () => {
            if (chrome.runtime.lastError) {
                // Icon was missing/unreachable ("Unable to download all specified
                // images") — retry without an icon so the notification still shows.
                const err = chrome.runtime.lastError.message || ""
                if (/image/i.test(err)) {
                    chrome.notifications.create(baseOpts, () => { })
                }
            }
        })
    }

    // ─── Message handler (side panel ↔ service worker) ─────────────

    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
        // Probe a tab to check if we have injection permission
        if (msg.type === "check-permission") {
            chrome.scripting
                .executeScript({
                    target: { tabId: msg.tabId },
                    func: () => true
                })
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

        // Resolve the active tab (service worker has activeTab access).
        // Scope the query to the side panel's own window when provided, so the
        // filename reflects the tab the user actually opened the panel in
        // (rather than whatever window was last focused).
        if (msg.type === "resolve-tab") {
            const query = Number.isInteger(msg.windowId)
                ? { active: true, windowId: msg.windowId }
                : { active: true, lastFocusedWindow: true }
            chrome.tabs
                .query(query)
                .then((tabs) => {
                    if (tabs.length > 0) {
                        sendResponse({
                            tabId: tabs[0].id,
                            title: tabs[0].title || "page",
                            // `url` is available here under the same activeTab /
                            // host-permission gating that already gives us `title`.
                            url: tabs[0].url
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
                        sendResponse({
                            error: err.message,
                            needsPermission: true
                        })
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
                    sendResponse(
                        result || { ok: false, error: "No result from page." }
                    )
                })
                .catch((err) => {
                    if (/cannot access/i.test(err.message)) {
                        sendResponse({
                            error: err.message,
                            needsPermission: true
                        })
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

            const { selectors, filename, tabId, url } = msg

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
                const byteLength = new TextEncoder().encode(
                    concatenatedHtml
                ).length
                if (byteLength > MAX_HTML_BYTES) {
                    throw new Error(
                        `Concatenated HTML exceeds ${MAX_HTML_BYTES} bytes (${byteLength} bytes). Reduce the number of selectors.`
                    )
                }

                port.postMessage({ step: "extraction", status: "success" })

                // ── Step 3: Upload & Download ──────────────────────────────
                // Determine the source page URL so the companion can resolve
                // relative asset URLs (e.g. `/assets/...`) against the real
                // origin. Prefer the URL the side panel captured at resolve-tab
                // time (msg.url); fall back to querying the tab directly. If
                // neither is available, the companion falls back to localhost.
                let pageUrl =
                    typeof url === "string" && url.trim()
                        ? url.trim()
                        : undefined
                if (!pageUrl && tabId != null) {
                    try {
                        const tab = await chrome.tabs.get(tabId)
                        pageUrl = tab?.url
                    } catch {
                        pageUrl = undefined
                    }
                }

                const zipBlob = await postHtmlAndGetZip(
                    baseUrl,
                    concatenatedHtml,
                    pageUrl
                )
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
