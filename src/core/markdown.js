// src/core/markdown.js
// Convert a Markdown string to a URL suitable for chrome.downloads.download.
// We prefer a Blob URL (reliable for large content and unusual MIME types)
// and fall back to a data: URL if Blob construction fails.

export function toDownloadUrl(md) {
  try {
    if (typeof Blob !== "undefined" && typeof URL !== "undefined" && URL.createObjectURL) {
      const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
      return { url: URL.createObjectURL(blob), kind: "blob" };
    }
  } catch (_) {
    // fall through
  }
  return { url: toDataUrl(md), kind: "data" };
}

export function toDataUrl(md) {
  // encodeURIComponent is sufficient for ASCII and percent-encodes all unsafe chars.
  // We split and rejoin to avoid the %-encoding limit issues in some browsers.
  const encoded = encodeURIComponent(md);
  return `data:text/markdown;charset=utf-8,${encoded}`;
}
