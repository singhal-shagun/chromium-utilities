// @ts-check

/** Chrome extension globals */
const chromeGlobals = {
  chrome: "readonly",
  window: "readonly",
  document: "readonly",
  fetch: "readonly",
  AbortSignal: "readonly",
  FileReader: "readonly",
  Blob: "readonly",
  TextEncoder: "readonly",
  setTimeout: "readonly",
  console: "readonly",
  HTMLDocument: "readonly",
  CSS: "readonly",
  DOMParser: "readonly",
  navigator: "readonly",
  HTMLInputElement: "readonly",
  HTMLButtonElement: "readonly",
  HTMLDivElement: "readonly",
  HTMLElement: "readonly",
  Node: "readonly",
  MouseEvent: "readonly",
  KeyboardEvent: "readonly"
}

/** Extension-specific module globals */
const moduleGlobals = {
  HtmlMarkdownStorage: "readonly",
  slugify: "readonly",
  __HTML_TO_MD_EXTRACT: "readonly",
  __HTML_TO_MD_PICKER_READY: "writable"
}

export default [
  {
    files: ["src/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "script",
      globals: {
        ...chromeGlobals,
        ...moduleGlobals
      }
    },
    rules: {
      // Best practices
      eqeqeq: ["warn", "always"],
      "no-unused-vars": ["warn", { args: "none", caughtErrors: "none" }],
      "no-var": "warn",
      "prefer-const": "warn",
      "no-throw-literal": "warn",

      // Possible errors
      "no-self-compare": "warn",
      "no-template-curly-in-string": "warn",
      "no-unreachable-loop": "warn",

      // Style (only what Prettier doesn't cover)
      yoda: "warn"
    }
  },
  {
    files: ["tests/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "commonjs",
      globals: {
        ...chromeGlobals,
        ...moduleGlobals,
        describe: "readonly",
        it: "readonly",
        assert: "readonly",
        module: "readonly",
        require: "readonly",
        __filename: "readonly",
        __dirname: "readonly"
      }
    },
    rules: {
      eqeqeq: ["warn", "always"],
      "no-unused-vars": ["warn", { args: "none", caughtErrors: "none" }],
      "no-var": "warn",
      "prefer-const": "warn"
    }
  },
  {
    ignores: ["node_modules/**", "*.mjs", "*.cjs"]
  }
]
