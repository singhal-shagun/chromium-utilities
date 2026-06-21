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

Project Structure
-----------------
```
README.md
docs/
src/
  core/
  app/
    core/
      assets/
    entrypoints/
      context-menu/
      keyboard-shortcuts/
      new-tab/
      options/
      omnibox/
      popup/
      side-panel/
      devtools-panel/
    content-scripts/
    service-worker/
      service-worker.js
```

- `core/` contains assets, architecture, utilities, and base classes shared by the extension's entrypoints, content scripts, service worker.
- `app/` contains all user‑facing entry points.
  - `app/core/` contains utilities and assets (e.g., UI components, styles) shared across entry points.
  - `entrypoints/` contains the HTML, JS, and assets for each user‑facing entry point (popup, options, newtab, etc).
- `content-scripts/` contains scripts injected into web pages (e.g., element picker, extraction).
- `service-worker/` contains the background service worker script and related modules. Do not put all service worker code in service-worker.js. Modularize the code and import it into service-worker.js to keep it organized and maintainable.

General Rules
-------------
- Always maintain MV3 compliance: no dynamic code execution, no inline scripts.
- Follow YAGNI principles, unless breaking them improves developer experience (DX).
- Keep background logic minimal — offload UI and long operations where possible.
	Meaning: Background scripts should react to events (e.g., tab changes) and forward heavy or interactive work to UI pages or content scripts to avoid blocking.
- All code should be idempotent on reload — extensions auto‑reload during development.
	Meaning: If a script runs twice (due to reload), it must not register duplicate listeners, duplicate DOM changes, or produce corrupted state.
- This chrome extension will have a companion application on the user's system (http://localhost:3000, or as configured in Options). Route all calls to external domains through the companion app to avoid CORS issues.
- Since this a Chromium extension, create and manage a CHROMEWEBSTORE.md file. Refer this project's chrome-extensions skill to learn about the format of this CHROMEWEBSTORE.md file.

Debugging
---------
- Use Chrome DevTools (the VS Code **Chrome DevTools MCP** plugin) for browser‑side debugging: `mcp_chrome-devtoo_*` tools (`navigate_page`, `take_snapshot`, `evaluate_script`, `list_console_messages`, `list_network_requests`, `take_screenshot`, `lighthouse_audit`, etc.).
- The DevTools MCP is the fastest way to validate extension flows end‑to‑end: load the popup / options HTML directly via `navigate_page` to a `file://` URL, then drive the UI with `evaluate_script` / `take_snapshot` and watch `list_console_messages` for errors.
- For pure‑logic modules (e.g. `src/core/*.js`), prefer a quick `node --check` and a small `node --input-type=module -e "..."` snippet to exercise the function in isolation.
- Always check the console and network panels after a manual change — MV3 rejects `eval`, inline `<script>`, and unregistered `host_permissions` at load time, with messages only visible in DevTools.

Hard Safety Rules
-----------------
- Do not execute arbitrary remote code.
- Do not automatically elevate permissions; ask before modifying manifest.
- Do not modify unrelated files without user instruction.
- Never write inline scripts or `eval`.
- Use minimal permission surface: request only what is required.

