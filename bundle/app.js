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
  compactEvidenceJson: null,
  parseStatus: "idle",
  parseError: null,
  compactEvidenceStatus: "idle",
  compactEvidenceError: null,
  draftStatus: "idle",
  draftError: null,
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
  const compactEvidenceButton = document.getElementById("generate-compact-evidence-button");
  const generateButton = document.getElementById("generate-draft-answers-button");

  if (refreshButton) {
    refreshButton.addEventListener("click", () => handleRefreshSavedMemory(refreshButton));
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

  if (compactEvidenceButton) {
    compactEvidenceButton.addEventListener("click", handleGenerateCompactEvidence);
  }

  if (generateButton) {
    generateButton.addEventListener("click", handleGenerateDraftAnswers);
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
    loadCompactEvidenceJson(data) {
      loadCompactEvidenceJson(data);
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
        hasWindowAnnaAgent: Boolean(fallbackAnna && fallbackAnna.agent),
        hasWindowAnnaChat: Boolean(fallbackAnna && fallbackAnna.chat),
        hasWindowAnnaLlmComplete: Boolean(
          fallbackAnna &&
            fallbackAnna.llm &&
            typeof fallbackAnna.llm.complete === "function"
        ),
        hasWindowAnnaCaps: Boolean(fallbackAnnaCaps),
        hasWindowAnnaCapsInvoke: Boolean(
          fallbackAnnaCaps &&
            fallbackAnnaCaps.tools &&
            typeof fallbackAnnaCaps.tools.invoke === "function"
        ),
        hasWindowAnnaCapsAgent: Boolean(fallbackAnnaCaps && fallbackAnnaCaps.agent),
        hasWindowAnnaCapsChat: Boolean(fallbackAnnaCaps && fallbackAnnaCaps.chat),
        hasWindowAnnaCapsLlmComplete: Boolean(
          fallbackAnnaCaps &&
            fallbackAnnaCaps.llm &&
            typeof fallbackAnnaCaps.llm.complete === "function"
        ),
        hasAnnaClientAgent: Boolean(annaClient && annaClient.agent),
        hasAnnaClientChat: Boolean(annaClient && annaClient.chat),
        hasAnnaClientLlmComplete: Boolean(
          annaClient &&
            annaClient.llm &&
            typeof annaClient.llm.complete === "function"
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
  renderCompactEvidence();
  renderFormOverview();
  renderDraftAnswers();
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
  const targetText = String(targetForm.cleanText || "");

  target.innerHTML = `
    <article class="evidence-card">
      <div class="card-header">
        <h3>${escapeHtml(targetForm.fileName || "Target form")}</h3>
        <span class="status-badge status-approved">Parsed</span>
      </div>
      <div class="evidence-stats">
        ${renderEvidenceStat("Target text chars", targetText.length)}
        ${renderEvidenceStat("Source documents", sourceDocuments.length)}
        ${renderEvidenceStat("Parser mode", "Text only")}
      </div>
      ${
        sourceDocuments.length > 0
          ? `<div class="evidence-sources">${sourceDocuments
              .map(renderEvidenceSource)
              .join("")}</div>`
          : ""
      }
      <label class="field-label" for="evidence-json-output">Extracted Text Evidence JSON</label>
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
  const sourceText = String(sourceDocument.cleanText || "");

  return `
    <div class="evidence-source">
      <strong>${escapeHtml(sourceDocument.fileName || "Source document")}</strong>
      <span>${escapeHtml(sourceText.length)} text chars</span>
      <span>${escapeHtml(sourceDocument.mimeType || "document")}</span>
    </div>
  `;
}

function renderCompactEvidence() {
  const target = document.getElementById("compact-evidence-summary");

  if (!target) return;

  if (!appState.compactEvidenceJson) {
    if (appState.compactEvidenceError) {
      target.innerHTML = `
        <article class="evidence-card parse-error-card">
          <div class="card-header">
            <h3>Compact evidence error</h3>
            <span class="status-badge status-needs_input">Needs attention</span>
          </div>
          <p class="meta-text">${escapeHtml(appState.compactEvidenceError)}</p>
        </article>
      `;
      return;
    }

    target.innerHTML = renderEmptyState("No compact evidence yet.");
    return;
  }

  const compactEvidence = appState.compactEvidenceJson;
  const targetFields = normalizeArray(compactEvidence.targetFields);
  const sourceFacts = normalizeArray(compactEvidence.sourceFacts);
  const sourceDocNames = Array.from(
    new Set(sourceFacts.map((fact) => fact.sourceDocName).filter(Boolean))
  );

  target.innerHTML = `
    <article class="evidence-card compact-evidence-card">
      <div class="card-header">
        <h3>Compact Evidence</h3>
        <span class="status-badge status-approved">Ready for drafting</span>
      </div>
      <div class="evidence-stats">
        ${renderEvidenceStat("Target fields", targetFields.length)}
        ${renderEvidenceStat("Source facts", sourceFacts.length)}
        ${renderEvidenceStat("Source docs", sourceDocNames.length)}
      </div>
      <p class="meta-text">Anna AI created this compact evidence from extracted document text. Draft Answers use this smaller JSON plus saved memory.</p>
      <label class="field-label" for="compact-evidence-json-output">Compact Evidence JSON</label>
      <textarea id="compact-evidence-json-output" class="json-import-input evidence-json-output" readonly>${escapeHtml(
        JSON.stringify(compactEvidence, null, 2)
      )}</textarea>
      <div class="section-actions">
        <button id="copy-compact-evidence-json-button" type="button" data-action="copy-compact-evidence-json">Copy Compact Evidence JSON</button>
      </div>
    </article>
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

  target.innerHTML = [
    renderOverviewCard("Form Title", overview.title || "Untitled form"),
    renderOverviewCard("Purpose", overview.purpose || "Not specified"),
    renderOverviewCard("Draft Answers", appState.draftAnswers.length),
    renderOverviewCard("Missing Items", appState.missingInformation.length),
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
      const memoryStatus = getMemoryStatus(answer);
      const canSaveMemory = memoryStatus !== "not_reusable";
      const memoryActionLabel = memoryStatus === "saved" || memoryStatus === "needs_review" ? "Update Memory" : "Save to Memory";
      return `
        <article class="answer-card">
          <div class="card-header">
            <h3>${escapeHtml(answer.field || answer.requirement_label || "Untitled field")}</h3>
            <div class="badge-row">
              ${renderStatusBadge(answer)}
              ${renderMemoryStatusBadge(memoryStatus)}
            </div>
          </div>
          <p class="question-text">${escapeHtml(
            answer.question || answer.requested_by_form || "No prompt text provided."
          )}</p>
          <textarea class="draft-answer-input" data-answer-id="${escapeHtml(
            id
          )}">${escapeHtml(answer.answer || answer.draft_answer || "")}</textarea>
          <div class="source-row">
            <span>Answer source: ${escapeHtml(getAnswerSourceLabel(answer.answerSource))}</span>
            <span>Memory used: ${escapeHtml(formatList(answer.memoryUsed || answer.memory_used))}</span>
            <span>Sources used: ${escapeHtml(formatList(answer.sourcesUsed || answer.sources_used || answer.source))}</span>
            <span>Confidence: ${escapeHtml(answer.confidence || "not specified")}</span>
          </div>
          <div class="memory-detail-row">
            <span>Memory label: ${escapeHtml(answer.memoryLabel || answer.field || "Untitled field")}</span>
            <span>Category: ${escapeHtml(answer.memoryCategory || "general")}</span>
            <span>Sensitivity: ${renderSensitivityBadge(answer.memorySensitivity || "medium")}</span>
          </div>
          ${
            answer.memoryReason
              ? `<p class="meta-text">Memory note: ${escapeHtml(answer.memoryReason)}</p>`
              : ""
          }
          <div class="card-actions">
            <button type="button" class="ghost-button" data-action="copy-answer" data-answer-id="${escapeHtml(
              id
            )}">Copy Answer</button>
            ${
              canSaveMemory
                ? `<button type="button" class="primary-button" data-action="save-answer-memory" data-answer-id="${escapeHtml(
                    id
                  )}">${escapeHtml(memoryActionLabel)}</button>`
                : ""
            }
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

  if (action === "copy-answer" && answerId) {
    handleCopyAnswer(answerId, button);
    return;
  }

  if (action === "save-answer-memory" && answerId) {
    handleSaveDraftAnswerToMemory(answerId, button);
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
    handleDeleteMemoryItem(memoryId, button);
    return;
  }

  if (action === "copy-evidence-json") {
    handleCopyEvidenceJson();
    return;
  }

  if (action === "copy-compact-evidence-json") {
    handleCopyCompactEvidenceJson();
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
      setStatus("Documents parsed successfully. Asking Anna to understand documents...");
      const compactReady = await generateCompactEvidenceFromExtractedText();

      if (compactReady) {
        setStatus("Compact evidence generated. Generating draft answers with Anna...");
        await generateDraftAnswersFromEvidence();
      }

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
  appState.compactEvidenceJson = null;
  appState.parseStatus = "idle";
  appState.parseError = null;
  appState.compactEvidenceStatus = "idle";
  appState.compactEvidenceError = null;
  appState.draftStatus = "idle";
  appState.draftError = null;
  renderParsedEvidence();
  renderCompactEvidence();
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
  appState.compactEvidenceJson = null;
  appState.parseStatus = data ? "parsed" : "idle";
  appState.parseError = null;
  appState.compactEvidenceStatus = data ? "pending" : "idle";
  appState.compactEvidenceError = null;
  renderParsedEvidence();
  renderCompactEvidence();
}

function loadCompactEvidenceJson(data) {
  appState.compactEvidenceJson = data ? normalizeCompactEvidence(data) : null;
  appState.compactEvidenceStatus = data ? "ready" : "idle";
  appState.compactEvidenceError = null;
  renderCompactEvidence();
}

async function handleGenerateCompactEvidence() {
  await generateCompactEvidenceFromExtractedText();
}

async function handleGenerateDraftAnswers() {
  await generateDraftAnswersFromEvidence();
}

async function generateCompactEvidenceFromExtractedText() {
  if (!appState.evidenceJson) {
    setCompactEvidenceError("Parse documents before generating compact evidence.");
    return false;
  }

  const llmBridge = getLlmBridge();

  if (!llmBridge.client) {
    setCompactEvidenceError("Anna AI is not available in this session yet.");
    renderBridgeDiagnostics();
    return false;
  }

  try {
    appState.compactEvidenceStatus = "drafting";
    appState.compactEvidenceError = null;
    currentBridgeSource = llmBridge.source;
    setUploadStatus("Asking Anna to understand extracted text...");
    setStatus("Asking Anna to understand extracted document text...");
    renderBridgeDiagnostics();
    renderCompactEvidence();

    const response = await llmBridge.client.llm.complete(
      {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: createCompactEvidencePrompt(),
            },
          },
        ],
        maxTokens: 8000,
        temperature: 0.1,
      },
      { timeoutMs: 180000 }
    );

    const responseText = getLlmResponseText(response);
    const compactEvidence = extractFirstJsonObject(responseText);
    loadCompactEvidenceJson(compactEvidence);
    setUploadStatus("Compact evidence generated.", "success");
    setStatus("Compact evidence generated. Draft answers can now be generated.");
    return true;
  } catch (error) {
    setCompactEvidenceError(`Anna compact evidence generation failed: ${error.message || error}`);
    return false;
  }
}

async function generateDraftAnswersFromEvidence() {
  if (!appState.evidenceJson) {
    setDraftError("Parse documents before generating draft answers.");
    return;
  }

  if (!appState.compactEvidenceJson) {
    const compactReady = await generateCompactEvidenceFromExtractedText();

    if (!compactReady) {
      return;
    }
  }

  const llmBridge = getLlmBridge();

  if (!llmBridge.client) {
    setDraftError("Anna AI is not available in this session yet.");
    renderBridgeDiagnostics();
    return;
  }

  try {
    appState.status = "drafting";
    appState.draftStatus = "drafting";
    appState.draftError = null;
    currentBridgeSource = llmBridge.source;
    setUploadStatus("Loading saved memory before drafting...");
    setStatus("Loading saved memory before drafting...");
    renderBridgeDiagnostics();
    await loadSavedMemoryForDrafting();
    currentBridgeSource = llmBridge.source;
    setUploadStatus("Generating draft answers with Anna...");
    setStatus("Generating draft answers with Anna...");
    renderBridgeDiagnostics();

    const response = await llmBridge.client.llm.complete(
      {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: createDraftGenerationPrompt(),
            },
          },
        ],
        maxTokens: 12000,
        temperature: 0.2,
      },
      { timeoutMs: 180000 }
    );

    const responseText = getLlmResponseText(response);
    const answerSelection = extractFirstJsonObject(responseText);
    const reviewData = expandAnswerSelectionToReviewData(answerSelection);
    loadReviewData(reviewData);
    appState.status = "draft_ready";
    appState.draftStatus = "draft_ready";
    appState.draftError = null;
    setUploadStatus("Draft answers generated. Please review before saving memory.", "success");
    setStatus("Draft answers generated. Please review before saving memory.");
  } catch (error) {
    setDraftError(`Anna draft generation failed: ${error.message || error}`);
  }
}

function createCompactEvidencePrompt() {
  return [
    "You are Form Memory Filler inside Anna.",
    "Read the extracted document text and return compact evidence for a later form-filling draft step.",
    "The target form text tells you what fields/questions need answers.",
    "The source document text contains facts that may answer those fields or become reusable memory.",
    "Flatten source facts across all source documents. Always include sourceDocName for each fact.",
    "Do not draft final answers yet. Do not save memory. Do not invent facts.",
    "Return only valid JSON. Do not include markdown, code fences, comments, or explanation.",
    "Use this exact Compact Evidence JSON schema:",
    JSON.stringify(getCompactEvidenceSchemaExample(), null, 2),
    "Extracted document text:",
    JSON.stringify(createExtractedTextInputForAi(appState.evidenceJson), null, 2),
  ].join("\n\n");
}

function createExtractedTextInputForAi(evidence) {
  const safeEvidence = evidence || {};
  const targetForm = safeEvidence.targetForm || {};

  return {
    targetForm: {
      fileName: targetForm.fileName || "Target form",
      text: String(targetForm.cleanText || ""),
    },
    sourceDocuments: normalizeArray(safeEvidence.sourceDocuments).map((sourceDocument) => ({
      fileName: sourceDocument.fileName || "Source document",
      text: String(sourceDocument.cleanText || ""),
    })),
  };
}

function getCompactEvidenceSchemaExample() {
  return {
    targetFields: [
      {
        id: "target_1",
        fieldName: "",
        question: "",
        required: true,
      },
    ],
    sourceFacts: [
      {
        id: "fact_1",
        fieldName: "",
        value: "",
        category: "general",
        sensitivity: "medium",
        sourceDocName: "",
      },
    ],
  };
}

function normalizeCompactEvidence(data) {
  const targetFields = normalizeArray(data && (data.targetFields || data.target_fields));
  const sourceFacts = normalizeArray(data && (data.sourceFacts || data.source_facts));

  return {
    targetFields: targetFields.map(normalizeCompactTargetField),
    sourceFacts: sourceFacts.map(normalizeCompactSourceFact),
  };
}

function normalizeCompactTargetField(item, index) {
  const fieldName = item.fieldName || item.field_name || item.field || item.label || "";

  return {
    id: item.id || `target_${index + 1}`,
    fieldName,
    question: item.question || item.prompt || fieldName,
    required: item.required !== false,
  };
}

function normalizeCompactSourceFact(item, index) {
  return {
    id: item.id || `fact_${index + 1}`,
    fieldName: item.fieldName || item.field_name || item.field || item.label || "",
    value: item.value == null ? "" : String(item.value),
    category: item.category || "general",
    sensitivity: item.sensitivity || "medium",
    sourceDocName: item.sourceDocName || item.source_doc_name || item.source || "",
  };
}

function createDraftGenerationPrompt() {
  return [
    "You are Form Memory Filler inside Anna.",
    "Use Answer Evidence JSON to choose concise draft answers for target fields.",
    "Return only the answer choices. The app will add UI metadata, memory status, source labels, and default fields.",
    "Use evidenceId from sourceFacts or memoryFacts whenever an answer comes directly from that evidence.",
    "Use sourceFacts IDs that start with fact_ for source document answers.",
    "Use memoryFacts IDs that start with mem_ for saved memory answers.",
    "If you cannot answer a target field from sourceFacts or memoryFacts, put it in missingInformation.",
    "Do not invent missing facts. Do not include markdown, code fences, comments, or explanation.",
    "Return only valid JSON using this exact compact Draft Answers schema:",
    JSON.stringify(getAnswerSelectionSchemaExample(), null, 2),
    "Answer Evidence JSON:",
    JSON.stringify(createAnswerEvidenceForAi(), null, 2),
  ].join("\n\n");
}

function getAnswerSelectionSchemaExample() {
  return {
    draftAnswers: [
      {
        evidenceId: "fact_1",
        label: "",
        answer: "",
      },
    ],
    missingInformation: [
      {
        label: "",
        question: "",
      },
    ],
  };
}

function createAnswerEvidenceForAi() {
  return {
    targetFields: normalizeArray(appState.compactEvidenceJson && appState.compactEvidenceJson.targetFields).map(
      (field) => ({
        id: field.id,
        label: field.label || field.fieldName || field.field || "",
        instruction: field.instruction || field.question || "",
        required: field.required !== false,
      })
    ),
    sourceFacts: normalizeArray(appState.compactEvidenceJson && appState.compactEvidenceJson.sourceFacts).map(
      (fact, index) => ({
        id: fact.id || `fact_${index + 1}`,
        label: fact.label || fact.fieldName || fact.field || "",
        value: fact.value == null ? "" : String(fact.value),
        category: fact.category || "general",
        sensitivity: fact.sensitivity || "medium",
        sourceDocName: fact.sourceDocName || fact.source_doc_name || fact.source || "",
      })
    ),
    memoryFacts: createMemoryFactsForAi(),
  };
}

function createMemoryFactsForAi() {
  return normalizeArray(appState.savedMemory).map((item, index) => ({
    id: `mem_${index + 1}`,
    memoryId: item.id || "",
    label: item.label || "",
    value: item.value == null ? "" : String(item.value),
    category: item.category || "general",
    sensitivity: item.sensitivity || "medium",
    lastConfirmedAt: item.last_confirmed_at || item.lastConfirmedAt || "",
  }));
}

function expandAnswerSelectionToReviewData(data) {
  const source = data && typeof data === "object" ? data : {};
  const answerEvidence = createAnswerEvidenceForAi();
  const answerSelections = normalizeArray(source.draftAnswers).map((item, index) =>
    expandAnswerSelectionItem(item, index, answerEvidence)
  );
  const missingInformation = normalizeArray(source.missingInformation).map(
    normalizeAnswerSelectionMissingInformation
  );
  const missingDraftAnswers = missingInformation.map((item, index) =>
    expandMissingInformationToDraftAnswer(item, answerSelections.length + index)
  );
  const draftAnswers = answerSelections.concat(missingDraftAnswers);
  const targetForm = appState.evidenceJson && appState.evidenceJson.targetForm;

  return {
    formOverview: {
      title: targetForm && targetForm.fileName ? targetForm.fileName : "Parsed form",
      purpose: "Draft answers generated from compact evidence and saved memory.",
    },
    draftAnswers,
    missingInformation,
    proposedMemoryUpdates: [],
    savedMemory: appState.savedMemory,
  };
}

function expandAnswerSelectionItem(item, index, answerEvidence) {
  const source = item && typeof item === "object" ? item : {};
  const evidenceId = source.evidenceId || source.evidence_id || source.id || "";
  const label = source.label || source.field || source.fieldName || `Draft answer ${index + 1}`;
  const answer = source.answer == null ? "" : String(source.answer);
  const sourceFact = findEvidenceById(answerEvidence.sourceFacts, evidenceId);
  const memoryFact = findEvidenceById(answerEvidence.memoryFacts, evidenceId);
  const exactMemory = memoryFact || findMatchingMemoryFact(label, answer, answerEvidence.memoryFacts);
  const exactSource = sourceFact || findMatchingSourceFact(label, answer, answerEvidence.sourceFacts);
  const answerSource = getExpandedAnswerSource(evidenceId, exactSource, exactMemory);
  const memoryStatus = exactMemory ? "saved" : "not_saved";
  const reusableFact = exactMemory || exactSource || null;

  return {
    id: `draft_${index + 1}`,
    field: label,
    question: label,
    answer,
    confidence: "medium",
    status: "needs_user_review",
    answerSource,
    sourcesUsed: exactSource && exactSource.sourceDocName ? [exactSource.sourceDocName] : [],
    memoryUsed: exactMemory && exactMemory.label ? [exactMemory.label] : [],
    memoryStatus,
    memoryId: exactMemory && exactMemory.memoryId ? exactMemory.memoryId : "",
    memoryLabel: exactMemory && exactMemory.label ? exactMemory.label : normalizeLabelForMemory(label),
    memoryCategory: reusableFact && reusableFact.category ? reusableFact.category : "general",
    memorySensitivity: normalizeSensitivity(reusableFact && reusableFact.sensitivity ? reusableFact.sensitivity : "medium"),
    memoryReason: exactMemory
      ? "Matched saved memory."
      : "Generated from source evidence and can be saved after review.",
    approved: false,
  };
}

function normalizeAnswerSelectionMissingInformation(item, index) {
  const source = item && typeof item === "object" ? item : {};
  const label = source.label || source.field || source.fieldName || "Untitled field";

  return {
    id: source.id || `missing_${index + 1}`,
    field: label,
    reason: source.reason || "Anna could not find enough information in source documents or saved memory.",
    question: source.question || source.instruction || label,
    status: "needs_user_input",
  };
}

function expandMissingInformationToDraftAnswer(item, index) {
  const label = item.field || item.label || `Missing answer ${index + 1}`;

  return {
    id: `draft_${index + 1}`,
    field: label,
    question: item.question || label,
    answer: "",
    confidence: "needs input",
    status: "needs_user_input",
    answerSource: "user_input",
    sourcesUsed: [],
    memoryUsed: [],
    memoryStatus: "not_saved",
    memoryId: "",
    memoryLabel: normalizeLabelForMemory(label),
    memoryCategory: "general",
    memorySensitivity: "medium",
    memoryReason: item.reason || "User can provide this value and save it for future forms.",
    approved: false,
  };
}

function findEvidenceById(items, id) {
  if (!id) return null;
  return normalizeArray(items).find((item) => item.id === id) || null;
}

function findMatchingSourceFact(label, answer, sourceFacts) {
  return normalizeArray(sourceFacts).find((fact) => {
    return sameMatchText(fact.label, label) || sameMatchText(fact.value, answer);
  }) || null;
}

function findMatchingMemoryFact(label, answer, memoryFacts) {
  return normalizeArray(memoryFacts).find((item) => {
    return sameMatchText(item.label, label) && sameMatchText(item.value, answer);
  }) || null;
}

function getExpandedAnswerSource(evidenceId, sourceFact, memoryFact) {
  if (sourceFact && memoryFact) return "memory_and_source";
  if (String(evidenceId).startsWith("mem_") || memoryFact) return "memory";
  if (String(evidenceId).startsWith("fact_") || sourceFact) return "source_document";
  return "source_document";
}

function sameMatchText(left, right) {
  return normalizeMatchText(left) === normalizeMatchText(right);
}

function normalizeMatchText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\s+/g, " ");
}

function normalizeLabelForMemory(label) {
  return String(label || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "general";
}
function getReviewJsonSchemaExample() {
  return {
    formOverview: {
      title: "",
      purpose: "",
    },
    draftAnswers: [
      {
        id: "draft_1",
        field: "",
        question: "",
        answer: "",
        confidence: "high",
        status: "drafted_from_sources",
        answerSource: "source_document",
        sourcesUsed: [],
        memoryUsed: [],
        memoryStatus: "not_saved",
        memoryLabel: "",
        memoryCategory: "general",
        memorySensitivity: "medium",
        memoryReason: "",
      },
    ],
    missingInformation: [
      {
        id: "missing_1",
        field: "",
        reason: "",
        question: "",
        status: "needs_user_input",
      },
    ],
    savedMemory: [],
  };
}

async function loadSavedMemoryForDrafting() {
  const result = await callTool("get_memory", {});

  if (result.success) {
    appState.savedMemory = normalizeArray(result.data.items).map(normalizeSavedMemory);
    return true;
  }

  const message = result.error && result.error.message
    ? result.error.message
    : "Saved memory could not be loaded.";
  setStatus(`Saved memory could not be loaded before drafting: ${message}`);
  return false;
}

function getLlmBridge() {
  if (
    annaClient &&
    annaClient.llm &&
    typeof annaClient.llm.complete === "function"
  ) {
    return {
      source: "AnnaAppRuntime.connect.llm",
      client: annaClient,
    };
  }

  const fallbackAnna = window.anna || null;

  if (
    fallbackAnna &&
    fallbackAnna.llm &&
    typeof fallbackAnna.llm.complete === "function"
  ) {
    return {
      source: "window.anna.llm",
      client: fallbackAnna,
    };
  }

  const fallbackAnnaCaps = window.Anna || null;

  if (
    fallbackAnnaCaps &&
    fallbackAnnaCaps.llm &&
    typeof fallbackAnnaCaps.llm.complete === "function"
  ) {
    return {
      source: "window.Anna.llm",
      client: fallbackAnnaCaps,
    };
  }

  return {
    source: "none",
    client: null,
  };
}

function getLlmResponseText(response) {
  if (typeof response === "string") {
    return response;
  }

  if (response && response.content) {
    if (typeof response.content === "string") {
      return response.content;
    }

    if (typeof response.content.text === "string") {
      return response.content.text;
    }

    if (Array.isArray(response.content)) {
      return response.content
        .map((part) => {
          if (typeof part === "string") return part;
          if (part && typeof part.text === "string") return part.text;
          return "";
        })
        .join("");
    }
  }

  if (response && typeof response.text === "string") {
    return response.text;
  }

  throw new Error("Anna returned an empty draft response.");
}

function extractFirstJsonObject(text) {
  const source = String(text || "").trim();

  try {
    return JSON.parse(source);
  } catch (_error) {
    // Continue with object extraction below.
  }

  const start = source.indexOf("{");

  if (start < 0) {
    throw new Error("Anna did not return a JSON object.");
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < source.length; index += 1) {
    const char = source[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === "\"") {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === "{") {
      depth += 1;
    }

    if (char === "}") {
      depth -= 1;

      if (depth === 0) {
        const candidate = source.slice(start, index + 1);
        return JSON.parse(candidate);
      }
    }
  }

  throw new Error("Anna returned incomplete JSON.");
}

function loadReviewData(data) {
  const normalized = normalizeReviewData(data);

  appState.status = "review_ready";
  appState.formOverview = normalized.formOverview;
  appState.draftAnswers = normalized.draftAnswers;
  appState.missingInformation = normalized.missingInformation;
  appState.proposedMemoryUpdates = normalized.proposedMemoryUpdates;
  appState.savedMemory =
    normalized.savedMemory.length > 0 || normalized.hasSavedMemory
      ? normalized.savedMemory
      : appState.savedMemory;

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
    hasSavedMemory: Object.prototype.hasOwnProperty.call(source, "savedMemory"),
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
    answerSource: source.answerSource || source.answer_source || source.source || "",
    memoryUsed: normalizeList(source.memoryUsed || source.memory_used),
    sourcesUsed: normalizeList(source.sourcesUsed || source.sources_used || source.source),
    status: source.status || "needs_review",
    memoryStatus: normalizeMemoryStatus(source.memoryStatus || source.memory_status),
    memoryId: source.memoryId || source.memory_id || "",
    memoryLabel: source.memoryLabel || source.memory_label || normalizeLabelForMemory(source.field || source.requirement_label || "Untitled field"),
    memoryCategory: source.memoryCategory || source.memory_category || "general",
    memorySensitivity: normalizeSensitivity(
      source.memorySensitivity || source.memory_sensitivity || "medium"
    ),
    memoryReason: source.memoryReason || source.memory_reason || "",
    approved: source.approved === true,
  };
}

function normalizeMemoryStatus(value) {
  const normalized = String(value || "not_saved").trim();
  const allowed = ["not_saved", "saved", "needs_review", "not_reusable"];
  return allowed.includes(normalized) ? normalized : "not_saved";
}

function normalizeSensitivity(value) {
  const normalized = String(value || "medium").trim();
  const allowed = ["low", "medium", "high"];
  return allowed.includes(normalized) ? normalized : "medium";
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

async function handleCopyAnswer(answerId, button) {
  const answer = appState.draftAnswers.find((item) => item.id === answerId);

  if (!answer) {
    setStatus("Answer not found.");
    return;
  }

  const text = getCurrentDraftAnswerValue(answerId, answer.answer).trim();
  answer.answer = text;

  if (!text) {
    setStatus("There is no draft answer to copy.");
    return;
  }

  let copied = false;

  if (navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
    } catch (error) {
      copied = copyTextWithFallback(text);
    }
  } else {
    copied = copyTextWithFallback(text);
  }

  if (copied) {
    showTemporaryButtonFeedback(button, "Copied!");
    setStatus("Answer copied.");
    return;
  }

  showTemporaryButtonFeedback(button, "Copy failed");
  setStatus("Copy failed. Please copy manually.");
}

async function handleSaveDraftAnswerToMemory(answerId, button) {
  const answer = appState.draftAnswers.find((item) => item.id === answerId);

  if (!answer) {
    setStatus("Answer not found.");
    return;
  }

  const memoryStatus = getMemoryStatus(answer);

  if (memoryStatus === "not_reusable") {
    setStatus("This answer is not marked as reusable memory.");
    return;
  }

  const value = getCurrentDraftAnswerValue(answerId, answer.answer).trim();
  answer.answer = value;

  if (!value) {
    setStatus("Memory value is empty. Please edit before saving.");
    return;
  }

  const isUpdate = memoryStatus === "saved" || memoryStatus === "needs_review" || Boolean(answer.memoryId);
  showTemporaryButtonFeedback(button, isUpdate ? "Updating..." : "Saving...");
  setStatus(isUpdate ? "Updating approved memory..." : "Saving approved answer to memory...");

  const memoryInput = {
    label: answer.memoryLabel || normalizeLabelForMemory(answer.field),
    value,
    category: answer.memoryCategory || "general",
    sensitivity: answer.memorySensitivity || "medium",
    source_note: isUpdate
      ? "Updated by user from Form Memory Filler review."
      : answer.memoryReason || "",
  };

  if (answer.memoryId) {
    memoryInput.id = answer.memoryId;
  }

  const result = await callTool("save_approved_memory", {
    items: [memoryInput],
  });

  if (result.success) {
    const savedItem = normalizeArray(result.data && result.data.items)[0];

    answer.memoryStatus = "saved";
    answer.memoryId = savedItem && savedItem.id ? savedItem.id : answer.memoryId;
    answer.memoryLabel = savedItem && savedItem.label ? savedItem.label : memoryInput.label;
    answer.memoryReason = isUpdate
      ? "Updated memory from this reviewed answer."
      : "Saved to memory from this reviewed answer.";
    setStatus(isUpdate ? "Memory updated" : "Saved to memory");
    showTemporaryButtonFeedback(button, isUpdate ? "Updated!" : "Saved!");
    await refreshSavedMemoryInBackground();
    window.setTimeout(renderDraftAnswers, 900);
    return;
  }

  showTemporaryButtonFeedback(button, isUpdate ? "Update failed" : "Save failed");
  setStatus(`Memory could not be saved: ${result.error.message}`);
}

function getCurrentDraftAnswerValue(answerId, fallbackValue) {
  const inputs = Array.from(document.querySelectorAll(".draft-answer-input"));
  const input = inputs.find((element) => element.dataset.answerId === answerId);
  return String(input ? input.value : fallbackValue || "");
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

async function handleRefreshSavedMemory(button) {
  appState.status = "loading_memory";
  showTemporaryButtonFeedback(button, "Refreshing...");
  setStatus("Loading saved memory...");

  const result = await callTool("list_memory", {});

  if (result.success) {
    appState.savedMemory = normalizeArray(result.data.items).map(normalizeSavedMemory);
    setStatus("Saved memory loaded.");
    showTemporaryButtonFeedback(button, "Refreshed!");
  } else {
    setStatus(`Saved memory could not be loaded: ${result.error.message}`);
    showTemporaryButtonFeedback(button, "Refresh failed");
  }

  appState.status = "review_ready";
  renderSavedMemory();
  renderStatusMessage();
}

async function refreshSavedMemoryInBackground() {
  const result = await callTool("list_memory", {});

  if (result.success) {
    appState.savedMemory = normalizeArray(result.data.items).map(normalizeSavedMemory);
    renderSavedMemory();
  }
}

async function handleDeleteMemoryItem(memoryId, button) {
  if (!memoryId) {
    setStatus("Memory could not be deleted: missing memory id.");
    showTemporaryButtonFeedback(button, "Delete failed");
    return;
  }

  showTemporaryButtonFeedback(button, "Deleting...");
  setStatus("Deleting memory...");

  const result = await callTool("delete_memory_item", { id: memoryId });

  if (result.success) {
    appState.savedMemory = appState.savedMemory.filter(
      (item) => item.id !== memoryId
    );
    setStatus("Saved memory deleted.");
    showTemporaryButtonFeedback(button, "Deleted!");
    renderSavedMemory();
    return;
  }

  const message = result.error && result.error.message
    ? result.error.message
    : "Delete request failed.";
  showTemporaryButtonFeedback(button, "Delete failed");
  setStatus(`Memory could not be deleted: ${message}`);
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

function setDraftError(message) {
  appState.status = "draft_error";
  appState.draftStatus = "draft_error";
  appState.draftError = message;
  setUploadStatus(message, "error");
  setStatus(message);
  renderBridgeDiagnostics();
}

function setCompactEvidenceError(message) {
  appState.compactEvidenceStatus = "error";
  appState.compactEvidenceError = message;
  setUploadStatus(message, "error");
  setStatus(message);
  renderCompactEvidence();
  renderBridgeDiagnostics();
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

async function handleCopyCompactEvidenceJson() {
  if (!appState.compactEvidenceJson) {
    setStatus("No Compact Evidence JSON to copy.");
    return;
  }

  const text = JSON.stringify(appState.compactEvidenceJson, null, 2);

  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      copyTextWithFallback(text);
    }

    setStatus("Compact Evidence JSON copied.");
  } catch (error) {
    copyTextWithFallback(text);
    setStatus("Compact Evidence JSON copied.");
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

  try {
    return document.execCommand("copy");
  } catch (error) {
    return false;
  } finally {
    document.body.removeChild(textarea);
  }
}

function showTemporaryButtonFeedback(button, message) {
  if (!button) return;

  const originalText = button.dataset.originalText || button.textContent;
  button.dataset.originalText = originalText;
  button.textContent = message;
  button.classList.add("button-feedback-active");

  window.setTimeout(() => {
    button.textContent = button.dataset.originalText || originalText;
    button.classList.remove("button-feedback-active");
  }, 1500);
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
    [
      "annaClient.llm.complete",
      info.hasAnnaClientLlmComplete ? "available" : "not available",
    ],
    ["annaClient.agent", info.hasAnnaClientAgent ? "available" : "not available"],
    ["annaClient.chat", info.hasAnnaClientChat ? "available" : "not available"],
    [
      "window.anna.llm.complete",
      info.hasWindowAnnaLlmComplete ? "available" : "not available",
    ],
    ["window.anna.agent", info.hasWindowAnnaAgent ? "available" : "not available"],
    ["window.anna.chat", info.hasWindowAnnaChat ? "available" : "not available"],
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
        status: "drafted_from_sources",
        answerSource: "source_document",
        sourcesUsed: ["Neutral demo document"],
        memoryUsed: [],
        memoryStatus: "not_saved",
        memoryLabel: "Example organization name",
        memoryCategory: "general",
        memorySensitivity: "low",
        memoryReason: "Reusable for future fictional demo forms.",
      },
      {
        field: "Project Summary",
        question: "Briefly describe the example project.",
        answer:
          "This fictional project demonstrates how drafted form answers can be reviewed before use.",
        confidence: "medium",
        status: "drafted_from_sources",
        answerSource: "source_document",
        sourcesUsed: ["Neutral demo notes"],
        memoryUsed: [],
        memoryStatus: "not_reusable",
        memoryLabel: "Project summary",
        memoryCategory: "general",
        memorySensitivity: "medium",
        memoryReason: "This is specific to the neutral demo form.",
      },
    ],
    missingInformation: [
      {
        field: "Submission Date",
        reason: "The neutral demo documents do not include a date.",
      },
    ],
    proposedMemoryUpdates: [],
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

function renderMemoryStatusBadge(status) {
  const normalized = normalizeMemoryStatus(status);
  return `<span class="status-badge memory-status-badge status-memory_${escapeHtml(
    normalized
  )}">${escapeHtml(getMemoryStatusLabel(normalized))}</span>`;
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

function getMemoryStatus(item) {
  return normalizeMemoryStatus(item.memoryStatus || item.memory_status);
}

function getMemoryStatusLabel(status) {
  const labels = {
    not_saved: "Not saved in memory",
    saved: "Already in memory",
    needs_review: "Needs review: source differs from memory",
    not_reusable: "Not reusable",
  };

  return labels[normalizeMemoryStatus(status)] || labels.not_saved;
}

function getAnswerSourceLabel(value) {
  const labels = {
    memory: "Memory",
    source_document: "Source document",
    memory_and_source: "Memory and source documents",
    memory_and_sources: "Memory and source documents",
    user_input: "User input",
  };
  const key = String(value || "").trim();
  return labels[key] || key || "Not specified";
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
