;(function (global) {
    function slugify(value) {
        if (typeof value !== "string") {
            return "page"
        }

        return (
            value
                .toLowerCase()
                .trim()
                .normalize("NFKD")
                .replace(/[\u0300-\u036f]/g, "")
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/(^-|-$)/g, "") || "page"
        )
    }

    global.slugify = slugify

    if (typeof module !== "undefined" && module.exports) {
        module.exports = { slugify }
    }
})(typeof window !== "undefined" ? window : globalThis)
