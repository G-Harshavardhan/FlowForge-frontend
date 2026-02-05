/**
 * FlowForge Frontend Application Logic
 */

const API_BASE = 'http://localhost:3000/api';
const WS_URL = 'ws://localhost:3000/ws';

// State
const state = {
  currentView: 'dashboard',
  workflows: [],
  currentWorkflow: null, // { id, name, description, steps: [] }
  editingStepIndex: -1,
  activeRunId: null,
  socket: null
};

// DOM Elements
const elements = {
  views: document.querySelectorAll('.view'),
  navItems: document.querySelectorAll('.nav-item'),
  
  // Dashboard
  statTotalWorkflows: document.getElementById('stat-total-workflows'),
  statTotalRuns: document.getElementById('stat-total-runs'),
  statSuccessRate: document.getElementById('stat-success-rate'),
  statTotalCost: document.getElementById('stat-total-cost'),
  activityList: document.getElementById('dashboard-activity-list'),
  
  // Workflows List
  workflowsList: document.getElementById('workflows-list'),
  
  // Editor
  editorTitle: document.getElementById('editor-title'),
  workflowName: document.getElementById('workflow-name'),
  workflowDesc: document.getElementById('workflow-description'),
  editorStepsList: document.getElementById('editor-steps-list'),
  btnSaveWorkflow: document.getElementById('btn-save-workflow'),
  btnRunWorkflow: document.getElementById('btn-run-workflow'),
  btnExportWorkflow: document.getElementById('btn-export-workflow'),
  
  // Step Modal
  modalStep: document.getElementById('modal-step'),
  stepName: document.getElementById('step-name'),
  stepModel: document.getElementById('step-model'),
  stepPrompt: document.getElementById('step-prompt'),
  stepCriteriaType: document.getElementById('step-criteria-type'),
  stepCriteriaValue: document.getElementById('step-criteria-value'),
  stepRetryLimit: document.getElementById('step-retry-limit'),
  stepContextMode: document.getElementById('step-context-mode'),
  
  // History
  runHistoryList: document.getElementById('run-history-list'),
  
  // Execution
  executionTitle: document.getElementById('execution-title'),
  executionStatusBadge: document.getElementById('execution-status-badge'),
  executionStepsList: document.getElementById('execution-steps-list'),
  execTokens: document.getElementById('exec-tokens'),
  execCost: document.getElementById('exec-cost'),
  execDuration: document.getElementById('exec-duration'),
  
  // Import
  importJson: document.getElementById('import-json'),
  btnImport: document.getElementById('btn-import')
};

// --- Initialization ---

async function init() {
  setupEventListeners();
  setupWebSocket();
  await loadDashboardStats();
  navigateTo('dashboard');
}

function setupEventListeners() {
  // Navigation
  elements.navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const view = item.getAttribute('data-view');
      navigateTo(view);
    });
  });

  // Dashboard Buttons
  document.getElementById('btn-new-workflow').addEventListener('click', startNewWorkflow);
  
  // Workflow View Buttons
  document.getElementById('btn-new-workflow-2').addEventListener('click', startNewWorkflow);
  
  // Editor Buttons
  document.getElementById('btn-back-workflows').addEventListener('click', () => navigateTo('workflows'));
  document.getElementById('btn-cancel-edit').addEventListener('click', () => navigateTo('workflows'));
  document.getElementById('btn-add-step').addEventListener('click', openAddStepModal);
  elements.btnSaveWorkflow.addEventListener('click', saveWorkflow);
  elements.btnRunWorkflow.addEventListener('click', runWorkflow);
  elements.btnExportWorkflow.addEventListener('click', exportWorkflow);
  
  // Step Modal Buttons
  document.getElementById('btn-close-step-modal').addEventListener('click', closeStepModal);
  document.getElementById('btn-cancel-step').addEventListener('click', closeStepModal);
  document.getElementById('btn-save-step').addEventListener('click', saveStep);
  elements.stepCriteriaType.addEventListener('change', toggleCriteriaValueInput);
  
  // History Buttons
  document.getElementById('btn-refresh-history').addEventListener('click', loadRunHistory);
  
  // Execution Buttons
  document.getElementById('btn-back-history').addEventListener('click', () => {
    if (state.activeRunId) {
      if (confirm('Navigate away? Live updates will continue in background.')) {
        navigateTo('history');
      }
    } else {
      navigateTo('history');
    }
  });

  // Import
  elements.btnImport.addEventListener('click', importWorkflow);
}

function setupWebSocket() {
  state.socket = new WebSocket(WS_URL);
  
  state.socket.onopen = () => {
    console.log('WebSocket connected');
  };
  
  state.socket.onmessage = (event) => {
    const data = JSON.parse(event.data);
    handleWebSocketMessage(data);
  };
  
  state.socket.onclose = () => {
    console.log('WebSocket disconnected, reconnecting in 3s...');
    setTimeout(setupWebSocket, 3000);
  };
}

// --- Navigation ---

async function navigateTo(view) {
  // Update state
  state.currentView = view;
  
  // Update UI tabs
  elements.navItems.forEach(item => {
    if (item.getAttribute('data-view') === view) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });
  
  // View Visibility
  elements.views.forEach(v => v.classList.remove('active'));
  document.getElementById(`view-${view}`).classList.add('active');
  
  // Load Data for View
  if (view === 'dashboard') loadDashboardStats();
  if (view === 'workflows') loadWorkflows();
  if (view === 'history') loadRunHistory();
}

// --- Dashboard ---

async function loadDashboardStats() {
  try {
    const statsRes = await fetch(`${API_BASE}/runs/stats/summary`);
    const stats = await statsRes.json();
    
    elements.statTotalRuns.textContent = stats.total_runs;
    const successRate = stats.total_runs > 0 
      ? Math.round((stats.completed_runs / stats.total_runs) * 100) 
      : 0;
    elements.statSuccessRate.textContent = `${successRate}%`;
    elements.statTotalCost.textContent = `$${(stats.total_cost || 0).toFixed(6)}`;
    
    // Also fetch workflow count
    const workflowsRes = await fetch(`${API_BASE}/workflows`);
    const workflows = await workflowsRes.json();
    elements.statTotalWorkflows.textContent = workflows.length;
    
    // Recent activity (mocked for now or derived from runs)
    loadRecentActivity();
    
  } catch (error) {
    showToast('Failed to load stats', 'error');
  }
}

async function loadRecentActivity() {
  try {
    const res = await fetch(`${API_BASE}/runs?limit=5`);
    const data = await res.json();
    
    const container = elements.activityList;
    container.innerHTML = '';
    
    if (data.runs.length === 0) {
      container.innerHTML = '<div class="empty-state">No recent activity</div>';
      return;
    }
    
    data.runs.forEach(run => {
      const el = document.createElement('div');
      el.className = 'activity-item';
      
      const statusClass = run.status === 'completed' ? 'success' : (run.status === 'failed' ? 'error' : 'neutral');
      const icon = run.status === 'completed' ? '✓' : (run.status === 'failed' ? '✗' : '⟳');
      
      el.innerHTML = `
        <div class="activity-icon ${statusClass}">${icon}</div>
        <div class="activity-content">
          <div class="activity-title">${escapeHtml(run.workflow_name)}</div>
          <div class="activity-time">${formatDate(run.started_at)}</div>
        </div>
        <div class="activity-status ${statusClass}">${run.status}</div>
      `;
      el.addEventListener('click', () => viewRun(run.id));
      container.appendChild(el);
    });
  } catch (error) {
    console.error(error);
  }
}

// --- Workflows ---

async function loadWorkflows() {
  try {
    const res = await fetch(`${API_BASE}/workflows`);
    const workflows = await res.json();
    state.workflows = workflows;
    
    const container = elements.workflowsList;
    container.innerHTML = '';
    
    if (workflows.length === 0) {
      container.innerHTML = '<div class="empty-state">No workflows found. Create one to get started!</div>';
      return;
    }
    
    workflows.forEach(wf => {
      const card = document.createElement('div');
      card.className = 'workflow-card';
      card.innerHTML = `
        <h3>${escapeHtml(wf.name)}</h3>
        <p>${escapeHtml(wf.description || 'No description')}</p>
        <div class="meta">
          <span>${wf.step_count} Steps</span>
          <span>${wf.run_count} Runs</span>
        </div>
        <div class="actions">
          <button class="btn btn-primary btn-sm btn-edit-wf">Edit</button>
          <button class="btn btn-danger btn-sm btn-delete-wf">Delete</button>
        </div>
      `;
      
      card.querySelector('.btn-edit-wf').addEventListener('click', () => editWorkflow(wf.id));
      card.querySelector('.btn-delete-wf').addEventListener('click', (e) => {
        e.stopPropagation();
        deleteWorkflow(wf.id);
      });
      
      container.appendChild(card);
    });
  } catch (error) {
    showToast('Failed to load workflows', 'error');
  }
}

// --- Workflow Editor ---

async function startNewWorkflow() {
  state.currentWorkflow = { name: '', description: '', steps: [] };
  state.editingStepIndex = -1;
  
  elements.editorTitle.textContent = 'New Workflow';
  elements.workflowName.value = '';
  elements.workflowDesc.value = '';
  elements.btnRunWorkflow.style.display = 'none';
  elements.btnExportWorkflow.style.display = 'none';
  
  renderEditorSteps();
  navigateTo('editor');
}

async function editWorkflow(id) {
  try {
    const res = await fetch(`${API_BASE}/workflows/${id}`);
    if (!res.ok) throw new Error('Workflow not found');
    
    state.currentWorkflow = await res.json();
    state.editingStepIndex = -1;
    
    elements.editorTitle.textContent = 'Edit Workflow';
    elements.workflowName.value = state.currentWorkflow.name;
    elements.workflowDesc.value = state.currentWorkflow.description;
    elements.btnRunWorkflow.style.display = 'inline-flex';
    elements.btnExportWorkflow.style.display = 'inline-block';
    
    renderEditorSteps();
    navigateTo('editor');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function renderEditorSteps() {
  const container = elements.editorStepsList;
  container.innerHTML = '';
  
  if (state.currentWorkflow.steps.length === 0) {
    container.innerHTML = '<div class="empty-state">No steps yet. Add a step to begin.</div>';
    return;
  }
  
  state.currentWorkflow.steps.forEach((step, index) => {
    const item = document.createElement('div');
    item.className = 'step-item';
    item.draggable = true;
    const criteriaDisplay = step.criteria_type === 'always' 
      ? 'Always Pass' 
      : `${step.criteria_type}: "${escapeHtml(step.criteria_value || '')}"`;

    item.innerHTML = `
      <div class="step-handle">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M4 4h2v2H4V4zm6 0h2v2h-2V4zM4 10h2v2H4v-2zm6 0h2v2h-2v-2z"/></svg>
      </div>
      <div class="step-content">
        <div class="step-title">
          <span class="step-index">Step ${index + 1}</span>
          <span class="step-name-text">${escapeHtml(step.name)}</span>
        </div>
        <div class="step-details">
          <span class="detail-tag model-tag">${step.model}</span>
          <span class="detail-tag criteria-tag">${criteriaDisplay}</span>
          <span class="detail-tag retry-tag">Retries: ${step.retry_limit}</span>
        </div>
      </div>
      <div class="step-actions">
        <button class="btn-icon btn-edit-step" title="Edit Step">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
        </button>
        <button class="btn-icon btn-delete-step" title="Delete Step">
           <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
        </button>
      </div>
    `;
    
    item.querySelector('.btn-edit-step').addEventListener('click', () => editStep(index));
    item.querySelector('.btn-delete-step').addEventListener('click', () => deleteStep(index));
    
    // Add drag and drop logic here if needed
    
    container.appendChild(item);
  });
}

// --- Steps Management ---

function openAddStepModal() {
  state.editingStepIndex = -1;
  document.getElementById('step-modal-title').textContent = 'Add New Step';
  
  // Reset form
  elements.stepName.value = '';
  elements.stepModel.value = 'kimi-k2-instruct-0905';
  elements.stepPrompt.value = '';
  elements.stepCriteriaType.value = 'always';
  elements.stepCriteriaValue.value = '';
  elements.stepRetryLimit.value = 3;
  elements.stepContextMode.value = 'full';
  
  toggleCriteriaValueInput();
  elements.modalStep.classList.add('active');
}

function editStep(index) {
  state.editingStepIndex = index;
  const step = state.currentWorkflow.steps[index];
  
  document.getElementById('step-modal-title').textContent = 'Edit Step';
  
  elements.stepName.value = step.name;
  elements.stepModel.value = step.model;
  elements.stepPrompt.value = step.prompt;
  elements.stepCriteriaType.value = step.criteria_type;
  elements.stepCriteriaValue.value = step.criteria_value;
  elements.stepRetryLimit.value = step.retry_limit;
  elements.stepContextMode.value = step.context_mode;
  
  toggleCriteriaValueInput();
  elements.modalStep.classList.add('active');
}

function saveStep() {
  const stepData = {
    name: elements.stepName.value || `Step ${state.currentWorkflow.steps.length + 1}`,
    model: elements.stepModel.value,
    prompt: elements.stepPrompt.value,
    criteria_type: elements.stepCriteriaType.value,
    criteria_value: elements.stepCriteriaValue.value,
    retry_limit: parseInt(elements.stepRetryLimit.value) || 3,
    context_mode: elements.stepContextMode.value
  };
  
  if (state.editingStepIndex === -1) {
    state.currentWorkflow.steps.push(stepData);
  } else {
    state.currentWorkflow.steps[state.editingStepIndex] = stepData;
  }
  
  closeStepModal();
  renderEditorSteps();
}

function deleteStep(index) {
  if (confirm('Delete this step?')) {
    state.currentWorkflow.steps.splice(index, 1);
    renderEditorSteps();
  }
}

function closeStepModal() {
  elements.modalStep.classList.remove('active');
}

function toggleCriteriaValueInput() {
  const type = elements.stepCriteriaType.value;
  const group = document.getElementById('group-criteria-value');
  
  if (['always', 'json', 'code'].includes(type)) {
    group.style.display = 'none';
  } else {
    group.style.display = 'block';
  }
}

// --- Workflow Actions ---

async function saveWorkflow() {
  const name = elements.workflowName.value.trim();
  if (!name) {
    showToast('Workflow name is required', 'error');
    return;
  }
  
  const workflowData = {
    name: name,
    description: elements.workflowDesc.value,
    steps: state.currentWorkflow.steps
  };
  
  try {
    let method = 'POST';
    let url = `${API_BASE}/workflows`;
    
    if (state.currentWorkflow.id) {
      method = 'PUT';
      url = `${API_BASE}/workflows/${state.currentWorkflow.id}`;
    }
    
    const res = await fetch(url, {
      method: method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(workflowData)
    });
    
    if (!res.ok) throw new Error('Failed to save');
    
    const saved = await res.json();
    state.currentWorkflow = saved;
    elements.btnRunWorkflow.style.display = 'inline-flex';
    elements.btnExportWorkflow.style.display = 'inline-block';
    
    showToast('Workflow saved successfully', 'success');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function deleteWorkflow(id) {
  if (!confirm('Are you sure you want to delete this workflow? All run history will be lost.')) return;
  
  try {
    await fetch(`${API_BASE}/workflows/${id}`, { method: 'DELETE' });
    showToast('Workflow deleted', 'success');
    loadWorkflows();
  } catch (error) {
    showToast('Failed to delete', 'error');
  }
}

async function runWorkflow() {
  if (!state.currentWorkflow.id) return;
  
  try {
    const res = await fetch(`${API_BASE}/runs/start/${state.currentWorkflow.id}`, {
      method: 'POST'
    });
    
    if (!res.ok) throw new Error('Failed to start run');
    
    const run = await res.json();
    viewRun(run.id, false);
    
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function exportWorkflow() {
  if (!state.currentWorkflow.id) return;
  window.open(`${API_BASE}/workflows/${state.currentWorkflow.id}/export`, '_blank');
}

async function importWorkflow() {
  const jsonStr = elements.importJson.value.trim();
  if (!jsonStr) return;
  
  try {
    const data = JSON.parse(jsonStr);
    const res = await fetch(`${API_BASE}/workflows/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    
    if (!res.ok) throw new Error('Import failed');
    
    elements.importJson.value = '';
    showToast('Workflow imported', 'success');
    loadWorkflows();
    navigateTo('workflows');
    
  } catch (error) {
    showToast('Invalid JSON or import failed', 'error');
  }
}

// --- Execution View ---

async function viewRun(runId, isUpdate = false) {
  state.activeRunId = runId;
  navigateTo('execution');
  
  // Only clear state if this is a new load, not a live update
  if (!isUpdate) {
    elements.executionTitle.textContent = `Loading...`;
    elements.executionStepsList.innerHTML = '<div class="loading">Loading execution details...</div>';
    
    // Reset live stats
    elements.execTokens.textContent = '0';
    elements.execCost.textContent = '$0.000000';
    elements.execDuration.textContent = '0s';
  }
  
  try {
    const res = await fetch(`${API_BASE}/runs/${runId}`);
    const run = await res.json();
    
    updateExecutionView(run);
    
  } catch (error) {
    showToast('Failed to load run details', 'error');
  }
}

function updateExecutionView(run) {
  // Only show workflow name as requested
  elements.executionTitle.textContent = run.workflow_name;
  
  // Update badge
  const badge = elements.executionStatusBadge;
  badge.textContent = run.status.toUpperCase();
  badge.className = 'run-status-badge ' + run.status;
  
  // Toggle stats visibility
  const statsBar = document.querySelector('.execution-stats-bar');
  if (run.status === 'completed' || run.status === 'failed') {
    statsBar.style.display = 'flex';
  } else {
    statsBar.style.display = 'none';
  }
  
  // Update stats
  elements.execTokens.textContent = run.total_tokens || 0;
  elements.execCost.textContent = `$${(run.total_cost || 0).toFixed(6)}`;
  
  // Calculate duration
  if (run.started_at) {
    const start = new Date(run.started_at);
    const end = run.completed_at ? new Date(run.completed_at) : new Date();
    const seconds = Math.floor((end - start) / 1000);
    elements.execDuration.textContent = `${seconds}s`;
  }
  
  // Render steps
  const container = elements.executionStepsList;
  container.innerHTML = '';
  
  if (!run.step_executions || run.step_executions.length === 0) {
    // If live and no steps yet, waiting
    container.innerHTML = '<div class="empty-state">Waiting for steps to start...</div>';
    return;
  }
  
  run.step_executions.forEach((step, index) => {
    const el = document.createElement('div');
    el.className = `exec-step-item ${step.status}`;
    el.id = `exec-step-${step.step_id}`;
    
    const icon = step.status === 'passed' ? '✓' : (step.status === 'failed' ? '✗' : (step.status === 'running' ? '⟳' : '○'));
    
    const criteriaDisplay = step.criteria_type === 'always' 
      ? 'Always Pass' 
      : `${step.criteria_type}: "${escapeHtml(step.criteria_value || '')}"`;

    el.innerHTML = `
      <div class="exec-step-header">
        <div class="step-status-icon">${icon}</div>
        <div class="step-info">
          <h4>${escapeHtml(step.step_name)}</h4>
          <div class="meta">
             ${step.status.toUpperCase()} • Attempt: ${step.attempts || 0} • Cost: $${(step.cost || 0).toFixed(6)}
          </div>
          <div class="meta-criteria">
             Criteria: ${criteriaDisplay}
          </div>
        </div>
        <div class="expand-icon">▼</div>
      </div>
      <div class="exec-step-details">
        ${step.error ? `<div class="error-box">Error: ${escapeHtml(step.error)}</div>` : ''}
        ${step.output ? `<div class="output-box"><h5>Output:</h5><pre>${escapeHtml(step.output)}</pre></div>` : ''}
        ${!step.output && !step.error && step.status === 'running' ? '<div class="typing-indicator">Thinking...</div>' : ''}
      </div>
    `;
    
    // Toggle details
    el.querySelector('.exec-step-header').addEventListener('click', () => {
      el.classList.toggle('expanded');
    });
    
    container.appendChild(el);
  });
}

// --- Run History ---

async function loadRunHistory() {
  try {
    const res = await fetch(`${API_BASE}/runs`);
    const data = await res.json();
    
    const container = elements.runHistoryList;
    container.innerHTML = '';
    
    if (data.runs.length === 0) {
      container.innerHTML = '<div class="empty-state">No runs yet.</div>';
      return;
    }
    
    data.runs.forEach(run => {
      const el = document.createElement('div');
      el.className = 'history-item';
      
      const statusClass = run.status === 'completed' ? 'success' : (run.status === 'failed' ? 'error' : 'neutral');
      
      el.innerHTML = `
        <div class="history-main">
          <div class="history-title">${escapeHtml(run.workflow_name)}</div>
          <div class="history-meta">
            ID: ${run.id.substring(0, 6)} • ${formatDate(run.started_at)}
          </div>
        </div>
        <div class="history-stats">
          <span>${run.total_tokens || 0} tokens</span>
          <span>$${(run.total_cost || 0).toFixed(6)}</span>
        </div>
        <div class="history-status ${statusClass}">${run.status}</div>
      `;
      
      el.addEventListener('click', () => viewRun(run.id));
      container.appendChild(el);
    });
    
  } catch (error) {
    showToast('Failed to load history', 'error');
  }
}

// --- WebSocket Handling ---

function handleWebSocketMessage(msg) {
  // Only update if viewing execution
  if (state.currentView !== 'execution') return;
  if (state.activeRunId !== msg.runId) return;
  
  // Pass true to indicate this is an update, not a new load
  viewRun(msg.runId, true);
  
  if (msg.type === 'run_completed') {
    if (msg.status === 'completed') showToast('Run Completed Successfully', 'success');
    else showToast('Run Failed', 'error');
  }
}

// --- Utils ---

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDate(isoStr) {
  if (!isoStr) return '';
  return new Date(isoStr).toLocaleString();
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  
  container.appendChild(toast);
  
  // Trigger reflow
  toast.offsetHeight;
  toast.classList.add('show');
  
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => {
      container.removeChild(toast);
    }, 300);
  }, 3000);
}

// Start app
window.addEventListener('DOMContentLoaded', init);
