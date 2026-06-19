"use strict";

const MEMORY_KEY = "memory/cards.v1";
const MEMORY_VERSION = 1;
const MEMORY_SCOPE = "user";
const APS_NOT_CONNECTED_MESSAGE =
  "Anna APS storage is not connected or not granted. Please update/reinstall the app and allow persistent storage permission for Form Memory Store.";

/*
 * Anna APS connection point.
 *
 * Official Anna examples expose APS from an Executa through v2 reverse
 * JSON-RPC storage calls. The Node SDK shape is StorageClient.get(key,
 * { scope }) and StorageClient.set(key, value, { scope }).
 *
 * TODO: When src/main.js implements the v2 Executa protocol and routes
 * reverse-RPC responses, assign that real StorageClient here. Until then,
 * reads safely return empty memory and writes fail clearly instead of
 * pretending data was persisted.
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

async function readMemoryFromAps() {
  if (!apsStorageClient) {
    throw createStorageError("APS_NOT_CONNECTED", APS_NOT_CONNECTED_MESSAGE);
  }

  try {
    const rawValue = await apsStorageClient.get(MEMORY_KEY, {
      scope: MEMORY_SCOPE,
    });

    if (!rawValue || rawValue.exists === false) {
      return getEmptyMemoryData();
    }

    if (Object.prototype.hasOwnProperty.call(rawValue, "value")) {
      return normalizeMemoryData(rawValue.value);
    }

    return normalizeMemoryData(rawValue);
  } catch (error) {
    if (isStorageConnectionError(error)) {
      throw createStorageError(
        "APS_NOT_CONNECTED",
        APS_NOT_CONNECTED_MESSAGE,
        error
      );
    }

    throw createStorageError(
      "APS_READ_FAILED",
      "Failed to read memory from Anna APS.",
      error
    );
  }
}

async function writeMemoryToAps(memoryData) {
  if (!apsStorageClient) {
    throw createStorageError(
      "APS_NOT_CONNECTED",
      "Anna APS storage client is not connected yet."
    );
  }

  try {
    const normalizedMemoryData = normalizeMemoryData(memoryData);

    await apsStorageClient.set(MEMORY_KEY, normalizedMemoryData, {
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

    throw createStorageError(
      "APS_WRITE_FAILED",
      "Failed to write memory to Anna APS.",
      error
    );
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
  MEMORY_VERSION,
  MEMORY_SCOPE,
  getEmptyMemoryData,
  setApsStorageClient,
  readMemoryFromAps,
  writeMemoryToAps,
  normalizeMemoryData,
};
