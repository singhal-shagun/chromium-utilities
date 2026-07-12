;(function (global) {
    const DEFAULT_SETTINGS = {
        companionBaseUrl: "http://localhost:3000",
        lastFilename: ""
    }

    function getSettings() {
        return Promise.all([
            new Promise((resolve, reject) => {
                chrome.storage.sync.get(DEFAULT_SETTINGS, (result) => {
                    if (chrome.runtime.lastError) {
                        reject(chrome.runtime.lastError)
                        return
                    }
                    resolve(result)
                })
            }),
            new Promise((resolve, reject) => {
                chrome.storage.local.get({ lastFilename: "" }, (result) => {
                    if (chrome.runtime.lastError) {
                        reject(chrome.runtime.lastError)
                        return
                    }
                    resolve(result)
                })
            })
        ]).then(([syncSettings, localSettings]) => ({
            ...DEFAULT_SETTINGS,
            ...syncSettings,
            ...localSettings
        }))
    }

    function saveSettings(settings) {
        return new Promise((resolve, reject) => {
            const syncSettings = {
                companionBaseUrl:
                    settings.companionBaseUrl ||
                    DEFAULT_SETTINGS.companionBaseUrl
            }
            const localSettings = {
                lastFilename: settings.lastFilename || ""
            }

            chrome.storage.sync.set(syncSettings, () => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError)
                    return
                }

                chrome.storage.local.set(localSettings, () => {
                    if (chrome.runtime.lastError) {
                        reject(chrome.runtime.lastError)
                        return
                    }
                    resolve()
                })
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
