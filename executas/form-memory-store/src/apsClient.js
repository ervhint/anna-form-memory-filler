"use strict";

const MEMORY_KEY = "form-memory-filler/cards.v1";
const DRAFT_SESSIONS_KEY = "form-memory-filler/draft-sessions.v1";
const MEMORY_VERSION = 1;
const DRAFT_SESSIONS_VERSION = 1;
const MEMORY_SCOPE = "user";
const APS_NOT_CONNECTED_MESSAGE =
  "Anna APS storage is not connected or not granted. Please update/reinstall the app and allow persistent storage permission for Form Memory Store.";

/*
 * Anna APS connection point.
 *
 * Official Anna examples expose APS from an Executa through v2 reverse
 * JSON-RPC storage calls. The Node SDK shape is StorageClient.get(key,
 * { scope }) and StorageClient.set(key, value, { scope }).
 */
let apsStorageClient = null;

function setApsStorageClient(storageClient) {
  apsStorageClient = storageClient || null;
}

function getEmptyMemoryData() {
  return {
    version: MEMORY_VERSION,
    items: [],
  };
}

function getEmptyDraftSessionData() {
  return {
    version: DRAFT_SESSIONS_VERSION,
    sessions: [],
  };
}

async function readMemoryFromAps() {
  return readDataFromAps(
    MEMORY_KEY,
    normalizeMemoryData,
    getEmptyMemoryData,
    "Failed to read memory from Anna APS."
  );
}

async function readDraftSessionsFromAps() {
  return readDataFromAps(
    DRAFT_SESSIONS_KEY,
    normalizeDraftSessionData,
    getEmptyDraftSessionData,
    "Failed to read draft sessions from Anna APS."
  );
}

async function readDataFromAps(key, normalizeData, getEmptyData, readErrorMessage) {
  if (!apsStorageClient) {
    throw createStorageError("APS_NOT_CONNECTED", APS_NOT_CONNECTED_MESSAGE);
  }

  try {
    const rawValue = await apsStorageClient.get(key, {
      scope: MEMORY_SCOPE,
    });

    if (!rawValue || rawValue.exists === false) {
      return getEmptyData();
    }

    if (Object.prototype.hasOwnProperty.call(rawValue, "value")) {
      return normalizeData(rawValue.value);
    }

    return normalizeData(rawValue);
  } catch (error) {
    if (isStorageConnectionError(error)) {
      throw createStorageError(
        "APS_NOT_CONNECTED",
        APS_NOT_CONNECTED_MESSAGE,
        error
      );
    }

    throw createStorageError("APS_READ_FAILED", readErrorMessage, error);
  }
}

async function writeMemoryToAps(memoryData) {
  return writeDataToAps(
    MEMORY_KEY,
    memoryData,
    normalizeMemoryData,
    "Failed to write memory to Anna APS."
  );
}

async function writeDraftSessionsToAps(draftSessionData) {
  return writeDataToAps(
    DRAFT_SESSIONS_KEY,
    draftSessionData,
    normalizeDraftSessionData,
    "Failed to write draft sessions to Anna APS."
  );
}

async function writeDataToAps(key, data, normalizeData, writeErrorMessage) {
  if (!apsStorageClient) {
    throw createStorageError(
      "APS_NOT_CONNECTED",
      "Anna APS storage client is not connected yet."
    );
  }

  try {
    const normalizedData = normalizeData(data);

    await apsStorageClient.set(key, normalizedData, {
      scope: MEMORY_SCOPE,
    });

    return {
      saved: true,
    };
  } catch (error) {
    if (isStorageConnectionError(error)) {
      throw createStorageError(
        "APS_NOT_CONNECTED",
        APS_NOT_CONNECTED_MESSAGE,
        error
      );
    }

    throw createStorageError("APS_WRITE_FAILED", writeErrorMessage, error);
  }
}

function isStorageConnectionError(error) {
  return Boolean(
    error &&
      (error.code === "APS_HOST_TIMEOUT" ||
        error.code === "APS_HOST_ERROR" ||
        error.code === -32008 ||
        error.code === -32021 ||
        error.code === -32601 ||
        error.code === "NOT_NEGOTIATED" ||
        error.code === "STORAGE_NOT_GRANTED" ||
        error.code === "STORAGE_ERR_NOT_GRANTED" ||
        error.code === "METHOD_NOT_FOUND" ||
        error.code === "UNKNOWN_METHOD")
  );
}

function normalizeMemoryData(rawValue) {
  if (rawValue === undefined || rawValue === null) {
    return getEmptyMemoryData();
  }

  let parsedValue = rawValue;

  if (typeof rawValue === "string") {
    try {
      parsedValue = JSON.parse(rawValue);
    } catch (_error) {
      return getEmptyMemoryData();
    }
  }

  if (
    !parsedValue ||
    typeof parsedValue !== "object" ||
    Array.isArray(parsedValue)
  ) {
    return getEmptyMemoryData();
  }

  if (!Array.isArray(parsedValue.items)) {
    return getEmptyMemoryData();
  }

  return {
    version: parsedValue.version || MEMORY_VERSION,
    items: parsedValue.items,
  };
}

function normalizeDraftSessionData(rawValue) {
  if (rawValue === undefined || rawValue === null) {
    return getEmptyDraftSessionData();
  }

  let parsedValue = rawValue;

  if (typeof rawValue === "string") {
    try {
      parsedValue = JSON.parse(rawValue);
    } catch (_error) {
      return getEmptyDraftSessionData();
    }
  }

  if (
    !parsedValue ||
    typeof parsedValue !== "object" ||
    Array.isArray(parsedValue)
  ) {
    return getEmptyDraftSessionData();
  }

  if (!Array.isArray(parsedValue.sessions)) {
    return getEmptyDraftSessionData();
  }

  return {
    version: parsedValue.version || DRAFT_SESSIONS_VERSION,
    sessions: parsedValue.sessions,
  };
}

function createStorageError(code, message, cause) {
  const error = new Error(message);
  error.code = code;

  if (cause) {
    error.cause = cause;
    error.details = {
      host_code: cause.code || null,
      host_message: cause.message || null,
      host_details: cause.details || null,
    };
  }

  return error;
}

module.exports = {
  MEMORY_KEY,
  DRAFT_SESSIONS_KEY,
  MEMORY_VERSION,
  DRAFT_SESSIONS_VERSION,
  MEMORY_SCOPE,
  getEmptyMemoryData,
  getEmptyDraftSessionData,
  setApsStorageClient,
  readMemoryFromAps,
  readDraftSessionsFromAps,
  writeMemoryToAps,
  writeDraftSessionsToAps,
  normalizeMemoryData,
  normalizeDraftSessionData,
};
