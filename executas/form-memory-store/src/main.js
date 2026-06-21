#!/usr/bin/env node
"use strict";

const readline = require("node:readline");

const { setApsStorageClient } = require("./apsClient");

const {
  getMemory,
  saveApprovedMemory,
  listMemory,
  deleteMemoryItem,
} = require("./memoryStore");

const PROTOCOL_VERSION = "2.0";
const HOST_REQUEST_TIMEOUT_MS = 10000;

let nextHostRequestId = 1;
const pendingHostRequests = new Map();

const MANIFEST = {
  name: "form-memory-store",
  display_name: "Form Memory Store",
  version: "0.1.8",
  description:
    "Stores and retrieves user-approved reusable memory cards for Form Memory Filler.",
  host_capabilities: ["aps.kv"],
  storage: {
    scopes: ["user"],
    keys: ["form-memory-filler/cards.v1"],
  },
  tools: [
    {
      name: "get_memory",
      description:
        "Return all approved memory cards for the current user and Form Memory Filler app.",
      parameters: [],
    },
    {
      name: "save_approved_memory",
      description: "Save only memory cards explicitly approved by the user.",
      parameters: [
        {
          name: "items",
          type: "array",
          description:
            "Approved memory cards to save. Each item should include label, value, category, and sensitivity. Optional id updates an existing memory card.",
          required: true,
        },
      ],
    },
    {
      name: "list_memory",
      description: "Return saved memory cards in a user-friendly preview format.",
      parameters: [
        {
          name: "category",
          type: "string",
          description: "Optional category filter.",
          required: false,
        },
      ],
    },
    {
      name: "delete_memory_item",
      description: "Delete one saved memory item by ID.",
      parameters: [
        {
          name: "id",
          type: "string",
          description: "Memory item ID to delete.",
          required: true,
        },
      ],
    },
  ],
  runtime: {
    type: "node",
    min_version: "18.0.0",
  },
};

const TOOL_DISPATCH = {
  get_memory: getMemory,
  save_approved_memory: saveApprovedMemory,
  list_memory: listMemory,
  delete_memory_item: deleteMemoryItem,
};

async function handleJsonRpcRequest(request) {
  if (!request || typeof request !== "object") {
    return createJsonRpcErrorResponse(
      null,
      -32600,
      "Invalid JSON-RPC request."
    );
  }

  const { id = null, method, params = {} } = request;

  try {
    if (method === "initialize") {
      return createJsonRpcSuccessResponse(id, handleInitialize());
    }

    if (method === "describe") {
      return createJsonRpcSuccessResponse(id, handleDescribe());
    }

    if (method === "invoke") {
      const result = await handleInvoke(params);
      return createJsonRpcSuccessResponse(id, result);
    }

    if (method === "health") {
      return createJsonRpcSuccessResponse(id, handleHealth());
    }

    if (method === "shutdown") {
      return createJsonRpcSuccessResponse(id, {});
    }

    return createJsonRpcErrorResponse(
      id,
      -32601,
      `Method not found: ${method}`
    );
  } catch (error) {
    return createJsonRpcErrorResponse(
      id,
      -32603,
      error.message || "Unexpected error in Form Memory Store."
    );
  }
}

function handleInitialize() {
  setApsStorageClient(null);

  return {
    protocolVersion: PROTOCOL_VERSION,
    server_info: {
      name: MANIFEST.name,
      version: MANIFEST.version,
    },
    serverInfo: {
      name: MANIFEST.name,
      version: MANIFEST.version,
    },
    client_capabilities: {
      storage: {},
    },
    capabilities: {
      storage: {},
    },
  };
}

function handleDescribe() {
  setApsStorageClient(null);
  return MANIFEST;
}

function extractStorageToken(params = {}) {
  return (
    params.storage_token ||
    params.storageToken ||
    (params.context && params.context.storage_token) ||
    (params.context && params.context.storageToken) ||
    (params.meta && params.meta.storage_token) ||
    (params.meta && params.meta.storageToken) ||
    (params.authorization && params.authorization.storage_token) ||
    (params.authorization && params.authorization.storageToken) ||
    null
  );
}

function createMissingStorageTokenError(toolName) {
  return createToolError(
    "APS_NOT_CONNECTED",
    "Anna did not provide storage_token for this invoke. Check client_capabilities.storage, host_capabilities, app reinstall/update, and persistent storage permission grant.",
    {
      tool: "form-memory-store",
      operation: toolName || null,
      storage_scope: "user",
      storage_key: "form-memory-filler/cards.v1",
    }
  );
}

function toolNeedsStorage(toolName) {
  return Object.prototype.hasOwnProperty.call(TOOL_DISPATCH, toolName);
}

async function handleInvoke(params = {}) {
  const toolName = params.tool || params.name;
  const storageToken = extractStorageToken(params);
  const input =
    params.arguments && typeof params.arguments === "object"
      ? params.arguments
      : params.input && typeof params.input === "object"
        ? params.input
        : {};

  if (!toolName) {
    return createToolError("MISSING_TOOL", "Missing tool name.");
  }

  const handler = TOOL_DISPATCH[toolName];

  if (!handler) {
    return createToolError("UNKNOWN_TOOL", `Unknown tool function: ${toolName}`);
  }

  if (toolNeedsStorage(toolName) && !storageToken) {
    return createMissingStorageTokenError(toolName);
  }

  ensureApsStorageClient(storageToken);

  try {
    const data = await handler(input);
    return createToolSuccess(data, toolName);
  } catch (error) {
    return safeHandleError(error);
  } finally {
    setApsStorageClient(null);
  }
}

function handleHealth() {
  return {
    status: "ok",
    tool: "form_memory_store",
    version: MANIFEST.version,
  };
}

function createToolSuccess(data, tool) {
  const result = {
    success: true,
    data,
  };

  if (tool) {
    result.tool = tool;
  }

  return result;
}

function createToolError(code, message, details = null) {
  return {
    success: false,
    error: {
      code,
      message,
      details,
    },
  };
}

function createJsonRpcSuccessResponse(id, result) {
  return {
    jsonrpc: "2.0",
    id,
    result,
  };
}

function createJsonRpcErrorResponse(id, code, message, data) {
  const error = {
    code,
    message,
  };

  if (data !== undefined) {
    error.data = data;
  }

  return {
    jsonrpc: "2.0",
    id,
    error,
  };
}

function safeHandleError(error) {
  const code = error && error.code ? error.code : "INTERNAL_ERROR";
  const message =
    error && error.message
      ? error.message
      : "Unexpected error in Form Memory Store.";
  const details = error && error.details ? error.details : null;

  return createToolError(code, message, details);
}

function ensureApsStorageClient(storageToken) {
  if (!storageToken) {
    setApsStorageClient(null);
    return;
  }

  setApsStorageClient(createReverseRpcStorageClient(storageToken));
}

function createReverseRpcStorageClient(storageToken) {
  return {
    async get(key, options = {}) {
      const params = {
        key,
        scope: options.scope || "user",
        storage_token: storageToken,
      };

      return requestHostWithMethodFallback(
        ["storage/kv_get", "storage/get", "storage.get", "hostStorageGet"],
        params
      );
    },

    async set(key, value, options = {}) {
      const params = {
        key,
        value,
        scope: options.scope || "user",
        storage_token: storageToken,
      };

      return requestHostWithMethodFallback(
        ["storage/kv_set", "storage/set", "storage.set", "hostStorageSet"],
        params
      );
    },
  };
}

async function requestHostWithMethodFallback(methods, params) {
  let lastError = null;

  for (const method of methods) {
    try {
      return await sendHostRequest(method, params);
    } catch (error) {
      lastError = error;

      if (!isMethodNotFoundError(error)) {
        throw error;
      }
    }
  }

  throw lastError || new Error("Anna APS storage host method is unavailable.");
}

function isMethodNotFoundError(error) {
  return Boolean(
    error &&
      (error.code === -32601 ||
        error.code === "METHOD_NOT_FOUND" ||
        error.code === "UNKNOWN_METHOD")
  );
}

function sendHostRequest(method, params) {
  const id = nextHostRequestId++;
  const request = {
    jsonrpc: "2.0",
    id,
    method,
    params,
  };

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingHostRequests.delete(id);
      const error = new Error(
        "Anna APS storage host did not respond. Please update/reinstall the app and allow persistent storage permission for Form Memory Store."
      );
      error.code = "APS_HOST_TIMEOUT";
      reject(error);
    }, HOST_REQUEST_TIMEOUT_MS);

    pendingHostRequests.set(id, {
      resolve,
      reject,
      timeout,
    });

    sendMessage(request);
  });
}

function handleHostResponse(message) {
  if (!message || typeof message !== "object") {
    return false;
  }

  if (!Object.prototype.hasOwnProperty.call(message, "id")) {
    return false;
  }

  const pending = pendingHostRequests.get(message.id);

  if (!pending) {
    return false;
  }

  clearTimeout(pending.timeout);
  pendingHostRequests.delete(message.id);

  if (message.error) {
    const error = new Error(
      message.error.message || "Anna APS storage host returned an error."
    );
    error.code = message.error.code || "APS_HOST_ERROR";
    error.details = message.error.data || null;
    pending.reject(error);
    return true;
  }

  pending.resolve(message.result);
  return true;
}

function sendMessage(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function sendResponse(response) {
  sendMessage(response);
}

function parseJsonRpcLine(line) {
  try {
    return {
      request: JSON.parse(line),
      error: null,
    };
  } catch (error) {
    return {
      request: null,
      error,
    };
  }
}

function main() {
  process.stderr.write("[form-memory-store] Form Memory Store Executa started\n");

  const reader = readline.createInterface({
    input: process.stdin,
  });

  reader.on("line", async (rawLine) => {
    const line = rawLine.trim();

    if (!line) {
      return;
    }

    const parsed = parseJsonRpcLine(line);

    if (parsed.error) {
      sendResponse(
        createJsonRpcErrorResponse(null, -32700, "Parse error")
      );
      return;
    }

    if (handleHostResponse(parsed.request)) {
      return;
    }

    const response = await handleJsonRpcRequest(parsed.request);
    sendResponse(response);

    if (parsed.request.method === "shutdown") {
      reader.close();
    }
  });
}

if (require.main === module) {
  main();
}

module.exports = {
  MANIFEST,
  TOOL_DISPATCH,
  handleJsonRpcRequest,
  handleInitialize,
  handleDescribe,
  handleInvoke,
  handleHealth,
  createToolSuccess,
  createToolError,
  createJsonRpcSuccessResponse,
  createJsonRpcErrorResponse,
  safeHandleError,
  parseJsonRpcLine,
  main,
};




