"use strict";

const DEFAULT_CATEGORY = "general";
const DEFAULT_SENSITIVITY = "medium";
const DEFAULT_SOURCE_NOTE =
  "Approved by user from Form Memory Filler session.";

const ALLOWED_SENSITIVITIES = new Set(["low", "medium", "high"]);
const RAW_DOCUMENT_HEADERS = [
  "Curriculum Vitae",
  "Document Type",
  "Education:",
  "Skills:",
  "Project Experience:",
  "Work Style:",
  "Personal Profile Notes",
];

function validateMemoryInputItem(item) {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    return createValidationError(
      "INVALID_MEMORY_ITEM",
      "Memory item must be an object."
    );
  }

  if (!hasText(item.label)) {
    return createValidationError(
      "MISSING_LABEL",
      "Memory item label is required."
    );
  }

  if (!hasText(item.value)) {
    return createValidationError(
      "MISSING_VALUE",
      "Memory item value is required."
    );
  }

  if (looksLikeRawDocumentDump(item.value)) {
    return createValidationError(
      "RAW_DOCUMENT_NOT_ALLOWED",
      "Raw source documents should not be saved as memory."
    );
  }

  if (hasText(item.sensitivity) && !isAllowedSensitivity(item.sensitivity)) {
    return createValidationError(
      "INVALID_SENSITIVITY",
      "Sensitivity must be low, medium, or high."
    );
  }

  return { valid: true };
}

function normalizeMemoryInputItem(item) {
  const normalizedLabel = String(item.label).trim();
  const normalizedValue = String(item.value).trim();

  const category = hasText(item.category)
    ? String(item.category).trim()
    : DEFAULT_CATEGORY;

  const sensitivity =
    hasText(item.sensitivity) && isAllowedSensitivity(item.sensitivity)
      ? String(item.sensitivity).trim()
      : DEFAULT_SENSITIVITY;

  const sourceNote = hasText(item.source_note)
    ? String(item.source_note).trim()
    : DEFAULT_SOURCE_NOTE;

  return {
    label: normalizedLabel,
    value: normalizedValue,
    category,
    sensitivity,
    source_note: sourceNote,
  };
}

function isAllowedSensitivity(sensitivity) {
  return ALLOWED_SENSITIVITIES.has(String(sensitivity).trim());
}

function looksLikeRawDocumentDump(value) {
  const text = String(value || "");

  if (text.length > 3000) {
    return true;
  }

  const lineBreakCount = (text.match(/\r\n|\r|\n/g) || []).length;
  const matchedHeaderCount = RAW_DOCUMENT_HEADERS.filter((header) =>
    text.includes(header)
  ).length;

  return lineBreakCount >= 5 && matchedHeaderCount >= 3;
}

function createValidationError(code, message) {
  return {
    valid: false,
    code,
    message,
  };
}

function hasText(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

module.exports = {
  validateMemoryInputItem,
  normalizeMemoryInputItem,
  isAllowedSensitivity,
  looksLikeRawDocumentDump,
};
