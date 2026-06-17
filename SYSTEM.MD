Project System Notes
====================

Purpose
-------
This file provides always‑true, high‑value context for working on the Chromium Utilities extension. It serves as foundational guidance for safe, consistent development.

Tech Stack
----------
- JavaScript (no TypeScript).
- Standard Chromium extension APIs (Manifest V3).
- HTML/CSS/vanilla JS for popup, options, and newtab UI.
- **LLM calls**: [Vercel AI SDK](https://ai-sdk.dev/) (`ai` + `@ai-sdk/openai-compatible`). The extension has no build step, so both packages are loaded at runtime from `https://esm.sh` via an import map declared on each HTML page. The base URL/model in the Options page go through `createOpenAICompatible({ name, apiKey, baseURL })`; we call `generateText` / `streamText` against `provider(modelId)`.

Project Structure
-----------------
```
README.md
docs/
src/
  core/
    assets/
  app/
    popup/
      assets/
    options/
      assets/
    newtab/
      assets/
```
`core/` contains shared architecture, utilities, and base classes.

General Rules
-------------
- Always maintain MV3 compliance: no dynamic code execution, no inline scripts.
- Avoid heavy dependencies; prefer utilities over frameworks.
- Keep background logic minimal — offload UI and long operations where possible.
	Meaning: Background scripts should react to events (e.g., tab changes) and forward heavy or interactive work to UI pages or content scripts to avoid blocking.
- All code should be idempotent on reload — extensions auto‑reload during development.
	Meaning: If a script runs twice (due to reload), it must not register duplicate listeners, duplicate DOM changes, or produce corrupted state.
- Never store sensitive data; only store minimal settings in `chrome.storage.sync`.
- Since this a Chromium extension, create and manage a CHROMEWEBSTORE.md file. You can use this project's chrome-extensions skill to learn about the format of this CHROMEWEBSTORE.md file.

Debugging
---------
- Use Chrome DevTools (the VS Code **Chrome DevTools MCP** plugin) for browser‑side debugging: `mcp_chrome-devtoo_*` tools (`navigate_page`, `take_snapshot`, `evaluate_script`, `list_console_messages`, `list_network_requests`, `take_screenshot`, `lighthouse_audit`, etc.).
- The DevTools MCP is the fastest way to validate extension flows end‑to‑end: load the popup / options HTML directly via `navigate_page` to a `file://` URL, then drive the UI with `evaluate_script` / `take_snapshot` and watch `list_console_messages` for errors.
- For pure‑logic modules (e.g. `src/core/*.js`), prefer a quick `node --check` and a small `node --input-type=module -e "..."` snippet to exercise the function in isolation.
- Always check the console and network panels after a manual change — MV3 rejects `eval`, inline `<script>`, and unregistered `host_permissions` at load time, with messages only visible in DevTools.

Safe Commands
-------------
- `npm install` (add dependencies). Keep dependency count low.
- `npm run build` (build the extension if a build step exists)

Hard Safety Rules
-----------------
- Do not execute arbitrary remote code.
- Do not automatically elevate permissions; ask before modifying manifest.
- Do not modify unrelated files without user instruction.
- Never write inline scripts or `eval`.
- Use minimal permission surface: request only what is required.

