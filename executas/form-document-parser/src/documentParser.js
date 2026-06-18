"use strict";

const { cleanText } = require("./textCleaner");
const { detectFormFields, extractKeyValueFields } = require("./fieldDetector");
const { createChunks } = require("./chunker");
const {
  validateParseDocumentsInput,
  getDocumentType,
  hasTextContent,
  hasBase64Content,
  createParserError,
} = require("./validators");

async function parseDocuments(input) {
  validateParseDocumentsInput(input);

  const targetForm = await parseTargetForm(input.targetForm);
  const sourceDocuments = [];

  for (const document of input.sourceDocuments || []) {
    sourceDocuments.push(await parseSourceDocument(document));
  }

  return {
    targetForm,
    sourceDocuments,
  };
}

async function parseTargetForm(document) {
  const base = await parseDocumentText(document);

  return {
    fileName: base.fileName,
    mimeType: base.mimeType,
    cleanText: base.cleanText,
    detectedFields: detectFormFields(base.cleanText),
    sections: [],
    chunks: createChunks(base.cleanText, base.fileName),
  };
}

async function parseSourceDocument(document) {
  const base = await parseDocumentText(document);

  return {
    fileName: base.fileName,
    mimeType: base.mimeType,
    cleanText: base.cleanText,
    extractedFields: extractKeyValueFields(base.cleanText, base.fileName),
    sections: [],
    chunks: createChunks(base.cleanText, base.fileName),
  };
}

async function parseDocumentText(document) {
  const type = getDocumentType(document);
  const fileName = document.fileName;
  const mimeType = document.mimeType || inferMimeType(type);
  const rawText = await extractRawText(document, type);

  return {
    fileName,
    mimeType,
    cleanText: cleanText(rawText),
  };
}

async function extractRawText(document, type) {
  if (hasTextContent(document)) {
    return document.text;
  }

  if (type === "text" && hasBase64Content(document)) {
    return Buffer.from(document.contentBase64, "base64").toString("utf8");
  }

  if (type === "docx" && hasBase64Content(document)) {
    return extractDocxText(document.contentBase64, document.fileName);
  }

  throw createParserError(
    "MISSING_DOCUMENT_CONTENT",
    "Document must include text or supported contentBase64.",
    { fileName: document.fileName }
  );
}

async function extractDocxText(contentBase64, fileName) {
  let mammoth;

  try {
    mammoth = require("mammoth");
  } catch (error) {
    throw createParserError(
      "DEPENDENCY_NOT_INSTALLED",
      "DOCX parsing requires the mammoth package. Run npm install in executas/form-document-parser.",
      { fileName }
    );
  }

  const buffer = Buffer.from(contentBase64, "base64");
  const result = await mammoth.extractRawText({ buffer });

  return result.value || "";
}

function inferMimeType(type) {
  if (type === "docx") {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }

  if (type === "text") {
    return "text/plain";
  }

  return "";
}

module.exports = {
  parseDocuments,
  parseTargetForm,
  parseSourceDocument,
  parseDocumentText,
  extractRawText,
  extractDocxText,
  inferMimeType,
};
