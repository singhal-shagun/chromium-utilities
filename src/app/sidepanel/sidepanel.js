; (function () {
    "use strict"

    const state = {
        settings: null,
        activeTabId: null,
        activeTabTitle: "page",
        activeTabUrl: "",
        activePickerRow: null
    }

    function $(selector) {
        return document.querySelector(selector)
    }

    /** Format an error for display — includes stack trace when available. */
    function fmtErr(err) {
        if (!err) return "Unknown error"
        const stack = err.stack
        if (stack) return stack
        return err.message || String(err)
    }

    // ─── Initialization ─────────────────────────────────────────────

    function init() {
        function start() {
            bindEvents()
            loadInitialState()
        }

        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", start)
        } else {
            start()
        }

        chrome.runtime.onMessage.addListener(handlePickerSelection)
    }

    function bindEvents() {
        $("#add-row-btn").addEventListener("click", () => addRow())
        $("#convert-btn").addEventListener("click", handleConvert)
    }

    async function loadInitialState() {
        try {
            const settings = await HtmlMarkdownStorage.getSettings()
            state.settings = settings
            const tab = await resolveTab()
            state.activeTabId = tab.tabId
            state.activeTabTitle = tab.title || "page"
            state.activeTabUrl = tab.url || ""
            $("#filename").value = inferFilename(state.activeTabTitle)
            addRow()
            setStatus("Ready. Add selectors and click Convert.", "info")
        } catch (error) {
            setStatus(`Unable to initialize:\n${fmtErr(error)}`, "error")
        }
    }

    // `inferFilename` is provided as a global by src/core/filename.js
    // (loaded in sidepanel.html); it falls back to a built-in basic slug
    // when slug.js is unavailable.

    // ─── Selector row management ────────────────────────────────────

    function addRow(selectorValue = "") {
        const row = document.createElement("div")
        row.className = "row-card"
        row.innerHTML = `
      <input class="selector-input" type="text" placeholder="Selector (e.g. article)" value="${selectorValue}" />
      <div class="row-actions">
        <button class="secondary pick-btn" type="button">Pick element</button>
        <button class="secondary remove-btn" type="button">Remove</button>
      </div>
      <div class="row-status">Enter a selector to validate it.</div>
    `

        row.querySelector(".selector-input").addEventListener("input", () => {
            row.querySelector(".row-status").textContent =
                "Waiting for validation."
            row.querySelector(".row-status").className = "row-status"
        })

        row.querySelector(".pick-btn").addEventListener("click", () =>
            pickElementForRow(row)
        )
        row.querySelector(".remove-btn").addEventListener("click", () => {
            if ($("#rows").children.length > 1) {
                row.remove()
            } else {
                row.querySelector(".selector-input").value = ""
                row.querySelector(".row-status").textContent =
                    "Remove the selector text to clear it."
                row.querySelector(".row-status").className = "row-status"
            }
        })

        $("#rows").appendChild(row)
    }

    // ─── Tab resolution (via service worker) ────────────────────────

    /** Ask the service worker for the active tab of the side panel's window. */
    async function resolveTab() {
        let windowId
        try {
            const win = await chrome.windows.getCurrent()
            if (win && typeof win.id === "number") windowId = win.id
        } catch {
            // Fall back to the service worker's lastFocusedWindow default.
        }
        const resp = await chrome.runtime.sendMessage({
            type: "resolve-tab",
            ...(typeof windowId === "number" ? { windowId } : {})
        })
        if (resp.error) throw new Error(resp.error)
        return resp
    }

    // ─── Element picker ─────────────────────────────────────────────

    /**
     * Request optional host permissions for all http/https pages.
     * Returns true if granted, false otherwise.
     */
    async function requestHostPermission() {
        try {
            return await chrome.permissions.request({
                origins: ["http://*/*", "https://*/*"]
            })
        } catch {
            return false
        }
    }

    /**
     * Send a message to the service worker, retrying once if the
     * response indicates host permission is needed.
     */
    async function sendWithPermissionRetry(msg) {
        const resp = await chrome.runtime.sendMessage(msg)
        if (!resp.needsPermission) return resp

        // Request host permission and retry
        const granted = await requestHostPermission()
        if (!granted) {
            return { error: "Host permission denied. Grant it and try again." }
        }
        // Retry the original message
        return chrome.runtime.sendMessage(msg)
    }

    async function pickElementForRow(row) {
        state.activePickerRow = row
        const pickBtn = row.querySelector(".pick-btn")
        pickBtn.textContent = "Picking…"

        try {
            const tab = await resolveTab()
            state.activeTabId = tab.tabId
            state.activeTabTitle = tab.title || "page"
            state.activeTabUrl = tab.url || ""

            const resp = await sendWithPermissionRetry({
                type: "inject-picker",
                tabId: tab.tabId
            })
            if (resp.error) throw new Error(resp.error)

            setStatus(
                "Hover over the page and click an element to capture its selector.",
                "info"
            )
        } catch (err) {
            pickBtn.textContent = "Pick element"
            setStatus(fmtErr(err), "error")
        }
    }

    /** Handles element-picker selection messages from the content script. */
    function handlePickerSelection(message) {
        if (message && message.type === "html-markdown-picker-selection") {
            if (state.activePickerRow) {
                const pickBtn = state.activePickerRow.querySelector(".pick-btn")
                pickBtn.textContent = "Change element"

                const selectorInput =
                    state.activePickerRow.querySelector(".selector-input")
                selectorInput.value = message.selector
                state.activePickerRow.querySelector(".row-status").textContent =
                    "Selected from page."
                state.activePickerRow.querySelector(".row-status").className =
                    "row-status success"
            }
            state.activePickerRow = null
            setStatus(
                "Selector captured. Validate it before converting.",
                "success"
            )
        }
        if (message && message.type === "html-markdown-picker-cancelled") {
            if (state.activePickerRow) {
                const pickBtn = state.activePickerRow.querySelector(".pick-btn")
                pickBtn.textContent = "Pick element"
            }
            state.activePickerRow = null
            setStatus("Picker cancelled.", "info")
        }
    }

    // ─── Convert flow ───────────────────────────────────────────────

    async function handleConvert() {
        try {
            const tab = await resolveTab()
            state.activeTabId = tab.tabId
            state.activeTabTitle = tab.title || "page"
            state.activeTabUrl = tab.url || ""

            // Check permission before starting the full convert flow
            const permCheck = await sendWithPermissionRetry({
                type: "check-permission",
                tabId: tab.tabId
            })
            if (permCheck.error) throw new Error(permCheck.error)
        } catch (err) {
            setStatus(fmtErr(err), "error")
            return
        }

        // Collect selectors from rows
        const rows = Array.from($("#rows").children)
        const selectorValues = []
        const errors = []

        for (const row of rows) {
            const selector = row.querySelector(".selector-input").value.trim()
            if (!selector) {
                continue
            }

            // Validate selector (exactly one match)
            const validation = await validateSelector(selector)
            if (!validation.ok) {
                errors.push(validation.error)
                const statusEl = row.querySelector(".row-status")
                statusEl.textContent = validation.error
                statusEl.className = "row-status error"
                continue
            }

            selectorValues.push(selector)
            const statusEl = row.querySelector(".row-status")
            statusEl.textContent = `Matched 1 element (${validation.html.length} chars).`
            statusEl.className = "row-status success"
        }

        if (errors.length) {
            setStatus(errors.join(" "), "error")
            return
        }

        if (!selectorValues.length) {
            setStatus("Add at least one selector before converting.", "error")
            return
        }

        // Disable UI during conversion
        setConverting(true)
        resetStepIndicators()
        setStatus("Starting conversion…", "info")

        const filename = (
            $("#filename").value || inferFilename(state.activeTabTitle)
        ).replace(/\.md$/i, "")

        // Open a port to the background service worker
        let port
        try {
            port = chrome.runtime.connect({ name: "html-markdown-convert" })
        } catch (connError) {
            setStatus(
                `Failed to connect to extension:\n${fmtErr(connError)}`,
                "error"
            )
            setConverting(false)
            return
        }

        // Handle messages from the service worker
        port.onMessage.addListener((msg) => {
            switch (msg.step) {
                case "connection":
                    updateStep("connection", msg.status === "success")
                    setStatus(
                        "Companion app reachable. Extracting elements…",
                        "info"
                    )
                    break

                case "extraction":
                    updateStep("extraction", msg.status === "success")
                    setStatus(
                        "Elements extracted. Sending to companion app…",
                        "info"
                    )
                    break

                case "upload":
                    updateStep("upload", msg.status === "success")
                    setStatus("Upload successful. Downloading ZIP…", "info")
                    break

                case "done":
                    setStatus(
                        `Conversion complete. "${msg.filename}" downloaded.`,
                        "success"
                    )
                    setConverting(false)
                    port.disconnect()
                    break

                case "error":
                    setStatus(msg.message || "Conversion failed.", "error")
                    setConverting(false)
                    port.disconnect()
                    break
            }
        })

        port.onDisconnect.addListener(() => {
            if (chrome.runtime.lastError) {
                setStatus(
                    `Connection lost: ${chrome.runtime.lastError.message}`,
                    "error"
                )
                setConverting(false)
            }
        })

        // Send the convert request
        port.postMessage({
            type: "start-convert",
            selectors: selectorValues,
            filename: filename,
            tabId: state.activeTabId,
            url: state.activeTabUrl
        })
    }

    // ─── Selector validation ────────────────────────────────────────

    async function validateSelector(selector) {
        try {
            const tab = await resolveTab()
            state.activeTabId = tab.tabId

            const resp = await sendWithPermissionRetry({
                type: "validate-selector",
                tabId: tab.tabId,
                selector
            })

            if (!resp || !resp.ok) {
                return { ok: false, error: resp?.error || "Validation failed." }
            }

            return {
                ok: true,
                html: resp.html,
                count: resp.count
            }
        } catch (error) {
            return { ok: false, error: fmtErr(error) }
        }
    }

    // ─── Step indicator helpers ─────────────────────────────────────

    function resetStepIndicators() {
        document.querySelectorAll(".step").forEach((el) => {
            el.classList.remove("success", "error", "active")
            el.querySelector(".step-icon").textContent = "○"
            el.querySelector(".step-status").textContent = ""
        })
    }

    function updateStep(stepName, isSuccess) {
        const el = document.querySelector(`.step[data-step="${stepName}"]`)
        if (!el) {
            return
        }

        el.classList.remove("active")
        if (isSuccess) {
            el.classList.add("success")
            el.querySelector(".step-icon").textContent = "✓"
            el.querySelector(".step-status").textContent = "Done"
        } else {
            el.classList.add("error")
            el.querySelector(".step-icon").textContent = "✗"
            el.querySelector(".step-status").textContent = "Failed"
        }
    }

    function setConverting(active) {
        $("#convert-btn").disabled = active
        $("#add-row-btn").disabled = active
        if (active) {
            $("#convert-btn").textContent = "Converting…"
        } else {
            $("#convert-btn").textContent = "Convert"
        }
    }

    // ─── Status display ─────────────────────────────────────────────

    function setStatus(message, type) {
        const statusEl = $("#status")
        statusEl.textContent = message || ""
        statusEl.className = `status ${type || ""}`.trim()
    }

    // ─── Start ──────────────────────────────────────────────────────

    init()
})()
