import { AnnaAppRuntime } from "/static/anna-apps/_sdk/latest/index.js";

"use strict";

const TOOL_BRIDGE_NOT_CONNECTED = {
  code: "ANNA_TOOL_BRIDGE_NOT_CONNECTED",
  message: "Anna Tool bridge is not connected in this local UI preview.",
};

const BUNDLED_TOOL_HANDLES = {
  formDocumentParser: "form-document-parser",
  formMemoryStore: "form-memory-store",
};

function resolveToolId(handle, fallbackToolId) {
  return (
    (window.__ANNA_TOOL_IDS__ && window.__ANNA_TOOL_IDS__[handle]) ||
    fallbackToolId
  );
}

const TOOL_IDS = {
  formDocumentParser: resolveToolId(
    BUNDLED_TOOL_HANDLES.formDocumentParser,
    "tool-ervhint-form-document-parser-rfbj9n9w"
  ),
  formMemoryStore: resolveToolId(
    BUNDLED_TOOL_HANDLES.formMemoryStore,
    "tool-ervhint-form-memory-store-fm7jbhng"
  ),
};

const DOCX_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

let annaClient = null;
let annaConnectError = null;
let currentBridgeSource = "none";

const appState = {
  status: "idle",
  statusMessage: "No form loaded yet.",
  formOverview: null,
  draftAnswers: [],
  missingInformation: [],
  proposedMemoryUpdates: [],
  savedMemory: [],
  evidenceJson: null,
  parseStatus: "idle",
  parseError: null,
};

async function init() {
  attachEventListeners();
  exposeIntegrationApi();
  renderApp();
  setStatus("No form loaded yet.");
  setUploadStatus("Parse button ready.");

  try {
    annaClient = await AnnaAppRuntime.connect();
    annaConnectError = null;
    currentBridgeSource = "AnnaAppRuntime.connect";
  } catch (error) {
    annaClient = null;
    annaConnectError = error;
    currentBridgeSource = "none";
    setUploadStatus("Anna bridge is unavailable. Upload UI is ready, but tools may not run.", "error");
  }

  renderBridgeDiagnostics();
}

function attachEventListeners() {
  const app = document.getElementById("app");
  const refreshButton = document.getElementById("refresh-memory-button");
  const demoButton = document.getElementById("load-neutral-demo-button");
  const importButton = document.getElementById("load-review-json-button");
  const parseButton = document.getElementById("parse-documents-button");
  const clearUploadsButton = document.getElementById("clear-uploads-button");

  if (refreshButton) {
    refreshButton.addEventListener("click", handleRefreshSavedMemory);
  }

  if (demoButton) {
    demoButton.addEventListener("click", handleLoadNeutralDemo);
  }

  if (importButton) {
    importButton.addEventListener("click", handleLoadReviewJson);
  }

  if (parseButton) {
    parseButton.addEventListener("click", handleParseDocuments);
  }

  if (clearUploadsButton) {
    clearUploadsButton.addEventListener("click", handleClearUploads);
  }

  if (app) {
    app.addEventListener("click", handleDelegatedClick);
    app.addEventListener("input", handleDelegatedInput);
  }

  window.addEventListener("message", (event) => {
    if (
      event.data &&
      event.data.type === "FORM_MEMORY_FILLER_REVIEW_DATA"
    ) {
      window.FormMemoryFiller.loadReviewData(event.data.payload);
    }
  });
}

function exposeIntegrationApi() {
  window.FormMemoryFiller = {
    loadReviewData(data) {
      loadReviewData(data);
    },
    loadEvidenceJson(data) {
      loadEvidenceJson(data);
    },
    getState() {
      return appState;
    },
  };

  window.FormMemoryFillerDebug = {
    getBridgeInfo() {
      const fallbackAnna = window.anna || null;
      const fallbackAnnaCaps = window.Anna || null;

      return {
        hasAnnaClient: Boolean(annaClient),
        hasAnnaClientTools: Boolean(annaClient && annaClient.tools),
        hasAnnaClientInvoke: Boolean(
          annaClient &&
            annaClient.tools &&
            typeof annaClient.tools.invoke === "function"
        ),
        annaConnectError: annaConnectError
          ? {
              name: annaConnectError.name,
              message: annaConnectError.message,
            }
          : null,
        hasWindowAnna: Boolean(fallbackAnna),
        hasWindowAnnaInvoke: Boolean(
          fallbackAnna &&
            fallbackAnna.tools &&
            typeof fallbackAnna.tools.invoke === "function"
        ),
        hasWindowAnnaCaps: Boolean(fallbackAnnaCaps),
        hasWindowAnnaCapsInvoke: Boolean(
          fallbackAnnaCaps &&
            fallbackAnnaCaps.tools &&
            typeof fallbackAnnaCaps.tools.invoke === "function"
        ),
        annaToolIds: window.__ANNA_TOOL_IDS__ || null,
        resolvedParserToolId: TOOL_IDS.formDocumentParser,
        resolvedMemoryStoreToolId: TOOL_IDS.formMemoryStore,
        currentBridgeSource,
      };
    },
  };
}

function renderApp() {
  renderParsedEvidence();
  renderFormOverview();
  renderDraftAnswers();
  renderMissingInformation();
  renderProposedMemoryUpdates();
  renderSavedMemory();
  renderStatusMessage();
}

function renderParsedEvidence() {
  const target = document.getElementById("parsed-evidence-summary");

  if (!target) return;

  if (!appState.evidenceJson) {
    if (appState.parseError) {
      target.innerHTML = `
        <article class="evidence-card parse-error-card">
          <div class="card-header">
            <h3>Parser error</h3>
            <span class="status-badge status-needs_input">Needs attention</span>
          </div>
          <p class="meta-text">${escapeHtml(appState.parseError)}</p>
        </article>
      `;
      return;
    }

    target.innerHTML = renderEmptyState("No parsed evidence yet.");
    return;
  }

  const evidence = appState.evidenceJson;
  const targetForm = evidence.targetForm || {};
  const sourceDocuments = normalizeArray(evidence.sourceDocuments);
  const targetChunks = normalizeArray(targetForm.chunks);
  const detectedFields = normalizeArray(targetForm.detectedFields);

  target.innerHTML = `
    <article class="evidence-card">
      <div class="card-header">
        <h3>${escapeHtml(targetForm.fileName || "Target form")}</h3>
        <span class="status-badge status-approved">Parsed</span>
      </div>
      <div class="evidence-stats">
        ${renderEvidenceStat("Detected fields", detectedFields.length)}
        ${renderEvidenceStat("Target chunks", targetChunks.length)}
        ${renderEvidenceStat("Source documents", sourceDocuments.length)}
      </div>
      ${
        sourceDocuments.length > 0
          ? `<div class="evidence-sources">${sourceDocuments
              .map(renderEvidenceSource)
              .join("")}</div>`
          : ""
      }
      <label class="field-label" for="evidence-json-output">Evidence JSON</label>
      <textarea id="evidence-json-output" class="json-import-input evidence-json-output" readonly>${escapeHtml(
        JSON.stringify(evidence, null, 2)
      )}</textarea>
      <div class="section-actions">
        <button id="copy-evidence-json-button" type="button" data-action="copy-evidence-json">Copy Evidence JSON</button>
      </div>
    </article>
  `;
}

function renderEvidenceStat(label, value) {
  return `
    <div class="evidence-stat">
      <span class="label">${escapeHtml(label)}</span>
      <span class="value">${escapeHtml(value)}</span>
    </div>
  `;
}

function renderEvidenceSource(sourceDocument) {
  const extractedFields = normalizeArray(sourceDocument.extractedFields);
  const chunks = normalizeArray(sourceDocument.chunks);

  return `
    <div class="evidence-source">
      <strong>${escapeHtml(sourceDocument.fileName || "Source document")}</strong>
      <span>${escapeHtml(extractedFields.length)} extracted fields</span>
      <span>${escapeHtml(chunks.length)} chunks</span>
    </div>
  `;
}

function renderFormOverview() {
  const target = document.getElementById("form-overview");

  if (!target) return;

  if (!appState.formOverview) {
    target.innerHTML = `
      <div class="empty-state overview-empty">
        <strong>No form loaded yet.</strong>
        <span>Ask Anna to help fill a form, then review draft answers here.</span>
      </div>
    `;
    return;
  }

  const overview = appState.formOverview;
  const totalRequirements =
    appState.draftAnswers.length + appState.missingInformation.length;
  const pendingMemoryCount = appState.proposedMemoryUpdates.filter(
    (item) => getMemoryApprovalState(item) === "pending"
  ).length;

  target.innerHTML = [
    renderOverviewCard("Form Title", overview.title || "Untitled form"),
    renderOverviewCard("Purpose", overview.purpose || "Not specified"),
    renderOverviewCard("Draft Answers", appState.draftAnswers.length),
    renderOverviewCard("Missing Items", appState.missingInformation.length),
    renderOverviewCard("Proposed Memory", pendingMemoryCount),
    renderOverviewCard("Detected Requirements", totalRequirements),
  ].join("");
}

function renderOverviewCard(label, value) {
  return `
    <article class="overview-card">
      <span class="label">${escapeHtml(label)}</span>
      <span class="value">${escapeHtml(value)}</span>
    </article>
  `;
}

function renderDraftAnswers() {
  const target = document.getElementById("draft-answers-list");

  if (!target) return;

  if (appState.draftAnswers.length === 0) {
    target.innerHTML = renderEmptyState("No draft answers yet.");
    return;
  }

  target.innerHTML = appState.draftAnswers
    .map((answer) => {
      const id = answer.id;
      return `
        <article class="answer-card">
          <div class="card-header">
            <h3>${escapeHtml(answer.field || answer.requirement_label || "Untitled field")}</h3>
            ${renderStatusBadge(answer)}
          </div>
          <p class="question-text">${escapeHtml(
            answer.question || answer.requested_by_form || "No prompt text provided."
          )}</p>
          <textarea class="draft-answer-input" data-answer-id="${escapeHtml(
            id
          )}">${escapeHtml(answer.answer || answer.draft_answer || "")}</textarea>
          <div class="source-row">
            <span>Memory used: ${escapeHtml(formatList(answer.memoryUsed || answer.memory_used))}</span>
            <span>Sources used: ${escapeHtml(formatList(answer.sourcesUsed || answer.sources_used || answer.source))}</span>
            <span>Confidence: ${escapeHtml(answer.confidence || "not specified")}</span>
          </div>
          <div class="card-actions">
            <button type="button" class="primary-button" data-action="approve-answer" data-answer-id="${escapeHtml(
              id
            )}">${answer.approved ? "Approved" : "Approve Answer"}</button>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderMissingInformation() {
  const target = document.getElementById("missing-information-list");

  if (!target) return;

  if (appState.missingInformation.length === 0) {
    target.innerHTML = renderEmptyState("No missing information detected.");
    return;
  }

  target.innerHTML = appState.missingInformation
    .map(
      (item) => `
        <article class="missing-card">
          <div class="card-header">
            <h3>${escapeHtml(item.field || item.requirement_label || "Untitled field")}</h3>
            ${renderStatusBadge({ ...item, status: "needs_user_input" })}
          </div>
          <p class="meta-text">${escapeHtml(
            item.reason || item.missing_reason || "Anna needs more information for this field."
          )}</p>
          ${
            item.question || item.suggested_question
              ? `<p class="question-text">${escapeHtml(
                  item.question || item.suggested_question
                )}</p>`
              : ""
          }
        </article>
      `
    )
    .join("");
}

function renderProposedMemoryUpdates() {
  const target = document.getElementById("proposed-memory-list");

  if (!target) return;

  if (appState.proposedMemoryUpdates.length === 0) {
    target.innerHTML = renderEmptyState("No proposed memory updates.");
    return;
  }

  target.innerHTML = appState.proposedMemoryUpdates
    .map(
      (item) => `
        <article class="memory-card">
          <div class="card-header">
            <h3>${escapeHtml(item.label || "Untitled memory")}</h3>
            ${renderStatusBadge(item)}
          </div>
          <textarea class="memory-value-input" data-memory-id="${escapeHtml(
            item.id
          )}">${escapeHtml(item.value || "")}</textarea>
          <p class="meta-text">Sensitivity: ${renderSensitivityBadge(
            item.sensitivity
          )}</p>
          <p class="meta-text">Reason: ${escapeHtml(
            item.reason || item.source_note || "Not specified"
          )}</p>
          <div class="card-actions">
            <button type="button" class="primary-button" data-action="approve-memory" data-memory-id="${escapeHtml(
              item.id
            )}">Approve Memory</button>
            <button type="button" class="ghost-button" data-action="skip-memory" data-memory-id="${escapeHtml(
              item.id
            )}">Skip</button>
          </div>
        </article>
      `
    )
    .join("");
}

function renderSavedMemory() {
  const target = document.getElementById("saved-memory-list");

  if (!target) return;

  if (appState.savedMemory.length === 0) {
    target.innerHTML = renderEmptyState("No saved memory loaded yet.");
    return;
  }

  target.innerHTML = appState.savedMemory
    .map(
      (item) => `
        <article class="memory-card">
          <div class="card-header">
            <h3>${escapeHtml(item.label || "Untitled memory")}</h3>
            ${renderSensitivityBadge(item.sensitivity)}
          </div>
          <p class="question-text">${escapeHtml(item.preview || item.value || "")}</p>
          <p class="meta-text">Category: ${escapeHtml(item.category || "general")}</p>
          <p class="meta-text">Last confirmed: ${escapeHtml(
            item.last_confirmed_at || item.lastConfirmedAt || "unknown"
          )}</p>
          <div class="card-actions">
            <button type="button" class="danger-button" data-action="delete-memory" data-memory-id="${escapeHtml(
              item.id
            )}">Delete</button>
          </div>
        </article>
      `
    )
    .join("");
}

function renderStatusMessage() {
  const target = document.getElementById("status-message");

  if (target) {
    target.textContent = appState.statusMessage;
  }
}

function renderEmptyState(message) {
  return `<div class="empty-state">${escapeHtml(message)}</div>`;
}

function handleDelegatedClick(event) {
  const button = event.target.closest("[data-action]");

  if (!button) return;

  const action = button.dataset.action;
  const answerId = button.dataset.answerId;
  const memoryId = button.dataset.memoryId;

  if (action === "approve-answer" && answerId) {
    handleApproveAnswer(answerId);
    return;
  }

  if (action === "approve-memory" && memoryId) {
    handleApproveMemory(memoryId);
    return;
  }

  if (action === "skip-memory" && memoryId) {
    handleSkipMemory(memoryId);
    return;
  }

  if (action === "delete-memory" && memoryId) {
    handleDeleteMemoryItem(memoryId);
    return;
  }

  if (action === "copy-evidence-json") {
    handleCopyEvidenceJson();
  }
}

function handleDelegatedInput(event) {
  const target = event.target;

  if (target.matches("[data-answer-id]")) {
    handleDraftAnswerChange(target.dataset.answerId, target.value);
  }

  if (target.matches("[data-memory-id]")) {
    handleMemoryValueChange(target.dataset.memoryId, target.value);
  }
}

function handleLoadNeutralDemo() {
  loadReviewData(createNeutralDemoData());
  setStatus("Neutral demo data loaded for testing.");
}

function handleLoadReviewJson() {
  const input = document.getElementById("review-json-input");
  const rawValue = input ? input.value : "";

  try {
    const parsed = JSON.parse(rawValue);
    loadReviewData(parsed);
    setStatus("Review JSON loaded.");
  } catch (error) {
    setStatus(`Review JSON could not be loaded: ${error.message}`);
  }
}

async function handleParseDocuments() {
  console.log("parseDocuments clicked");
  setUploadStatus("Parse documents clicked.");

  const targetInput = document.getElementById("target-form-file");
  const sourceInput = document.getElementById("source-document-files");
  const targetFile = targetInput && targetInput.files ? targetInput.files[0] : null;
  const sourceFiles =
    sourceInput && sourceInput.files ? Array.from(sourceInput.files) : [];
  const anna = window.anna || window.Anna;

  console.log("selected target file", targetFile && targetFile.name);
  console.log("selected source files", sourceFiles.map((file) => file.name));
  console.log("anna bridge available", Boolean(annaClient || anna));
  console.log(
    "anna tools available",
    Boolean(
      (annaClient &&
        annaClient.tools &&
        typeof annaClient.tools.invoke === "function") ||
        (anna && anna.tools && typeof anna.tools.invoke === "function")
    )
  );

  if (!targetFile) {
    setParseError("No target form selected.");
    return;
  }

  if (sourceFiles.length === 0) {
    setParseError("No source documents selected.");
    return;
  }

  try {
    appState.parseStatus = "parsing";
    appState.parseError = null;
    setStatus("Parsing uploaded documents...");
    setUploadStatus("Converting files...");
    renderParsedEvidence();

    const parserInput = {
      targetForm: await createParserDocumentInput(targetFile),
      sourceDocuments: await Promise.all(
        sourceFiles.map(createParserDocumentInput)
      ),
    };

    console.log("calling parser tool", {
      toolId: TOOL_IDS.formDocumentParser,
      method: "parse_documents",
      targetFileName: parserInput.targetForm.fileName,
      sourceCount: parserInput.sourceDocuments.length,
    });

    setUploadStatus("Calling Form Document Parser...");

    const result = await callTool("parse_documents", parserInput, {
      toolId: TOOL_IDS.formDocumentParser,
    });

    console.log("parser tool response", result);

    if (result.success) {
      loadEvidenceJson(result.data);
      appState.parseStatus = "parsed";
      appState.parseError = null;
      setUploadStatus("Documents parsed successfully.", "success");
      setStatus(
        "Documents parsed successfully. Copy the Evidence JSON and ask Anna to generate Review JSON."
      );
      return;
    }

    if (result.error && result.error.code === "ANNA_TOOL_BRIDGE_NOT_CONNECTED") {
      setParseError("Parser tool is not available in this session yet.");
      return;
    }

    setParseError(getToolErrorMessage(result.error));
  } catch (error) {
    setParseError(error.message || "Documents could not be parsed.");
  }
}

function handleClearUploads() {
  const targetInput = document.getElementById("target-form-file");
  const sourceInput = document.getElementById("source-document-files");

  if (targetInput) targetInput.value = "";
  if (sourceInput) sourceInput.value = "";

  appState.evidenceJson = null;
  appState.parseStatus = "idle";
  appState.parseError = null;
  renderParsedEvidence();
  setUploadStatus("Parse button ready.");
  setStatus("Uploads cleared.");
}

async function createParserDocumentInput(file) {
  return {
    fileName: file.name,
    mimeType: file.type || DOCX_MIME_TYPE,
    contentBase64: await readFileAsBase64(file),
  };
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const result = String(reader.result || "");
      const commaIndex = result.indexOf(",");
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
    };

    reader.onerror = () => {
      reject(new Error(`Could not read file: ${file.name}`));
    };

    reader.readAsDataURL(file);
  });
}

function loadEvidenceJson(data) {
  appState.evidenceJson = data || null;
  appState.parseStatus = data ? "parsed" : "idle";
  appState.parseError = null;
  renderParsedEvidence();
}

function loadReviewData(data) {
  const normalized = normalizeReviewData(data);

  appState.status = "review_ready";
  appState.formOverview = normalized.formOverview;
  appState.draftAnswers = normalized.draftAnswers;
  appState.missingInformation = normalized.missingInformation;
  appState.proposedMemoryUpdates = normalized.proposedMemoryUpdates;
  appState.savedMemory = normalized.savedMemory;

  renderApp();
}

function normalizeReviewData(data) {
  const source = data && typeof data === "object" ? data : {};

  return {
    formOverview:
      source.formOverview && typeof source.formOverview === "object"
        ? {
            title: source.formOverview.title || "Untitled form",
            purpose: source.formOverview.purpose || "Not specified",
          }
        : null,
    draftAnswers: normalizeArray(source.draftAnswers).map(normalizeDraftAnswer),
    missingInformation: normalizeArray(source.missingInformation).map(
      normalizeMissingInformation
    ),
    proposedMemoryUpdates: normalizeArray(source.proposedMemoryUpdates).map(
      normalizeProposedMemory
    ),
    savedMemory: normalizeArray(source.savedMemory).map(normalizeSavedMemory),
  };
}

function normalizeDraftAnswer(item, index) {
  const source = item && typeof item === "object" ? item : {};

  return {
    id: source.id || `draft_${index + 1}`,
    field: source.field || source.requirement_label || "Untitled field",
    question: source.question || source.requested_by_form || "",
    answer: source.answer || source.draft_answer || "",
    confidence: source.confidence || "",
    source: source.source || "",
    memoryUsed: normalizeList(source.memoryUsed || source.memory_used),
    sourcesUsed: normalizeList(source.sourcesUsed || source.sources_used || source.source),
    status: source.status || "needs_review",
    approved: source.approved === true,
  };
}

function normalizeMissingInformation(item, index) {
  const source = item && typeof item === "object" ? item : {};

  return {
    id: source.id || `missing_${index + 1}`,
    field: source.field || source.requirement_label || "Untitled field",
    reason: source.reason || source.missing_reason || "",
    question: source.question || source.suggested_question || "",
    status: "needs_user_input",
  };
}

function normalizeProposedMemory(item, index) {
  const source = item && typeof item === "object" ? item : {};

  return {
    id: source.id || `memory_proposal_${index + 1}`,
    label: source.label || "Untitled memory",
    value: source.value || "",
    category: source.category || "general",
    sensitivity: source.sensitivity || "medium",
    reason: source.reason || source.source_note || "",
    approval_state: source.approval_state || source.status || "pending",
  };
}

function normalizeSavedMemory(item, index) {
  const source = item && typeof item === "object" ? item : {};

  return {
    id: source.id || `saved_memory_${index + 1}`,
    label: source.label || "Untitled memory",
    value: source.value || "",
    preview: source.preview || source.value || "",
    category: source.category || "general",
    sensitivity: source.sensitivity || "medium",
    last_confirmed_at: source.last_confirmed_at || source.lastConfirmedAt || "",
  };
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeList(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string" && value.trim()) return [value];
  return [];
}

function handleDraftAnswerChange(answerId, newValue) {
  const answer = appState.draftAnswers.find((item) => item.id === answerId);

  if (!answer) return;

  answer.answer = newValue;
  answer.status = "needs_review";
  answer.approved = false;
  setStatus("Draft answer updated. Please review before approval.");
}

function handleApproveAnswer(answerId) {
  const answer = appState.draftAnswers.find((item) => item.id === answerId);

  if (!answer) {
    setStatus("Answer not found.");
    return;
  }

  answer.approved = true;
  answer.status = "approved";
  setStatus("Answer approved for this form. Memory is not saved automatically.");
  renderApp();
}

function handleMemoryValueChange(memoryId, newValue) {
  const item = appState.proposedMemoryUpdates.find(
    (memory) => memory.id === memoryId
  );

  if (!item) return;

  item.value = newValue;

  if (getMemoryApprovalState(item) === "approved") {
    item.approval_state = "pending";
  }

  setStatus("Memory proposal edited. Approve it again before saving.");
}

async function handleApproveMemory(memoryId) {
  const item = appState.proposedMemoryUpdates.find(
    (memory) => memory.id === memoryId
  );

  if (!item) {
    setStatus("Memory proposal not found.");
    return;
  }

  if (!String(item.value || "").trim()) {
    setStatus("Memory value is empty. Please edit before approving.");
    return;
  }

  appState.status = "saving_memory";
  setStatus("Saving approved memory...");

  const result = await callTool("save_approved_memory", {
    items: [
      {
        label: item.label,
        value: item.value,
        category: item.category,
        sensitivity: item.sensitivity,
        source_note: item.reason,
      },
    ],
  });

  if (result.success) {
    item.approval_state = "approved";
    setStatus("Approved memory saved.");
    await handleRefreshSavedMemory();
  } else {
    setStatus(`Memory could not be saved: ${result.error.message}`);
  }

  appState.status = "review_ready";
  renderApp();
}

function handleSkipMemory(memoryId) {
  const item = appState.proposedMemoryUpdates.find(
    (memory) => memory.id === memoryId
  );

  if (!item) {
    setStatus("Memory proposal not found.");
    return;
  }

  item.approval_state = "skipped";
  setStatus("Memory proposal skipped. It was not saved.");
  renderApp();
}

async function handleRefreshSavedMemory() {
  appState.status = "loading_memory";
  setStatus("Loading saved memory...");

  const result = await callTool("list_memory", {});

  if (result.success) {
    appState.savedMemory = normalizeArray(result.data.items).map(normalizeSavedMemory);
    setStatus("Saved memory loaded.");
  } else {
    setStatus(`Saved memory could not be loaded: ${result.error.message}`);
  }

  appState.status = "review_ready";
  renderApp();
}

async function handleDeleteMemoryItem(memoryId) {
  const confirmed = window.confirm("Delete this saved memory item?");

  if (!confirmed) return;

  setStatus("Deleting memory...");

  const result = await callTool("delete_memory_item", { id: memoryId });

  if (result.success) {
    appState.savedMemory = appState.savedMemory.filter(
      (item) => item.id !== memoryId
    );
    setStatus("Saved memory deleted.");
  } else {
    setStatus(`Memory could not be deleted: ${result.error.message}`);
  }

  renderApp();
}

async function callTool(toolName, args = {}, options = {}) {
  const toolId = options.toolId || getToolIdForMethod(toolName);
  const bridge = getToolBridge();

  if (bridge.client && typeof bridge.client.tools.invoke === "function") {
    currentBridgeSource = bridge.source;
    renderBridgeDiagnostics();

    try {
      const response = await bridge.client.tools.invoke({
        tool_id: toolId,
        method: toolName,
        args,
      });

      return normalizeToolResponse(response);
    } catch (error) {
      return {
        success: false,
        error: {
          code: error.code || "TOOL_INVOKE_ERROR",
          message: error.message || "Tool invocation failed.",
          details: error.details || null,
        },
      };
    }
  }

  currentBridgeSource = "none";
  renderBridgeDiagnostics();

  return {
    success: false,
    error: TOOL_BRIDGE_NOT_CONNECTED,
  };
}

function getToolBridge() {
  if (
    annaClient &&
    annaClient.tools &&
    typeof annaClient.tools.invoke === "function"
  ) {
    return {
      source: "AnnaAppRuntime.connect",
      client: annaClient,
    };
  }

  const fallbackAnna = window.anna || null;

  if (
    fallbackAnna &&
    fallbackAnna.tools &&
    typeof fallbackAnna.tools.invoke === "function"
  ) {
    return {
      source: "window.anna",
      client: fallbackAnna,
    };
  }

  const fallbackAnnaCaps = window.Anna || null;

  if (
    fallbackAnnaCaps &&
    fallbackAnnaCaps.tools &&
    typeof fallbackAnnaCaps.tools.invoke === "function"
  ) {
    return {
      source: "window.Anna",
      client: fallbackAnnaCaps,
    };
  }

  return {
    source: "none",
    client: null,
  };
}

function getToolIdForMethod(toolName) {
  if (toolName === "parse_documents") {
    return TOOL_IDS.formDocumentParser;
  }

  return TOOL_IDS.formMemoryStore;
}

function normalizeToolResponse(response) {
  if (response && typeof response === "object") {
    if (typeof response.success === "boolean") {
      return response;
    }

    if (response.result && typeof response.result.success === "boolean") {
      return response.result;
    }

    if (response.data && typeof response.data.success === "boolean") {
      return response.data;
    }
  }

  return {
    success: true,
    data: response,
  };
}

function getToolErrorMessage(error) {
  if (!error) {
    return "Parser returned an unknown error.";
  }

  return error.message || error.code || "Parser returned an unknown error.";
}

function setParseError(message) {
  appState.parseStatus = "error";
  appState.parseError = message;
  setUploadStatus(message, "error");
  setStatus(message);
  renderParsedEvidence();
}

async function handleCopyEvidenceJson() {
  if (!appState.evidenceJson) {
    setStatus("No Evidence JSON to copy.");
    return;
  }

  const text = JSON.stringify(appState.evidenceJson, null, 2);

  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      copyTextWithFallback(text);
    }

    setStatus("Evidence JSON copied.");
  } catch (error) {
    copyTextWithFallback(text);
    setStatus("Evidence JSON copied.");
  }
}

function copyTextWithFallback(text) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}

function setStatus(message) {
  appState.statusMessage = message;
  renderStatusMessage();
}

function setUploadStatus(message, type = "info") {
  const target = document.getElementById("upload-status-message");

  if (!target) return;

  target.textContent = message;
  target.className = `upload-status upload-status-${type}`;
}

function renderBridgeDiagnostics() {
  const target = document.getElementById("bridge-diagnostics");

  if (!target || !window.FormMemoryFillerDebug) return;

  const info = window.FormMemoryFillerDebug.getBridgeInfo();
  const rows = [
    [
      "window.__ANNA_TOOL_IDS__",
      info.annaToolIds ? "available" : "not available",
    ],
    ["Parser Tool ID", info.resolvedParserToolId],
    ["Memory Store Tool ID", info.resolvedMemoryStoreToolId],
    ["AnnaAppRuntime.connect()", info.hasAnnaClient ? "connected" : "not connected"],
    [
      "annaClient.tools.invoke",
      info.hasAnnaClientInvoke ? "available" : "not available",
    ],
    ["Current bridge source", info.currentBridgeSource || "none"],
  ];

  if (info.annaConnectError) {
    rows.push(["Connect error", info.annaConnectError.message || "Unknown error"]);
  }

  target.innerHTML = rows
    .map(
      ([label, value]) => `
        <div class="bridge-diagnostics-row">
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(value)}</strong>
        </div>
      `
    )
    .join("");
}

function createNeutralDemoData() {
  return {
    formOverview: {
      title: "Neutral Demo Form",
      purpose: "Demonstrate the review workspace with fictional data.",
    },
    draftAnswers: [
      {
        field: "Organization Name",
        question: "Enter the organization name for this example form.",
        answer: "Example Organization",
        confidence: "high",
        source: "Neutral demo document",
        status: "needs_review",
      },
      {
        field: "Project Summary",
        question: "Briefly describe the example project.",
        answer:
          "This fictional project demonstrates how drafted form answers can be reviewed before use.",
        confidence: "medium",
        source: "Neutral demo notes",
        status: "needs_review",
      },
    ],
    missingInformation: [
      {
        field: "Submission Date",
        reason: "The neutral demo documents do not include a date.",
      },
    ],
    proposedMemoryUpdates: [
      {
        label: "Example organization name",
        value: "Example Organization",
        sensitivity: "low",
        reason: "Useful for future fictional demo forms.",
      },
    ],
    savedMemory: [],
  };
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatList(items) {
  const list = normalizeList(items);
  return list.length > 0 ? list.join(", ") : "none";
}

function getStatusClass(item) {
  return `status-${getDisplayStatusKey(item)}`;
}

function getSensitivityClass(sensitivity) {
  const normalizedSensitivity = String(sensitivity || "").toLowerCase();

  if (normalizedSensitivity === "low") return "sensitivity-low";
  if (normalizedSensitivity === "medium") return "sensitivity-medium";
  if (normalizedSensitivity === "high") return "sensitivity-high";

  return "sensitivity-medium";
}

function renderStatusBadge(item) {
  return `<span class="status-badge ${escapeHtml(
    getStatusClass(item)
  )}">${escapeHtml(getDisplayStatusLabel(item))}</span>`;
}

function renderSensitivityBadge(sensitivity) {
  return `<span class="sensitivity-badge ${escapeHtml(
    getSensitivityClass(sensitivity)
  )}">${escapeHtml(sensitivity || "medium")}</span>`;
}

function getDisplayStatusLabel(item) {
  const key = getDisplayStatusKey(item);

  const labels = {
    approved: "Approved",
    needs_input: "Needs input",
    memory_pending: "Memory pending",
    memory_saved: "Memory saved",
    skipped: "Skipped",
    needs_review: "Needs review",
  };

  return labels[key] || "Needs review";
}

function getDisplayStatusKey(item) {
  if (item.approved === true || item.status === "approved") {
    return "approved";
  }

  const memoryState = getMemoryApprovalState(item);

  if (memoryState === "pending") {
    return "memory_pending";
  }

  if (memoryState === "approved") {
    return "memory_saved";
  }

  if (memoryState === "skipped") {
    return "skipped";
  }

  if (item.needs_user_input === true || item.status === "needs_user_input") {
    return "needs_input";
  }

  return "needs_review";
}

function getMemoryApprovalState(item) {
  return item.approval_state || "";
}

document.addEventListener("DOMContentLoaded", () => {
  init().catch((error) => {
    annaConnectError = error;
    currentBridgeSource = "none";
    setUploadStatus(
      error.message || "Anna bridge initialization failed.",
      "error"
    );
    renderBridgeDiagnostics();
  });
});
