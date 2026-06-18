"use strict";

const SUPPORTED_TEXT_MIME_TYPES = new Set([
  "text/plain",
  "text/markdown",
  "application/text",
]);

const DOCX_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function validateParseDocumentsInput(input) {
  if (!input || typeof input !== "object") {
    throw createParserError(
      "INVALID_INPUT",
      "Input must be an object with targetForm and optional sourceDocuments."
    );
  }

  validateDocumentInput(input.targetForm, "targetForm");

  if (
    input.sourceDocuments !== undefined &&
    !Array.isArray(input.sourceDocuments)
  ) {
    throw createParserError(
      "INVALID_SOURCE_DOCUMENTS",
      "sourceDocuments must be an array when provided."
    );
  }

  const sourceDocuments = Array.isArray(input.sourceDocuments)
    ? input.sourceDocuments
    : [];

  sourceDocuments.forEach((document, index) => {
    validateDocumentInput(document, `sourceDocuments[${index}]`);
  });
}

function validateDocumentInput(document, path) {
  if (!document || typeof document !== "object") {
    throw createParserError(
      "INVALID_DOCUMENT",
      `${path} must be a document object.`
    );
  }

  if (!isNonEmptyString(document.fileName)) {
    throw createParserError("MISSING_FILE_NAME", `${path}.fileName is required.`);
  }

  if (!hasTextContent(document) && !hasBase64Content(document)) {
    throw createParserError(
      "MISSING_DOCUMENT_CONTENT",
      `${path} must include either text or contentBase64.`,
      { fileName: document.fileName }
    );
  }

  const type = getDocumentType(document);

  if (type === "pdf") {
    throw createParserError(
      "UNSUPPORTED_FILE_TYPE",
      "PDF parsing is not supported yet in this MVP.",
      { fileName: document.fileName }
    );
  }

  if (type === "unknown") {
    throw createParserError(
      "UNSUPPORTED_FILE_TYPE",
      "Only .txt and .docx documents are supported in this MVP.",
      { fileName: document.fileName, mimeType: document.mimeType || "" }
    );
  }
}

function getDocumentType(document) {
  const fileName = String(document.fileName || "").toLowerCase();
  const mimeType = String(document.mimeType || "").toLowerCase();

  if (mimeType === "application/pdf" || fileName.endsWith(".pdf")) {
    return "pdf";
  }

  if (mimeType === DOCX_MIME_TYPE || fileName.endsWith(".docx")) {
    return "docx";
  }

  if (
    SUPPORTED_TEXT_MIME_TYPES.has(mimeType) ||
    fileName.endsWith(".txt") ||
    fileName.endsWith(".md")
  ) {
    return "text";
  }

  if (hasTextContent(document) && !fileName.includes(".")) {
    return "text";
  }

  return "unknown";
}

function hasTextContent(document) {
  return typeof document.text === "string" && document.text.length > 0;
}

function hasBase64Content(document) {
  return (
    typeof document.contentBase64 === "string" &&
    document.contentBase64.length > 0
  );
}

function createParserError(code, message, details = null) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  return error;
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

module.exports = {
  DOCX_MIME_TYPE,
  validateParseDocumentsInput,
  validateDocumentInput,
  getDocumentType,
  hasTextContent,
  hasBase64Content,
  createParserError,
};
