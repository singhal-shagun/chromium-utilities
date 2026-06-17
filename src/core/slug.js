// src/core/slug.js
// Turn arbitrary text into a filename-safe slug.

export function slugify(text) {
  if (!text) return "";
  let s = String(text).normalize("NFKD");
  // Strip combining marks (diacritics).
  s = s.replace(/[\u0300-\u036f]/g, "");
  s = s.toLowerCase();
  // Replace any non-alphanumeric run with a single dash.
  s = s.replace(/[^a-z0-9]+/g, "-");
  // Trim leading/trailing dashes.
  s = s.replace(/^-+|-+$/g, "");
  // Collapse multiple dashes defensively.
  s = s.replace(/-{2,}/g, "-");
  return s;
}
