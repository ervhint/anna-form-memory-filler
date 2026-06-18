"use strict";

function detectFormFields(cleanText) {
  return getMeaningfulLines(cleanText)
    .map((line) => detectFormFieldFromLine(line))
    .filter(Boolean);
}

function extractKeyValueFields(cleanText, sourceFileName) {
  return getMeaningfulLines(cleanText)
    .map((line) => extractKeyValueFromLine(line, sourceFileName))
    .filter(Boolean);
}

function detectFormFieldFromLine(line) {
  const rawText = line.trim();

  if (!rawText) return null;

  const blankMarkerMatch = rawText.match(/^(.{2,80}?)(?:[:：]?\s*_{3,}|\.{3,})/);
  if (blankMarkerMatch) {
    return createDetectedField(blankMarkerMatch[1], rawText);
  }

  if (/[:：]\s*$/.test(rawText)) {
    return createDetectedField(rawText.replace(/[:：]\s*$/, ""), rawText);
  }

  if (looksLikeShortLabel(rawText)) {
    return createDetectedField(rawText, rawText);
  }

  return null;
}

function extractKeyValueFromLine(line, sourceFileName) {
  const rawText = line.trim();
  const match = rawText.match(/^([^:：]{2,80})[:：]\s*(.{1,500})$/);

  if (!match) return null;

  const fieldName = normalizeFieldName(match[1]);
  const value = match[2].trim();

  if (!fieldName || !value) return null;
  if (looksLikeSentence(fieldName)) return null;

  return {
    fieldName,
    value,
    sourceFileName,
  };
}

function createDetectedField(fieldName, rawText) {
  const normalized = normalizeFieldName(fieldName);

  if (!normalized) return null;

  return {
    fieldName: normalized,
    rawText,
  };
}

function normalizeFieldName(value) {
  return String(value || "")
    .replace(/[*•\-_]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikeShortLabel(line) {
  if (line.length < 3 || line.length > 60) return false;
  if (/[.!?]$/.test(line)) return false;
  if (looksLikeSentence(line)) return false;

  const words = line.split(/\s+/);
  if (words.length > 7) return false;

  return words.every((word) => {
    return /^[A-Z0-9][A-Za-z0-9/'().&-]*$/.test(word);
  });
}

function looksLikeSentence(text) {
  const words = String(text).trim().split(/\s+/);
  if (words.length > 8) return true;

  const lowerCaseWords = words.filter((word) => /^[a-z]/.test(word));
  return words.length >= 5 && lowerCaseWords.length >= 3;
}

function getMeaningfulLines(text) {
  return String(text || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

module.exports = {
  detectFormFields,
  extractKeyValueFields,
  detectFormFieldFromLine,
  extractKeyValueFromLine,
};
