;(function () {
  function extractBySelector(selector) {
    if (typeof selector !== "string" || !selector.trim()) {
      return {
        ok: false,
        count: 0,
        html: "",
        error: "Selector is empty."
      }
    }

    try {
      const elements = Array.from(document.querySelectorAll(selector))
      if (elements.length !== 1) {
        return {
          ok: false,
          count: elements.length,
          html: "",
          error:
            elements.length === 0
              ? "No elements matched."
              : "Multiple elements matched."
        }
      }

      return {
        ok: true,
        count: 1,
        html: elements[0].outerHTML,
        error: ""
      }
    } catch (error) {
      return {
        ok: false,
        count: 0,
        html: "",
        error: error.message || "Unable to evaluate selector."
      }
    }
  }

  window.__HTML_TO_MD_EXTRACT = extractBySelector
})()
