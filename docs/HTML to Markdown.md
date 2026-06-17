# Plan: HTML→Markdown via LLM (Chromium MV3 extension) — v3

**TL;DR** — Add a "HTML → Markdown via LLM" feature. The popup provides a **dynamic row list**: each row = JS selector + optional label. On Convert, the extension validates each row (each must match **exactly one** element in the active tab), concatenates the `outerHTML`s in row order with blank lines, sends them to a user-configured OpenAI-compatible chat-completions endpoint, and downloads the result as a `.md` file. Filename is inferred from the active tab's title (slugified). Endpoint / API key / model are configured on the Options page; API key in `chrome.storage.local`, rest in `chrome.storage.sync`.

## What changed from v2
- **Removed `defaultFilename` everywhere.** Filename is always inferred from the active tab's title in `popup.js` via `slugify(tab.title) || 'converted'`. No default-filename setting in storage, no field on the Options page, no UI for it in the popup.

## What changed from v1 (recap)
1. Multi-selector support is first-class — popup is a row list.
2. Selector fields start empty with placeholder text; the **filename** is pre-filled from the tab title.
3. Options "Test connection" uses `max_tokens: 5`.
4. 200 KB concatenated-HTML size guard.
5. `src/core/extract.js` extracted as a shared module.

## UI sketch for the multi-selector case
```
┌──────────────────────────────────────────┐
│ HTML → Markdown via LLM                  │
├──────────────────────────────────────────┤
│ Filename: my-article.md        (read‑only)│
│                                          │
│ ┌─ Row 1 ──────────────────────────────┐ │
│ │ Selector: [article h1       ] [×]    │ │
│ │ Label:    [Title            ]        │ │
│ └──────────────────────────────────────┘ │
│ ┌─ Row 2 ──────────────────────────────┐ │
│ │ Selector: [article .body    ] [×]    │ │
│ │ Label:    [Body             ]        │ │
│ └──────────────────────────────────────┘ │
│                                          │
│ [ + Add row ]                            │
│                                          │
│ [ Convert ]                              │
│ Status: 2 of 2 selectors valid ✓         │
└──────────────────────────────────────────┘
```

## Architecture
All files are new; the repo is a scaffold (only `package.json`, `README.md`, `SYSTEM.MD`, `icon.png` exist).

| File | Purpose |
|---|---|
| `d:\Tutorials\Javascript\chromium-utilities\manifest.json` | MV3 manifest. Permissions: `activeTab`, `scripting`, `storage`, `downloads`. No `host_permissions`. |
| `d:\Tutorials\Javascript\chromium-utilities\src\core\llm.js` | `chatCompletions({baseUrl, apiKey, model, messages, maxTokens})`. Normalizes baseUrl, appends `/v1/chat/completions`. Throws on non-2xx with status + body. |
| `d:\Tutorials\Javascript\chromium-utilities\src\core\storage.js` | `getSettings()` / `saveSettings(s)`. Splits: `apiKey` in `chrome.storage.local`; `baseUrl`, `model` in `chrome.storage.sync`. Defaults: `https://api.openai.com`, `gpt-4o-mini`. |
| `d:\Tutorials\Javascript\chromium-utilities\src\core\markdown.js` | `toDataUrl(md)` → `data:text/markdown;charset=utf-8,<encoded>`. |
| `d:\Tutorials\Javascript\chromium-utilities\src\core\slug.js` | `slugify(text)`. |
| `d:\Tutorials\Javascript\chromium-utilities\src\core\filename.js` | `inferFilename(tabTitle)` — `slugify(tabTitle) + '.md'`, falls back to `'converted.md'` on empty/missing title. |
| `d:\Tutorials\Javascript\chromium-utilities\src\core\extract.js` | `extractBySelector(selector)` — `document.querySelector`, returns `{ok, count, html?, error?}`. Injected via `executeScript`. |
| `d:\Tutorials\Javascript\chromium-utilities\src\app\popup\popup.html` | Row-list template, read-only filename input, Add-row + Convert buttons, status area. |
| `d:\Tutorials\Javascript\chromium-utilities\src\app\popup\popup.css` | Row, error, spinner, status styles. |
| `d:\Tutorials\Javascript\chromium-utilities\src\app\popup\popup.js` | Row CRUD, per-row validation, size guard, LLM call, download. All `addEventListener` inside the load handler. |
| `d:\Tutorials\Javascript\chromium-utilities\src\app\options\options.html` + `.css` + `.js` | Form: baseUrl, apiKey (type=password), model. Save + Test-connection. **No defaultFilename field.** |
| `d:\Tutorials\Javascript\chromium-utilities\package.json` | Remove placeholder `manifest` key (cleanup, last step). |

## Data flow
1. Popup opens → one default empty row. Filename input is **read-only** and pre-filled by `popup.js` from `chrome.tabs.query({active, currentWindow: true})` → `slugify(tab.title) || 'converted'` + `.md`.
2. User types selectors (and optional labels) into one or more rows. "Add row" clones the template.
3. Click **Convert**. Button disabled, "Converting…", spinner.
4. For each non-empty selector: `chrome.scripting.executeScript({target: {tabId}, func: extractBySelector, args: [selector]})`. Any row returning `ok: false` gets `.row--error` with the message; Convert aborts. Status: "N of M selectors valid".
5. All valid → compute concatenated `outerHTML` length. If > 200 KB, abort with "HTML too large, narrow your selectors".
6. Concatenate with `\n\n`. Call `chatCompletions` with:
   - system: "Convert the following HTML (a sequence of selected elements) to clean, semantic Markdown. Strip scripts, styles, ads, and navigation. Keep each element as a coherent section in the order presented. Output only the Markdown."
   - user: `\`\`\`html\n${concatenated}\n\`\`\``
7. On success: `chrome.downloads.download({url: toDataUrl(md), filename, saveAs: true})`. If blocked, show `<textarea readonly>` + Copy button in the popup.
8. Status: "Downloaded as {filename}".

## Steps
1. **`manifest.json`** at repo root. *Independent.*
2. **`src/core/llm.js`**. *Independent.*
3. **`src/core/storage.js`**. *Independent.*
4. **`src/core/markdown.js`**. *Independent.*
5. **`src/core/slug.js`**. *Independent.*
6. **`src/core/filename.js`** — `inferFilename(tabTitle)`. *Independent.*
7. **`src/core/extract.js`**. *Independent.*
8. **Options page** (`options.html` + `.css` + `.js`) — form fields: baseUrl, apiKey (type=password), model. Save + Test-connection (uses `max_tokens: 5`). *No defaultFilename field.* *Depends on 2, 3.*
9. **Popup** (`popup.html` + `.css` + `.js`) — row-list flow, read-only filename input, validation, size guard, LLM call, download. *Depends on 2, 3, 4, 5, 6, 7.*
10. **Remove placeholder `manifest` key from `package.json`** (cleanup).

Steps 1–7 are mutually independent. Step 8 depends on 2, 3. Step 9 depends on 2, 3, 4, 5, 6, 7. Step 10 is last.

## Verification
1. `chrome://extensions` → Developer Mode → "Load unpacked" → repo root → no manifest errors.
2. Options → fill baseUrl / API key / model, Save → green "Saved". Test connection → green "OK" (`max_tokens: 5`).
3. **Single-row happy path**: page with unique article. Popup → row 1: `article` → filename auto-filled from tab title → Convert → spinner → "Save As" dialog → file is clean Markdown of the article, filename matches the slugified tab title.
4. **Multi-row happy path**: same page, two rows: `article h1` and `article .body` → Convert → downloaded `.md` contains both sections in order; filename still inferred from tab title.
5. **Filename inference**: open the popup on a page with title `My Blog Post! — site.com` → filename reads `my-blog-post-site-com.md`. Open on a page with no title → filename reads `converted.md`.
6. **No defaultFilename in Options**: confirm Options page exposes only baseUrl / apiKey / model; no defaultFilename input or storage key.
7. **Selector strictness per row**: `body` passes; `div` (many) → `.row--error` "Selector matched N elements, expected exactly 1", Convert blocked; `.does-not-exist` → `.row--error` "No element matched selector", Convert blocked.
8. **Size guard**: row matching a huge element → "HTML too large, narrow your selectors", Convert blocked.
9. **Missing settings**: clear Options → Convert → "Open Options" link visible.
10. **Idempotency on reload**: in `chrome://extensions`, click Reload on the extension. Re-open popup → no duplicate listeners, no console errors.
11. **No inline scripts**: confirm no `<script>` tags with inline JS in any HTML file (MV3).
12. **Row add/remove sanity**: add 5 rows, remove rows 2 and 4, ensure remaining rows still validate and Convert works.

## Explicitly out of scope (v1)
- Live per-row validation while typing.
- Element picker / hover-to-select UI.
- Selector history / saved presets.
- User-editable default filename.
- Streaming the LLM response into the popup.
- Service-worker-mediated calls (popup does the `fetch` directly).
- Offline HTML→Markdown fallback.
- Non-chat-completions endpoints (e.g. `/v1/responses`).
- Using row labels as Markdown headings (delimiter is plain join).
- README Feature #2 (spaced repetition).

## Further considerations
1. **CORS on the LLM endpoint** — extension pages can `fetch` cross-origin without `host_permissions`, but the server must return permissive CORS. Test-connection will surface this; worth a short note in the Options UI. *No plan change.*
2. **Filename collisions** — `saveAs: true` always prompts, so the browser handles it. *No plan change.*
3. **Selectors that legitimately match many elements** — this plan forbids it by design (per-row exactly-one). A v2 follow-up could add a per-row "multi-match" toggle that switches to `querySelectorAll` for that row. Flagged intentionally, not an oversight.

## Test case (Google blog: Diffusion Gemma)

Used to exercise the multi-row happy path end‑to‑end.

**URL to convert**

- https://blog.google/innovation-and-ai/technology/developers-tools/diffusion-gemma-faster-text-generation/

**JS selectors (one per popup row, in order)**

1. `#jump-content > article > section.article-hero`
2. `#jump-content > article > div.article-meta__author-container > div.article-meta__author-wrapper`
3. `#jump-content > article > div.article-meta__author-container > div.article-meta__container > div.article-meta__content`
4. `#jump-content > article > div.article-image-hero > div > figure > div > div > img`
5. `#jump-content > article > section.uni-container.article-container > div`

**Options page values**

| Field | Value |
|---|---|
| Base URL | `https://api.tokenrouter.com/v1` |
| API key | `sk-W2gqy5dRoaLcFBdya2OMoWWl5aVpdWxPccafTpivm5LUmN5N` |
| Model | `MiniMax-M3` |

**Expected filename**

If the tab title is `Diffusion Gemma: A faster text generation model — Google Blog`, the slugified filename should be `diffusion-gemma-a-faster-text-generation-model-google-blog.md`.

**How to run**

1. Open the URL above in a tab.
2. Open the extension **Options** page, fill in the three fields, click **Save**, then **Test connection** (expect `OK`).
3. Click the extension action to open the popup. The filename input should be pre‑filled with the slugified tab title.
4. Add five rows, paste the five selectors above (labels are optional).
5. Click **Convert**. The Save‑As dialog should appear with the slugified filename; the resulting `.md` should contain all five sections in order.
