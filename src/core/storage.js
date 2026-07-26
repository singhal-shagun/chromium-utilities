; (function (global) {
    const DEFAULT_SETTINGS = {
        companionBaseUrl: global.COMPANION_DEFAULT_BASE_URL
    }

    function getSettings() {
        return new Promise((resolve, reject) => {
            chrome.storage.sync.get(DEFAULT_SETTINGS, (result) => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError)
                    return
                }
                resolve({ ...DEFAULT_SETTINGS, ...result })
            })
        })
    }

    function saveSettings(settings) {
        return new Promise((resolve, reject) => {
            const syncSettings = {
                companionBaseUrl:
                    settings.companionBaseUrl ||
                    DEFAULT_SETTINGS.companionBaseUrl
            }

            chrome.storage.sync.set(syncSettings, () => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError)
                    return
                }
                resolve()
            })
        })
    }

    global.HtmlMarkdownStorage = {
        DEFAULT_SETTINGS,
        getSettings,
        saveSettings
    }

    if (typeof module !== "undefined" && module.exports) {
        module.exports = {
            DEFAULT_SETTINGS,
            getSettings,
            saveSettings
        }
    }
})(typeof window !== "undefined" ? window : globalThis)
