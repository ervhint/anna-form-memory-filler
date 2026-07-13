"use strict";

const {
  MEMORY_VERSION,
  DRAFT_SESSIONS_VERSION,
  getEmptyMemoryData,
  getEmptyDraftSessionData,
  readMemoryFromAps,
  readDraftSessionsFromAps,
  writeMemoryToAps,
  writeDraftSessionsToAps,
} = require("./apsClient");

const {
  validateMemoryInputItem,
  normalizeMemoryInputItem,
} = require("./validators");

const RAW_DRAFT_FIELD_NAMES = new Set([
  "contentBase64",
  "cleanText",
  "rawText",
  "rawDocument",
  "rawDocuments",
  "evidenceJson",
  "compactEvidenceJson",
  "sourceDocuments",
  "targetForm",
  "parserInput",
]);

async function getMemory() {
  const memoryData = await readMemoryFromAps();

  if (!memoryData || !Array.isArray(memoryData.items)) {
    return getEmptyMemoryData();
  }

  return memoryData;
}

async function listMemory(input = {}) {
  const memoryData = await getMemory();
  let items = memoryData.items;

  if (hasText(input.category)) {
    const category = String(input.category).trim();
    items = items.filter((item) => item.category === category);
  }

  return {
    items: items.map((item) => ({
      id: item.id,
      label: item.label,
      value: item.value,
      category: item.category,
      sensitivity: item.sensitivity,
      preview: createPreview(item.value),
      last_confirmed_at: item.last_confirmed_at,
    })),
  };
}

async function saveApprovedMemory(input = {}) {
  if (!input.items || !Array.isArray(input.items)) {
    throw createMemoryStoreError(
      "INVALID_MEMORY_ITEMS",
      "items must be an array"
    );
  }

  const memoryData = await getMemory();
  const existingItems = memoryData.items.slice();
  const savedItems = [];
  const currentTime = new Date().toISOString();

  for (const rawItem of input.items) {
    const validationResult = validateMemoryInputItem(rawItem);

    if (!validationResult.valid) {
      throw createMemoryStoreError(
        validationResult.code,
        validationResult.message
      );
    }

    const normalizedItem = normalizeMemoryInputItem(rawItem);
    const existingItem = findSimilarMemoryItem(existingItems, normalizedItem);

    if (existingItem) {
      const updatedItem = updateExistingMemoryItem(
        existingItem,
        normalizedItem,
        currentTime
      );
      const existingIndex = existingItems.findIndex(
        (item) => item.id === existingItem.id
      );

      existingItems[existingIndex] = updatedItem;
      savedItems.push(updatedItem);
    } else {
      const newItem = createMemoryCard(normalizedItem, currentTime);

      existingItems.push(newItem);
      savedItems.push(newItem);
    }
  }

  await writeMemoryToAps({
    version: MEMORY_VERSION,
    items: existingItems,
  });

  return {
    saved_count: savedItems.length,
    items: savedItems,
  };
}

async function deleteMemoryItem(input = {}) {
  if (!hasText(input.id)) {
    throw createMemoryStoreError(
      "MISSING_MEMORY_ID",
      "Memory item id is required."
    );
  }

  const memoryData = await getMemory();
  const memoryId = String(input.id).trim();
  const itemExists = memoryData.items.some((item) => item.id === memoryId);

  if (!itemExists) {
    throw createMemoryStoreError(
      "MEMORY_ITEM_NOT_FOUND",
      "No memory item found with the provided id."
    );
  }

  const filteredItems = memoryData.items.filter((item) => item.id !== memoryId);

  await writeMemoryToAps({
    version: MEMORY_VERSION,
    items: filteredItems,
  });

  return {
    deleted: true,
    deleted_id: memoryId,
  };
}

async function getDraftSessionsData() {
  const draftSessionData = await readDraftSessionsFromAps();

  if (!draftSessionData || !Array.isArray(draftSessionData.sessions)) {
    return getEmptyDraftSessionData();
  }

  return draftSessionData;
}

async function listDraftSessions() {
  const draftSessionData = await getDraftSessionsData();
  const sessions = draftSessionData.sessions
    .map(createDraftSessionPreview)
    .sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")));

  return { sessions };
}

async function getDraftSession(input = {}) {
  const sessionId = getRequiredDraftSessionId(input);
  const draftSessionData = await getDraftSessionsData();
  const session = draftSessionData.sessions.find((item) => item.id === sessionId);

  if (!session) {
    throw createMemoryStoreError(
      "DRAFT_SESSION_NOT_FOUND",
      "No draft session found with the provided id."
    );
  }

  return { session };
}

async function saveDraftSession(input = {}) {
  const rawSession = input.session && typeof input.session === "object" ? input.session : input;
  const draftSessionData = await getDraftSessionsData();
  const existingSessions = draftSessionData.sessions.slice();
  const currentTime = new Date().toISOString();
  const requestedId = hasText(rawSession.id) ? String(rawSession.id).trim() : null;
  const existingIndex = requestedId
    ? existingSessions.findIndex((session) => session.id === requestedId)
    : -1;
  const existingSession = existingIndex >= 0 ? existingSessions[existingIndex] : null;
  const normalizedSession = createDraftSessionSnapshot(
    rawSession,
    existingSession,
    currentTime
  );

  if (existingSession) {
    existingSessions[existingIndex] = normalizedSession;
  } else {
    existingSessions.push(normalizedSession);
  }

  await writeDraftSessionsToAps({
    version: DRAFT_SESSIONS_VERSION,
    sessions: existingSessions,
  });

  return {
    saved: true,
    created: !existingSession,
    session: normalizedSession,
  };
}

async function deleteDraftSession(input = {}) {
  const sessionId = getRequiredDraftSessionId(input);
  const draftSessionData = await getDraftSessionsData();
  const sessionExists = draftSessionData.sessions.some(
    (session) => session.id === sessionId
  );

  if (!sessionExists) {
    throw createMemoryStoreError(
      "DRAFT_SESSION_NOT_FOUND",
      "No draft session found with the provided id."
    );
  }

  await writeDraftSessionsToAps({
    version: DRAFT_SESSIONS_VERSION,
    sessions: draftSessionData.sessions.filter((session) => session.id !== sessionId),
  });

  return {
    deleted: true,
    deleted_id: sessionId,
  };
}

function createMemoryCard(item, currentTime) {
  return {
    id: generateMemoryId(),
    label: item.label,
    value: item.value,
    category: item.category,
    sensitivity: item.sensitivity,
    last_confirmed_at: currentTime,
  };
}

function updateExistingMemoryItem(existingItem, newItem, currentTime) {
  return {
    id: existingItem.id,
    label: newItem.label,
    value: newItem.value,
    category: newItem.category,
    sensitivity: newItem.sensitivity,
    last_confirmed_at: currentTime,
  };
}

function findSimilarMemoryItem(existingItems, newItem) {
  if (hasText(newItem.id)) {
    const existingItemById = existingItems.find(
      (existingItem) => existingItem.id === newItem.id
    );

    if (existingItemById) {
      return existingItemById;
    }
  }

  const normalizedNewLabel = normalizeLabel(newItem.label);

  return (
    existingItems.find(
      (existingItem) => normalizeLabel(existingItem.label) === normalizedNewLabel
    ) || null
  );
}

function createDraftSessionSnapshot(rawSession, existingSession, currentTime) {
  const id = hasText(rawSession.id)
    ? String(rawSession.id).trim()
    : generateDraftSessionId();
  const formOverview = sanitizePlainJson(rawSession.formOverview || null) || null;
  const draftAnswers = sanitizeArray(rawSession.draftAnswers);
  const missingInformation = sanitizeArray(rawSession.missingInformation);
  const proposedMemoryUpdates = sanitizeArray(rawSession.proposedMemoryUpdates);
  const targetFormFileName = hasText(rawSession.target_form_file_name)
    ? String(rawSession.target_form_file_name).trim()
    : "";
  const title = deriveDraftSessionTitle(rawSession, formOverview, targetFormFileName);

  return {
    id,
    title,
    target_form_file_name: targetFormFileName,
    source_document_file_names: normalizeStringArray(
      rawSession.source_document_file_names
    ),
    formOverview,
    draftAnswers,
    missingInformation,
    proposedMemoryUpdates,
    created_at: existingSession && existingSession.created_at ? existingSession.created_at : currentTime,
    updated_at: currentTime,
  };
}

function createDraftSessionPreview(session) {
  const draftAnswers = Array.isArray(session.draftAnswers) ? session.draftAnswers : [];
  const missingInformation = Array.isArray(session.missingInformation)
    ? session.missingInformation
    : [];

  return {
    id: session.id,
    title: session.title || "Untitled draft",
    target_form_file_name: session.target_form_file_name || "",
    source_document_file_names: normalizeStringArray(session.source_document_file_names),
    draft_answer_count: draftAnswers.length,
    missing_information_count: missingInformation.length,
    created_at: session.created_at || null,
    updated_at: session.updated_at || null,
  };
}

function deriveDraftSessionTitle(rawSession, formOverview, targetFormFileName) {
  if (hasText(rawSession.title)) {
    return String(rawSession.title).trim();
  }

  if (formOverview && hasText(formOverview.title)) {
    return String(formOverview.title).trim();
  }

  if (hasText(targetFormFileName)) {
    return String(targetFormFileName).trim();
  }

  return "Untitled draft";
}

function sanitizeArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map(sanitizePlainJson).filter((item) => item !== undefined);
}

function sanitizePlainJson(value) {
  if (value === undefined || typeof value === "function") {
    return undefined;
  }

  if (value === null || typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(sanitizePlainJson).filter((item) => item !== undefined);
  }

  const sanitized = {};

  for (const [key, childValue] of Object.entries(value)) {
    if (isRawDraftFieldName(key)) {
      continue;
    }

    const sanitizedChild = sanitizePlainJson(childValue);

    if (sanitizedChild !== undefined) {
      sanitized[key] = sanitizedChild;
    }
  }

  return sanitized;
}

function isRawDraftFieldName(key) {
  const normalizedKey = String(key || "").trim();
  const lowerKey = normalizedKey.toLowerCase();

  return (
    RAW_DRAFT_FIELD_NAMES.has(normalizedKey) ||
    lowerKey.includes("base64") ||
    lowerKey.includes("raw_text") ||
    lowerKey.includes("rawdocument") ||
    lowerKey.includes("evidencejson")
  );
}

function getRequiredDraftSessionId(input) {
  if (!hasText(input.id)) {
    throw createMemoryStoreError(
      "MISSING_DRAFT_SESSION_ID",
      "Draft session id is required."
    );
  }

  return String(input.id).trim();
}

function generateMemoryId() {
  const timestamp = Date.now();
  const randomPart = Math.random().toString(36).slice(2, 10);

  return `mem_${timestamp}_${randomPart}`;
}

function generateDraftSessionId() {
  const timestamp = Date.now();
  const randomPart = Math.random().toString(36).slice(2, 10);

  return `draft_${timestamp}_${randomPart}`;
}

function createPreview(value) {
  if (!hasText(value)) {
    return "";
  }

  const text = String(value);

  if (text.length <= 80) {
    return text;
  }

  return `${text.slice(0, 80)}...`;
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(hasText)
    .map((item) => String(item).trim());
}

function normalizeLabel(label) {
  return String(label || "").trim().toLowerCase();
}

function hasText(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function createMemoryStoreError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

module.exports = {
  getMemory,
  listMemory,
  saveApprovedMemory,
  deleteMemoryItem,
  listDraftSessions,
  getDraftSession,
  saveDraftSession,
  deleteDraftSession,
  createMemoryCard,
  updateExistingMemoryItem,
  findSimilarMemoryItem,
  generateMemoryId,
  generateDraftSessionId,
  createPreview,
};
