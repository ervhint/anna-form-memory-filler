"use strict";

const DEFAULT_MAX_CHARS = 1600;
const DEFAULT_MIN_CHARS = 1200;

function createChunks(cleanText, sourceFileName, options = {}) {
  const maxChars = options.maxChars || DEFAULT_MAX_CHARS;
  const minChars = options.minChars || DEFAULT_MIN_CHARS;
  const paragraphs = String(cleanText || "")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  if (paragraphs.length === 0) {
    return [];
  }

  const chunks = [];
  let current = "";

  paragraphs.forEach((paragraph) => {
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;

    if (candidate.length <= maxChars || current.length < minChars) {
      current = candidate;
      return;
    }

    pushChunk(chunks, current, sourceFileName);
    current = paragraph;

    while (current.length > maxChars) {
      const slicePoint = findSlicePoint(current, maxChars);
      pushChunk(chunks, current.slice(0, slicePoint).trim(), sourceFileName);
      current = current.slice(slicePoint).trim();
    }
  });

  if (current) {
    pushChunk(chunks, current, sourceFileName);
  }

  return chunks;
}

function pushChunk(chunks, text, sourceFileName) {
  if (!text) return;

  chunks.push({
    chunkId: `${sourceFileName}#chunk-${chunks.length + 1}`,
    text,
    sourceFileName,
  });
}

function findSlicePoint(text, maxChars) {
  const window = text.slice(0, maxChars);
  const newlineIndex = window.lastIndexOf("\n");
  const sentenceIndex = Math.max(
    window.lastIndexOf(". "),
    window.lastIndexOf("? "),
    window.lastIndexOf("! ")
  );
  const spaceIndex = window.lastIndexOf(" ");

  return Math.max(newlineIndex, sentenceIndex + 1, spaceIndex, maxChars);
}

module.exports = {
  DEFAULT_MAX_CHARS,
  DEFAULT_MIN_CHARS,
  createChunks,
};
