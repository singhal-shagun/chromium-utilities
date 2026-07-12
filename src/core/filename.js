;(function (global) {
    /** Basic slug fallback used when slug.js is unavailable. */
    function basicSlugify(text) {
        return String(text)
            .toLowerCase()
            .trim()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/(^-|-$)/g, "")
    }

    function inferFilename(title) {
        const slug =
            (typeof slugify === "function"
                ? slugify(title)
                : basicSlugify(title)) || "page"
        return slug + ".md"
    }

    global.inferFilename = inferFilename

    if (typeof module !== "undefined" && module.exports) {
        module.exports = { inferFilename }
    }
})(typeof window !== "undefined" ? window : globalThis)
