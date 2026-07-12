const test = require("node:test")
const assert = require("node:assert/strict")

const { slugify } = require("../src/core/slug")
require("../src/core/slug") // also exposes global.slugify used by inferFilename
const { inferFilename } = require("../src/core/filename")

test("slugify converts text into a safe filename slug", () => {
  assert.equal(slugify("Hello, World!"), "hello-world")
  assert.equal(slugify("  My Article — 2026  "), "my-article-2026")
  assert.equal(slugify("---"), "page")
})

test("inferFilename uses the slugified tab title", () => {
  assert.equal(inferFilename("My Sample Page"), "my-sample-page.md")
  assert.equal(inferFilename(""), "page.md")
})
