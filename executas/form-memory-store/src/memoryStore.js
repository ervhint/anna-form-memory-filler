"use strict";

const {
  MEMORY_VERSION,
  getEmptyMemoryData,
  readMemoryFromAps,
  writeMemoryToAps,
} = require("./apsClient");

const {
  validateMemoryInputItem,
  normalizeMemoryInputItem,
} = require("./validators");

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

function createMemoryCard(item, currentTime) {
  return {
    id: generateMemoryId(),
    label: item.label,
    value: item.value,
    category: item.category,
    sensitivity: item.sensitivity,
    approved_by_user: true,
    source_note: item.source_note,
    created_at: currentTime,
    updated_at: currentTime,
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
    approved_by_user: true,
    source_note: newItem.source_note,
    created_at: existingItem.created_at,
    updated_at: currentTime,
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

function generateMemoryId() {
  const timestamp = Date.now();
  const randomPart = Math.random().toString(36).slice(2, 10);

  return `mem_${timestamp}_${randomPart}`;
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
  createMemoryCard,
  updateExistingMemoryItem,
  findSimilarMemoryItem,
  generateMemoryId,
  createPreview,
};
