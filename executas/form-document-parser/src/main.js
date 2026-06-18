#!/usr/bin/env node
"use strict";

const readline = require("node:readline");
const { parseDocuments } = require("./documentParser");

const PROTOCOL_VERSION = "2.0";

const MANIFEST = {
  name: "form-document-parser",
  display_name: "Form Document Parser",
  version: "0.1.0",
  description:
    "Parses target forms and source documents into clean structured evidence JSON for Form Memory Filler.",
  tools: [
    {
      name: "parse_documents",
      description:
        "Convert a target form and optional source documents into structured evidence JSON. This tool does not fill forms, draft answers, propose memory, or save memory.",
      parameters: [
        {
          name: "targetForm",
          type: "object",
          description:
            "Target form document with fileName, mimeType, and either text or contentBase64.",
          required: true,
        },
        {
          name: "sourceDocuments",
          type: "array",
          description:
            "Optional source documents with fileName, mimeType, and either text or contentBase64.",
          required: false,
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
  parse_documents: parseDocuments,
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
      error.message || "Unexpected error in Form Document Parser."
    );
  }
}

function handleInitialize() {
  return {
    protocolVersion: PROTOCOL_VERSION,
    serverInfo: {
      name: MANIFEST.display_name,
      version: MANIFEST.version,
    },
    capabilities: {},
  };
}

function handleDescribe() {
  return MANIFEST;
}

async function handleInvoke(params = {}) {
  const toolName = params.tool || params.name;
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

  try {
    const data = await handler(input);
    return createToolSuccess(data, toolName);
  } catch (error) {
    return safeHandleError(error);
  }
}

function handleHealth() {
  return {
    status: "ok",
    tool: "form_document_parser",
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
      : "Unexpected error in Form Document Parser.";
  const details = error && error.details ? error.details : null;

  return createToolError(code, message, details);
}

function sendResponse(response) {
  process.stdout.write(`${JSON.stringify(response)}\n`);
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
  process.stderr.write("[form-document-parser] Form Document Parser Executa started\n");

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
      sendResponse(createJsonRpcErrorResponse(null, -32700, "Parse error"));
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
