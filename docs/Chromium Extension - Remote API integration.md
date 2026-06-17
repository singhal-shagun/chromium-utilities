> I am creating a Google Chrome extension. The extension is supposed to summarize a webpage by passing the page's HTML to a remotely hosted LLM with an OpenAI-compatible chat completions endpoint, as configured by the user (it could be an OpenRouter endpoint, or an OpenAI endpoint or any other such OpenAI-compatible chat completions endpoints). 
>
> Is this possible? Would Google Chrome allow such API calls to remote hosts (which aren't configured in the extension's manifest.json) from a Google Chrome extension?

# Yes, This Is Absolutely Possible

Chrome extensions *can* make API calls to remote hosts, but how you handle permissions matters — especially since your endpoint URL is **user-configured** (not known at build time). Here's the full picture:

---

## The Core Mechanism: Host Permissions

Chrome extensions need explicit permission to contact remote hosts. In **Manifest V3** (the current standard), this is controlled via `host_permissions` and `optional_host_permissions` in `manifest.json`.

You have two main strategies:

### Strategy 1: Blanket Permissions (Easy, But Not Recommended)

```json
// manifest.json
{
  "manifest_version": 3,
  "host_permissions": [
    "https://*/*"
  ]
}
```

**Downsides:**
- Users see a scary **"Read and change all your data on all websites"** warning at install.
- Chrome Web Store reviewers scrutinize this heavily.
- Lower install rates due to the broad permission warning.

---

### Strategy 2: Optional Permissions at Runtime (Recommended ✅)

This is the right approach for your use case. You declare that you *might* need access to arbitrary hosts, but you request it **on demand** when the user provides their endpoint URL.

```json
// manifest.json
{
  "manifest_version": 3,
  "permissions": ["activeTab", "scripting"],
  "optional_host_permissions": ["https://*/*"]
}
```

Then, when the user configures their endpoint in your settings/popup:

```javascript
// options.js or popup.js — must be triggered by a user gesture (e.g., button click)
async function saveEndpoint(url) {
  const origin = new URL(url).origin + "/*";

  const granted = await chrome.permissions.request({
    origins: [origin]
  });

  if (granted) {
    // Save the endpoint URL
    await chrome.storage.sync.set({ apiEndpoint: url });
    console.log("Permission granted and endpoint saved!");
  } else {
    console.log("User denied permission for this host.");
  }
}
```

**Why this is better:**
- No scary warnings at install time.
- The user sees a **targeted** permission prompt (e.g., *"Allow access to api.openrouter.ai?"*), which builds trust.
- Chrome Web Store review is smoother.
- You only get access to exactly the hosts you need.

---

## Making the Actual API Call

Once you have permission, you simply use `fetch()` from your **background service worker** (not from a content script, to avoid CORS issues with the page's origin):

```javascript
// background.js (service worker)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "SUMMARIZE") {
    handleSummarize(message.html).then(sendResponse);
    return true; // keeps the message channel open for async response
  }
});

async function handleSummarize(pageHtml) {
  const { apiEndpoint, apiKey, model } = await chrome.storage.sync.get([
    "apiEndpoint", "apiKey", "model"
  ]);

  const response = await fetch(apiEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model,
      messages: [
        {
          role: "system",
          content: "Summarize the following webpage HTML content clearly and concisely."
        },
        {
          role: "user",
          content: pageHtml
        }
      ]
    })
  });

  return await response.json();
}
```

And from your content script or popup, you'd send the message:

```javascript
// content-script.js or popup.js
const result = await chrome.runtime.sendMessage({
  type: "SUMMARIZE",
  html: document.documentElement.outerHTML
});
console.log(result.choices[0].message.content);
```

---

## Architecture Summary

```
┌──────────────┐       message        ┌────────────────────┐     fetch()     ┌──────────────────┐
│Content Script├─────────────────────►│ Background Service  ├───────────────►│ LLM API Endpoint │
│  (gets HTML) │◄─────────────────────┤ Worker (calls API)  │◄───────────────┤ (OpenAI/OpenRouter│
└──────────────┘      response        └────────────────────┘    response     │  /self-hosted)   │
                                              ▲                              └──────────────────┘
                                              │ reads config
                                      ┌───────┴────────┐
                                      │ chrome.storage  │
                                      │ (endpoint, key, │
                                      │  model)         │
                                      └────────────────┘
```

## Key Takeaways

| Concern | Answer |
|---|---|
| Can extensions call remote APIs? | **Yes** |
| Can the host be user-configured? | **Yes**, using `optional_host_permissions` + `chrome.permissions.request()` |
| CORS issues? | **Not from the service worker** — extension service workers aren't subject to web CORS |
| API key security? | Store in `chrome.storage.sync` or `chrome.storage.local`; it never touches web page context |
| `chrome.permissions.request()` constraint | Must be called in response to a **user gesture** (click, etc.) |

The `optional_host_permissions` + runtime request pattern is exactly the idiomatic way to solve the "user-configurable remote endpoint" problem in a Chrome extension.
