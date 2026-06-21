(function () {
  const DEFAULT_MAX_BYTES = 200 * 1024;
  const state = {
    settings: null,
    activeTabId: null,
    activeTabTitle: 'page',
    activePickerRow: null,
    lastMarkdown: ''
  };

  function $(selector) {
    return document.querySelector(selector);
  }

  function init() {
    function start() {
      bindEvents();
      loadInitialState();
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', start);
    } else {
      start();
    }

    chrome.runtime.onMessage.addListener(handleRuntimeMessage);
  }

  function bindEvents() {
    $('#add-row-btn').addEventListener('click', () => addRow());
    $('#convert-btn').addEventListener('click', handleConvert);
    $('#copy-btn').addEventListener('click', copyMarkdown);
  }

  async function loadInitialState() {
    try {
      const settings = await HtmlMarkdownStorage.getSettings();
      state.settings = settings;
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      state.activeTabId = tab.id;
      state.activeTabTitle = tab.title || 'page';
      $('#filename').value = HtmlMarkdownPopup.inferFilename(state.activeTabTitle);
      addRow();
      await ensureInjected('extract');
      await ensureInjected('picker');
      setStatus('Ready to validate selectors.', 'info');
    } catch (error) {
      setStatus(`Unable to initialize popup: ${error.message}`, 'error');
    }
  }

  function addRow(selectorValue = '') {
    const row = document.createElement('div');
    row.className = 'row-card';
    row.innerHTML = `
      <input class="selector-input" type="text" placeholder="Selector (e.g. article)" value="${selectorValue}" />
      <div class="row-actions">
        <button class="secondary pick-btn" type="button">Pick element</button>
        <button class="secondary remove-btn" type="button">Remove</button>
      </div>
      <div class="row-status">Enter a selector to validate it.</div>
    `;

    row.querySelector('.selector-input').addEventListener('input', () => {
      row.querySelector('.row-status').textContent = 'Waiting for validation.';
      row.querySelector('.row-status').className = 'row-status';
    });

    row.querySelector('.pick-btn').addEventListener('click', () => pickElementForRow(row));
    row.querySelector('.remove-btn').addEventListener('click', () => {
      if ($('#rows').children.length > 1) {
        row.remove();
      } else {
        row.querySelector('.selector-input').value = '';
        row.querySelector('.row-status').textContent = 'Remove the selector text to clear it.';
        row.querySelector('.row-status').className = 'row-status';
      }
    });

    $('#rows').appendChild(row);
  }

  async function ensureInjected(kind) {
    if (!state.activeTabId) {
      return;
    }

    try {
      const files = kind === 'extract' ? ['src/content-scripts/extract.js'] : ['src/content-scripts/picker.js'];
      await chrome.scripting.executeScript({
        target: { tabId: state.activeTabId },
        files
      });
    } catch (error) {
      console.warn(`Unable to inject ${kind} content script`, error);
    }
  }

  async function pickElementForRow(row) {
    if (!state.activeTabId) {
      setStatus('Open a page tab first.', 'error');
      return;
    }

    state.activePickerRow = row;
    await ensureInjected('picker');
    try {
      await chrome.tabs.sendMessage(state.activeTabId, { type: 'html-markdown-picker-start' });
      setStatus('Hover over the page and click an element to capture its selector.', 'info');
    } catch (error) {
      setStatus(`Picker was unavailable: ${error.message}`, 'error');
    }
  }

  function handleRuntimeMessage(message) {
    if (message && message.type === 'html-markdown-picker-selection') {
      if (state.activePickerRow) {
        const selectorInput = state.activePickerRow.querySelector('.selector-input');
        selectorInput.value = message.selector;
        state.activePickerRow.querySelector('.row-status').textContent = 'Selected from page.';
        state.activePickerRow.querySelector('.row-status').className = 'row-status success';
      }
      setStatus('Selector captured. Validate it before converting.', 'success');
    }
  }

  async function handleConvert() {
    setStatus('Validating selectors…', 'info');

    const rows = Array.from($('#rows').children);
    const selectors = [];
    const errors = [];

    for (const row of rows) {
      const selectorInput = row.querySelector('.selector-input');
      const selector = selectorInput.value.trim();
      if (!selector) {
        continue;
      }

      const validation = await validateSelector(selector);
      if (!validation.ok) {
        errors.push(validation.error);
        const statusEl = row.querySelector('.row-status');
        statusEl.textContent = validation.error;
        statusEl.className = 'row-status error';
        continue;
      }

      selectors.push({ selector, html: validation.html });
      const statusEl = row.querySelector('.row-status');
      statusEl.textContent = `Matched 1 element (${validation.html.length} chars).`;
      statusEl.className = 'row-status success';
    }

    if (errors.length) {
      setStatus(errors.join(' '), 'error');
      return;
    }

    if (!selectors.length) {
      setStatus('Add at least one selector before converting.', 'error');
      return;
    }

    const concatenatedHtml = selectors.map((entry) => entry.html).join('\n\n');
    const byteLength = new TextEncoder().encode(concatenatedHtml).length;
    if (byteLength > DEFAULT_MAX_BYTES) {
      setStatus(`Concatenated HTML is too large (${byteLength} bytes). Keep it below ${DEFAULT_MAX_BYTES} bytes.`, 'error');
      return;
    }

    const markdown = await convertHtmlToMarkdown(concatenatedHtml, selectors);
    state.lastMarkdown = markdown;
    $('#markdown-output').value = markdown;
    $('#markdown-output').parentElement.classList.add('has-output');
    try {
      await HtmlMarkdownPopup.downloadMarkdown(markdown, $('#filename').value || HtmlMarkdownPopup.inferFilename(state.activeTabTitle));
      setStatus('Markdown downloaded. You can also copy the preview above.', 'success');
    } catch (error) {
      $('#markdown-output').hidden = false;
      $('#copy-btn').hidden = false;
      setStatus(`Download was blocked or failed: ${error.message}. The markdown preview is ready to copy.`, 'error');
    }
  }

  async function validateSelector(selector) {
    if (!state.activeTabId) {
      return { ok: false, error: 'No active tab available.' };
    }

    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: state.activeTabId },
        func: (value) => {
          if (typeof window.__HTML_TO_MD_EXTRACT === 'function') {
            return window.__HTML_TO_MD_EXTRACT(value);
          }
          return { ok: false, count: 0, html: '', error: 'Extract helper is unavailable.' };
        },
        args: [selector]
      });

      const firstResult = results && results[0] && results[0].result;
      if (!firstResult) {
        return { ok: false, error: 'Validation did not return a result.' };
      }

      if (!firstResult.ok) {
        return { ok: false, error: firstResult.error || 'Selector validation failed.' };
      }

      return {
        ok: true,
        html: firstResult.html,
        count: firstResult.count
      };
    } catch (error) {
      return { ok: false, error: error.message || 'Selector validation failed.' };
    }
  }

  async function convertHtmlToMarkdown(concatenatedHtml) {
    const baseUrl = (state.settings && state.settings.companionBaseUrl) || 'http://localhost:3000';
    try {
      const response = await fetch(`${baseUrl}/html-elements-to-markdown`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        body: concatenatedHtml
      });

      if (!response.ok) {
        throw new Error(`Companion app returned ${response.status}`);
      }

      const markdown = await response.text();
      if (markdown && markdown.trim()) {
        return markdown;
      }
    } catch (error) {
      console.warn('Companion conversion failed, using fallback.', error);
    }

    return buildFallbackMarkdown(concatenatedHtml);
  }

  function buildFallbackMarkdown(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const sections = Array.from(doc.body.children || []).map((element) => {
      const text = element.textContent.replace(/\s+/g, ' ').trim();
      const heading = text.slice(0, 40) || 'Section';
      return `## ${heading}\n\n${text}`;
    });

    return sections.join('\n\n') || '# Converted page\n\nNo content was extracted.';
  }

  async function copyMarkdown() {
    if (!state.lastMarkdown) {
      return;
    }

    try {
      await navigator.clipboard.writeText(state.lastMarkdown);
      setStatus('Markdown copied to clipboard.', 'success');
    } catch (error) {
      setStatus(`Copy failed: ${error.message}`, 'error');
    }
  }

  function setStatus(message, type) {
    const statusEl = $('#status');
    statusEl.textContent = message || '';
    statusEl.className = `status ${type || ''}`.trim();
  }

  init();
})();
