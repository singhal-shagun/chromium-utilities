// src/core/filename.js
import { slugify } from "./slug.js";

export function inferFilename(tabTitle) {
  const base = slugify(tabTitle);
  return (base || "converted") + ".md";
}
