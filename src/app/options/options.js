; (function () {
    const companionInput = document.getElementById("companion-base-url")
    const statusEl = document.getElementById("status")
    const DEFAULT_URL = globalThis.COMPANION_DEFAULT_BASE_URL

    /** Origins that are always covered by manifest host_permissions. */
    const ALWAYS_PERMITTED_ORIGINS = ["https://api.shagun-agent.localhost"]

    async function loadSettings() {
        const settings = await HtmlMarkdownStorage.getSettings()
        companionInput.placeholder = DEFAULT_URL
        companionInput.value = settings.companionBaseUrl || DEFAULT_URL
    }

    async function saveSettings() {
        const value = (companionInput.value || "").trim()
        const normalized = value || DEFAULT_URL
        await HtmlMarkdownStorage.saveSettings({ companionBaseUrl: normalized })

        // Request optional host permission if the URL points to a non-local origin
        const origin = extractOrigin(normalized)
        if (origin && !ALWAYS_PERMITTED_ORIGINS.includes(origin)) {
            try {
                const granted = await chrome.permissions.request({
                    origins: [origin + "/*"]
                })
                if (!granted) {
                    setStatus(
                        `Permission for ${origin} was denied. The companion app won't be reachable until granted.`,
                        "error"
                    )
                    return
                }
            } catch (permError) {
                setStatus(
                    `Permission request failed: ${permError.message}`,
                    "error"
                )
                return
            }
        }

        setStatus("Saved companion app URL.", "success")
    }

    /** Extract the origin (scheme + host) from a URL string. */
    function extractOrigin(url) {
        try {
            const parsed = new URL(url)
            return `${parsed.protocol}//${parsed.hostname}${parsed.port ? ":" + parsed.port : ""}`
        } catch {
            return null
        }
    }

    async function testConnection() {
        const baseUrl =
            (companionInput.value || "").trim() || DEFAULT_URL
        setStatus("Testing companion app connection…", "info")

        try {
            const response = await fetch(
                `${baseUrl.replace(/\/+$/, "")}/api/companion-app-connection-test`,
                {
                    method: "GET"
                }
            )
            if (!response.ok) {
                throw new Error(`Health check returned ${response.status}`)
            }
            setStatus("Companion app responded successfully.", "success")
        } catch (error) {
            setStatus(`Companion app is unavailable: ${error.message}`, "error")
        }
    }

    function setStatus(message, type) {
        statusEl.textContent = message
        statusEl.className = `status ${type || ""}`.trim()
    }

    document.getElementById("save-btn").addEventListener("click", saveSettings)
    document
        .getElementById("test-btn")
        .addEventListener("click", testConnection)

    loadSettings().catch((error) => {
        setStatus(`Unable to load settings: ${error.message}`, "error")
    })
})()
