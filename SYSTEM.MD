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
    options/
    sidepanel/
  background/
    service-worker.js
  content-scripts/
```

- `core/` contains utilities, constants and storage helpers shared by the extension's entrypoints, content scripts, and service worker.
- `app/` contains user‑facing entry points (options, sidepanel, etc).
- `content-scripts/` contains scripts injected into web pages (e.g., element picker, screen scanner, extraction).
- `background/` contains the service worker orchestrating messaging, dynamic script injection, and API synchronization.

General Rules
-------------

- Always maintain MV3 compliance: no dynamic code execution, no inline scripts.
- Follow YAGNI principles, unless breaking them improves developer experience (DX).
- Keep background logic minimal — offload UI and long operations where possible.
  > **Meaning:** Background scripts should react to events (e.g., tab changes) and forward heavy or interactive work to UI pages or content scripts to avoid blocking.
- Offload long-lived network requests (e.g., companion API payloads) to the Service Worker to avoid cancellation when a sidepanel/popup closes.
- Implement a task heartbeat/keep-alive mechanism to prevent Service Worker termination during active async wait cycles.
- Inject site-specific parsing scripts dynamically (`chrome.scripting.executeScript`) to minimize manifest metadata/permissions overhead.
- Structure multi-feature popups/side-panels using a tabbed UI. Automatically auto-select the initial tab by matching the active tab URL against regex page patterns.
- All code should be idempotent on reload — extensions auto‑reload during development.
  > **Meaning:** If a script runs twice (due to reload), it must not register duplicate listeners, duplicate DOM changes, or produce corrupted state.
- Route external domain calls through the local companion app (`https://api.shagun-agent.localhost` or as configured in Options) to avoid CORS configuration issues.
- Maintain and manage a `CHROMEWEBSTORE.md` detailing Store descriptions and guidelines, following MV3/Chrome Web Store publishing protocols.

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
