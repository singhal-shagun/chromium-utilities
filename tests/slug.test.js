const test = require('node:test');
const assert = require('node:assert/strict');

const { slugify } = require('../src/core/slug');
require('../src/core/slug'); // also exposes global.slugify used by the helper below

// NOTE: `inferFilename` lives inside the side-panel IIFE (src/app/sidepanel/sidepanel.js),
// which is DOM-dependent and not exportable, so it is mirrored here for unit testing.
// The canonical fix (see docs/features/html-to-markdown/plan.md) is to extract it into a
// shared module (e.g. src/core/filename.js) that both the side panel and this test require.
function inferFilename(title) {
  const slug = slugify(title) || 'page';
  return slug + '.md';
}

test('slugify converts text into a safe filename slug', () => {
  assert.equal(slugify('Hello, World!'), 'hello-world');
  assert.equal(slugify('  My Article — 2026  '), 'my-article-2026');
  assert.equal(slugify('---'), 'page');
});

test('inferFilename uses the slugified tab title', () => {
  assert.equal(inferFilename('My Sample Page'), 'my-sample-page.md');
  assert.equal(inferFilename(''), 'page.md');
});
