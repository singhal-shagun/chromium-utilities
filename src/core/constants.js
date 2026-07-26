; (function (global) {
    /**
     * The default base URL of the companion app.
     *
     * With portless integration this is a stable, named HTTPS URL.
     * Change this in one place — every module that needs a fallback
     * reads it from this global.
     */
    const COMPANION_DEFAULT_BASE_URL = "https://api.shagun-agent.localhost"

    global.COMPANION_DEFAULT_BASE_URL =
        global.COMPANION_DEFAULT_BASE_URL || COMPANION_DEFAULT_BASE_URL
})(typeof window !== "undefined" ? window : globalThis)
