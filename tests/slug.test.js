const test = require('node:test');
const assert = require('node:assert/strict');

require('../src/core/slug');
const { slugify } = require('../src/core/slug');
const { inferFilename } = require('../src/app/popup/markdown');

test('slugify converts text into a safe filename slug', () => {
  assert.equal(slugify('Hello, World!'), 'hello-world');
  assert.equal(slugify('  My Article — 2026  '), 'my-article-2026');
  assert.equal(slugify('---'), 'page');
});

test('inferFilename uses the slugified tab title', () => {
  assert.equal(inferFilename('My Sample Page'), 'my-sample-page.md');
  assert.equal(inferFilename(''), 'page.md');
});
