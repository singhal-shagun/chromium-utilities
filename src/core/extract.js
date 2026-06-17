// src/core/extract.js
// Injected into the target tab via chrome.scripting.executeScript({files: [...]).
// Exposes window.__extractBySelector(selector) which returns
// { ok, count, html?, error? }.
//
// Must be self-contained: no imports, no references to extension globals.

(function () {
  "use strict";

  function extractBySelector(selector) {
    if (typeof selector !== "string" || !selector.trim()) {
      return { ok: false, count: 0, error: "Selector is empty" };
    }

    let matches;
    try {
      matches = document.querySelectorAll(selector);
    } catch (e) {
      return {
        ok: false,
        count: 0,
        error: "Invalid selector: " + (e && e.message ? e.message : String(e)),
      };
    }

    if (matches.length === 0) {
      return { ok: false, count: 0, error: "No element matched selector" };
    }
    if (matches.length > 1) {
      return {
        ok: false,
        count: matches.length,
        error: "Selector matched " + matches.length + " elements, expected exactly 1",
      };
    }

    return { ok: true, count: 1, html: matches[0].outerHTML };
  }

  window.__extractBySelector = extractBySelector;
})();
