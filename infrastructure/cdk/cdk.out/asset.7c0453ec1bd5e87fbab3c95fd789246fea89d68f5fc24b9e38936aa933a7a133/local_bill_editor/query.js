const querySelect = document.getElementById('query-select');
const newQueryButton = document.getElementById('new-query');
const runPipelineButton = document.getElementById('run-pipeline');
const openEntriesLink = document.getElementById('open-entries');
const statusEl = document.getElementById('status');
const pipelineProgress = document.getElementById('pipeline-progress');
const pipelineLog = document.getElementById('pipeline-log');

const userInput = document.getElementById('user');
const queryNameInput = document.getElementById('query-name');

const clientNameInput = document.getElementById('client-name');
const clientNameList = document.getElementById('client-name-list');
const billingRateInput = document.getElementById('billing-rate');
const prefillNote = document.getElementById('prefill-note');

const startDateInput = document.getElementById('start-date');
const endDateInput = document.getElementById('end-date');
const emailsInput = document.getElementById('emails');
const keywordsInput = document.getElementById('keywords');
const excludeKeywordsInput = document.getElementById('exclude-keywords');

const mattersContainer = document.getElementById('matters');
const addMatterButton = document.getElementById('add-matter');

const NEW_VALUE = '__new__';

let queryJson = {};
let inputsJson = {};
let mode = 'new';
let loadedQueryName = null;
let mattersState = [{ name: '', keywordsText: '' }];
let pipelineSource = null;

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const updateStatus = (message, isError = false) => {
  statusEl.textContent = message;
  statusEl.style.color = isError ? '#9b2c2c' : '#2d5d4e';
};

const appendPipelineLog = (text) => {
  if (!pipelineLog) return;
  pipelineLog.textContent += text;
  if (!text.endsWith('\n')) {
    pipelineLog.textContent += '\n';
  }
  pipelineLog.scrollTop = pipelineLog.scrollHeight;
};

const clearPipelineLog = () => {
  if (!pipelineLog) return;
  pipelineLog.textContent = '';
};

const setPipelineProgress = (value) => {
  if (!pipelineProgress) return;
  pipelineProgress.textContent = value;
};

const setPipelineUiRunning = (running) => {
  runPipelineButton.disabled = running;
  newQueryButton.disabled = running;
  querySelect.disabled = running;
  if (running) {
    openEntriesLink.style.display = 'none';
  }
};

const closePipelineStream = () => {
  if (pipelineSource) {
    pipelineSource.close();
    pipelineSource = null;
  }
};

const confirmOverwrite = () =>
  new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <h2>Time entries already exist</h2>
        <p class="subtle">
          A <code>time_entries.json</code> already exists for this query. Running the pipeline may override it.
          A backup will be rotated automatically (last 5).
        </p>
        <div class="modal-actions">
          <button type="button" data-action="cancel">Back</button>
          <button type="button" class="primary" data-action="confirm">Run anyway</button>
        </div>
      </div>
    `;

    const cleanup = () => {
      overlay.remove();
      document.removeEventListener('keydown', onKeyDown);
    };

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        cleanup();
        resolve(false);
      }
    };
    document.addEventListener('keydown', onKeyDown);

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) {
        cleanup();
        resolve(false);
      }
    });

    overlay.querySelector('[data-action="cancel"]')?.addEventListener('click', () => {
      cleanup();
      resolve(false);
    });

    overlay.querySelector('[data-action="confirm"]')?.addEventListener('click', () => {
      cleanup();
      resolve(true);
    });

    document.body.appendChild(overlay);
  });

const checkTimeEntriesExists = async (queryName) => {
  const response = await fetch(
    `/api/time-entries-exists?query=${encodeURIComponent(queryName)}`
  );
  if (!response.ok) {
    return false;
  }
  const payload = await response.json().catch(() => ({}));
  return Boolean(payload.exists);
};

const parseLines = (value) =>
  String(value || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

const linesToText = (lines) => (lines || []).join('\n');

const normalizeClientName = (value) =>
  String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();

const parseTimestamp = (entry) => {
  const candidates = [entry.requested_timestamp, entry.end, entry.start];
  for (const candidate of candidates) {
    const parsed = Date.parse(candidate);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return 0;
};

const listQueryNames = () =>
  Object.keys(queryJson)
    .filter((name) => name !== 'template')
    .sort((a, b) => a.localeCompare(b));

const listClientNames = () => {
  const names = new Set();
  for (const [key, entry] of Object.entries(queryJson)) {
    if (key === 'template') continue;
    const clientName = String(entry?.client_name || '').trim();
    if (clientName) {
      names.add(clientName);
    }
  }
  return Array.from(names).sort((a, b) => a.localeCompare(b));
};

const getMostRecentQueryForClient = (clientName) => {
  const target = normalizeClientName(clientName);
  if (!target) return null;
  let best = null;
  for (const [name, entry] of Object.entries(queryJson)) {
    if (name === 'template') continue;
    if (normalizeClientName(entry?.client_name) !== target) continue;
    const ts = parseTimestamp(entry);
    if (!best || ts > best.ts) {
      best = { name, entry, ts };
    }
  }
  return best;
};

const shouldPrefill = () => {
  const emailsEmpty = !parseLines(emailsInput.value).length;
  const keywordsEmpty = !parseLines(keywordsInput.value).length;
  const excludeKeywordsEmpty = !parseLines(excludeKeywordsInput.value).length;
  const billingEmpty = !String(billingRateInput.value || '').trim();
  const mattersEmpty =
    mattersState.length === 1 &&
    !mattersState[0].name.trim() &&
    !parseLines(mattersState[0].keywordsText).length;
  return emailsEmpty && keywordsEmpty && excludeKeywordsEmpty && billingEmpty && mattersEmpty;
};

const renderQuerySelect = () => {
  const options = [
    `<option value="${NEW_VALUE}">New query…</option>`,
    ...listQueryNames().map(
      (name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`
    ),
  ];
  querySelect.innerHTML = options.join('');
};

const renderClientNameList = () => {
  const options = listClientNames().map(
    (name) => `<option value="${escapeHtml(name)}"></option>`
  );
  clientNameList.innerHTML = options.join('');
};

const renderMatters = () => {
  if (!mattersState.length) {
    mattersState = [{ name: '', keywordsText: '' }];
  }
  mattersContainer.innerHTML = mattersState
    .map((matter, idx) => {
      const matterName = escapeHtml(matter.name);
      const keywords = escapeHtml(matter.keywordsText);
      return `
        <div class="entry" data-matter-index="${idx}">
          <div class="entry-header">
            <strong>Matter</strong>
            <button type="button" data-action="remove-matter">Remove</button>
          </div>
          <div class="entry-body">
            <label>
              Matter name
              <input type="text" data-field="name" value="${matterName}" placeholder="Matter name" />
            </label>
            <label>
              Matter keywords (optional, one per line)
              <textarea data-field="keywordsText" placeholder="keyword">${keywords}</textarea>
            </label>
          </div>
        </div>
      `;
    })
    .join('');
};

const setModeNew = () => {
  closePipelineStream();
  mode = 'new';
  loadedQueryName = null;
  queryNameInput.disabled = false;
  queryNameInput.value = '';
  clientNameInput.value = '';
  billingRateInput.value = '';
  startDateInput.value = '';
  endDateInput.value = '';
  emailsInput.value = '';
  keywordsInput.value = '';
  excludeKeywordsInput.value = '';
  mattersState = [{ name: '', keywordsText: '' }];
  prefillNote.textContent = '';
  renderMatters();
  querySelect.value = NEW_VALUE;
  setPipelineProgress('');
  clearPipelineLog();
  openEntriesLink.style.display = 'none';
};

const loadEntry = (queryName) => {
  closePipelineStream();
  const entry = queryJson[queryName];
  if (!entry) {
    setModeNew();
    return;
  }
  mode = 'edit';
  loadedQueryName = queryName;
  queryNameInput.disabled = true;
  queryNameInput.value = queryName;
  clientNameInput.value = entry.client_name || '';
  billingRateInput.value = entry.billing_rate ?? '';
  startDateInput.value = entry.start || '';
  endDateInput.value = entry.end || '';
  emailsInput.value = linesToText(entry.emails || []);
  keywordsInput.value = linesToText(entry.keywords || []);
  excludeKeywordsInput.value = linesToText(entry.exclude_keywords || []);

  mattersState = Object.entries(entry.matters || {}).map(([name, keywords]) => ({
    name,
    keywordsText: linesToText(Array.isArray(keywords) ? keywords : []),
  }));
  if (!mattersState.length) {
    mattersState = [{ name: '', keywordsText: '' }];
  }
  prefillNote.textContent = '';
  renderMatters();
  querySelect.value = queryName;
  setPipelineProgress('');
  clearPipelineLog();
  openEntriesLink.style.display = 'none';
};

const buildEntryFromForm = () => {
  const clientName = clientNameInput.value.trim();
  const queryName = queryNameInput.value.trim();
  const start = startDateInput.value;
  const end = endDateInput.value;
  const emails = parseLines(emailsInput.value);
  const keywords = parseLines(keywordsInput.value);
  const excludeKeywords = parseLines(excludeKeywordsInput.value);
  const billingRate = Number(billingRateInput.value);

  const matters = {};
  const seenMatters = new Set();
  for (const matter of mattersState) {
    const name = matter.name.trim();
    if (!name) continue;
    if (seenMatters.has(name)) {
      throw new Error(`Duplicate matter name: ${name}`);
    }
    seenMatters.add(name);
    matters[name] = parseLines(matter.keywordsText);
  }

  if (!queryName) throw new Error('Query name is required.');
  if (queryName === 'template') throw new Error('Query name cannot be template.');
  if (!clientName) throw new Error('Client name is required.');
  if (!start || !end) throw new Error('Start and end dates are required.');
  if (Date.parse(start) > Date.parse(end)) throw new Error('Start must be <= end.');
  if (!emails.length) throw new Error('At least one email is required.');
  if (!keywords.length) throw new Error('At least one keyword is required.');
  if (!Object.keys(matters).length) throw new Error('At least one matter is required.');
  if (!Number.isFinite(billingRate) || billingRate <= 0) {
    throw new Error('Billing rate must be a positive number.');
  }

  const previous = mode === 'edit' ? queryJson[loadedQueryName] || {} : {};

  return {
    queryName,
    entry: {
      ...previous,
      client_name: clientName,
      emails,
      keywords,
      exclude_keywords: excludeKeywords,
      start,
      end,
      matters,
      billing_rate: billingRate,
    },
  };
};

const save = async () => {
  updateStatus('');
  const userValue = userInput.value.trim();
  if (!userValue) {
    updateStatus('User is required.', true);
    return null;
  }

  let payload;
  try {
    payload = buildEntryFromForm();
  } catch (error) {
    updateStatus(error.message || 'Validation failed.', true);
    return null;
  }

  if (mode === 'new' && queryJson[payload.queryName]) {
    updateStatus(`Query '${payload.queryName}' already exists.`, true);
    return null;
  }

  if (mode === 'new') {
    payload.entry.requested_timestamp = new Date().toISOString();
  }

  const saveResponse = await fetch('/api/query-entry', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query_name: payload.queryName,
      entry: payload.entry,
      is_new: mode === 'new',
    }),
  });

  if (!saveResponse.ok) {
    const errorPayload = await saveResponse.json().catch(() => ({}));
    updateStatus(errorPayload.error || 'Failed to save query.', true);
    return null;
  }

  if ((inputsJson.user || inputsJson.user_name || '') !== userValue) {
    await fetch('/api/inputs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user: userValue }),
    });
  }

  await refreshData();
  loadEntry(payload.queryName);
  updateStatus(`Saved ${payload.queryName}`);
  return payload.queryName;
};

const runPipeline = async () => {
  closePipelineStream();
  updateStatus('');
  clearPipelineLog();
  setPipelineProgress('');

  setPipelineUiRunning(true);
  let queryName;
  try {
    setPipelineProgress('Saving query…');
    queryName = await save();
    if (!queryName) {
      setPipelineUiRunning(false);
      setPipelineProgress('');
      return;
    }

    if (await checkTimeEntriesExists(queryName)) {
      const proceed = await confirmOverwrite();
      if (!proceed) {
        closePipelineStream();
        setPipelineUiRunning(false);
        setPipelineProgress('');
        updateStatus('Pipeline cancelled.');
        return;
      }
    }

    setPipelineProgress('Starting pipeline…');
    const stream = new EventSource(
      `/api/run-pipeline?query=${encodeURIComponent(queryName)}`
    );
    pipelineSource = stream;

    stream.addEventListener('start', (event) => {
      try {
        const payload = JSON.parse(event.data);
        const total = Array.isArray(payload.steps) ? payload.steps.length : 3;
        setPipelineProgress(`Running 0/${total}…`);
      } catch (error) {
        setPipelineProgress('Running…');
      }
    });

    stream.addEventListener('step_start', (event) => {
      try {
        const payload = JSON.parse(event.data);
        setPipelineProgress(`Step ${payload.step}/${payload.total}: ${payload.name}`);
        appendPipelineLog(`\n==> ${payload.name}\n`);
      } catch (error) {
        setPipelineProgress('Running…');
      }
    });

    stream.addEventListener('log', (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.text) appendPipelineLog(payload.text);
      } catch (error) {
        appendPipelineLog(event.data);
      }
    });

    stream.addEventListener('complete', (event) => {
      let payload;
      try {
        payload = JSON.parse(event.data);
      } catch (error) {
        payload = { success: false, error: 'Pipeline failed.' };
      }
      closePipelineStream();
      setPipelineUiRunning(false);

      if (payload.success) {
        setPipelineProgress('Pipeline complete.');
        updateStatus('Pipeline complete.');
        openEntriesLink.href = `index.html?query=${encodeURIComponent(queryName)}`;
        openEntriesLink.style.display = 'inline-flex';
      } else {
        setPipelineProgress('Pipeline failed.');
        updateStatus(payload.error || 'Pipeline failed.', true);
      }
    });

    stream.onerror = () => {
      closePipelineStream();
      setPipelineUiRunning(false);
      setPipelineProgress('Pipeline connection lost.');
      updateStatus('Pipeline connection lost.', true);
    };
  } catch (error) {
    closePipelineStream();
    setPipelineUiRunning(false);
    setPipelineProgress('');
    updateStatus(error.message || 'Unable to run pipeline.', true);
  }
};

const refreshData = async () => {
  const [queriesResponse, inputsResponse] = await Promise.all([
    fetch('/api/query-json'),
    fetch('/api/inputs'),
  ]);
  if (!queriesResponse.ok) {
    throw new Error('Unable to load query.json.');
  }
  queryJson = await queriesResponse.json();
  inputsJson = inputsResponse.ok ? await inputsResponse.json() : {};

  userInput.value = inputsJson.user_name || inputsJson.user || '';
  renderQuerySelect();
  renderClientNameList();
};

const tryPrefillFromClient = () => {
  if (mode !== 'new') return;
  if (!shouldPrefill()) return;
  const match = getMostRecentQueryForClient(clientNameInput.value);
  if (!match) return;

  billingRateInput.value = match.entry.billing_rate ?? '';
  emailsInput.value = linesToText(match.entry.emails || []);
  keywordsInput.value = linesToText(match.entry.keywords || []);
  excludeKeywordsInput.value = linesToText(match.entry.exclude_keywords || []);
  const matters = match.entry.matters || {};
  mattersState = Object.entries(matters).map(([name, keywords]) => ({
    name,
    keywordsText: linesToText(Array.isArray(keywords) ? keywords : []),
  }));
  if (!mattersState.length) {
    mattersState = [{ name: '', keywordsText: '' }];
  }
  renderMatters();
  prefillNote.textContent = `Prefilled from ${match.name}`;
};

const init = async () => {
  try {
    await refreshData();
    querySelect.value = NEW_VALUE;
    setModeNew();
    updateStatus('');
  } catch (error) {
    updateStatus(error.message || 'Failed to load data.', true);
  }
};

querySelect.addEventListener('change', (event) => {
  const value = event.target.value;
  if (value === NEW_VALUE) {
    setModeNew();
    return;
  }
  loadEntry(value);
});

newQueryButton.addEventListener('click', setModeNew);
runPipelineButton.addEventListener('click', runPipeline);

clientNameInput.addEventListener('blur', tryPrefillFromClient);
clientNameInput.addEventListener('change', tryPrefillFromClient);

addMatterButton.addEventListener('click', () => {
  mattersState.push({ name: '', keywordsText: '' });
  renderMatters();
});

mattersContainer.addEventListener('input', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const matterEl = target.closest('[data-matter-index]');
  if (!matterEl) return;
  const index = Number(matterEl.dataset.matterIndex);
  const field = target.dataset.field;
  if (!field || !mattersState[index]) return;
  mattersState[index][field] = target.value;
});

mattersContainer.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  if (target.dataset.action === 'remove-matter') {
    const matterEl = target.closest('[data-matter-index]');
    if (!matterEl) return;
    const index = Number(matterEl.dataset.matterIndex);
    if (mattersState.length <= 1) {
      updateStatus('At least one matter is required.', true);
      return;
    }
    mattersState.splice(index, 1);
    renderMatters();
  }
});

(async () => {
  if (typeof requiresAuth === 'function') {
    const ok = await requiresAuth();
    if (!ok) return;
    if (typeof setupProfileBar === 'function' && typeof getCurrentUser === 'function') {
      const u = getCurrentUser();
      if (u) setupProfileBar(u);
    }
  }
  init();
})();
