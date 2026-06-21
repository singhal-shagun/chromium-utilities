(function (global) {
  function toDataUrl(markdown) {
    return 'data:text/markdown;charset=utf-8,' + encodeURIComponent(markdown || '');
  }

  function normalizeFilename(filename) {
    const base = (filename || '').trim() || 'converted';
    return /\.md$/i.test(base) ? base : `${base}.md`;
  }

  function inferFilename(tabTitle) {
    if (typeof global.slugify === 'function') {
      return `${global.slugify(tabTitle || 'page') || 'page'}.md`;
    }
    return 'page.md';
  }

  function downloadMarkdown(markdown, filename) {
    return new Promise((resolve, reject) => {
      const safeName = normalizeFilename(filename);
      const url = toDataUrl(markdown);

      chrome.downloads.download(
        {
          url,
          filename: safeName,
          saveAs: true
        },
        (downloadId) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
            return;
          }

          if (!downloadId) {
            reject(new Error('Download was blocked'));
            return;
          }

          resolve({ ok: true, downloadId });
        }
      );
    });
  }

  global.HtmlMarkdownPopup = global.HtmlMarkdownPopup || {};
  global.HtmlMarkdownPopup.toDataUrl = toDataUrl;
  global.HtmlMarkdownPopup.downloadMarkdown = downloadMarkdown;
  global.HtmlMarkdownPopup.inferFilename = inferFilename;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      toDataUrl,
      downloadMarkdown,
      inferFilename,
      normalizeFilename
    };
  }
})(typeof window !== 'undefined' ? window : globalThis);
