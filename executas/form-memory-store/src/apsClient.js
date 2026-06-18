"use strict";

const MEMORY_KEY = "memory/cards.v1";
const MEMORY_VERSION = 1;
const MEMORY_SCOPE = "app";

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

function getEmptyMemoryData() {
  return {
    version: MEMORY_VERSION,
    items: [],
  };
}

async function readMemoryFromAps() {
  if (!apsStorageClient) {
    return getEmptyMemoryData();
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
    throw createStorageError(
      "APS_WRITE_FAILED",
      "Failed to write memory to Anna APS.",
      error
    );
  }
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
  }

  return error;
}

module.exports = {
  MEMORY_KEY,
  MEMORY_VERSION,
  getEmptyMemoryData,
  readMemoryFromAps,
  writeMemoryToAps,
  normalizeMemoryData,
};