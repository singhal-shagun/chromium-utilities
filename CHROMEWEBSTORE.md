# Chrome Web Store Notes

## Summary
Chromium utilities is a Manifest V3 browser extension that helps users turn selected page sections into Markdown and send them to a companion app for conversion.

## Permissions
- activeTab
- scripting
- storage
- downloads

## Notes for Review
- The extension requests only the minimum permissions required for popup/options/content-script workflows.
- Companion app calls are routed to the user's configured local endpoint and are not used for arbitrary remote execution.
