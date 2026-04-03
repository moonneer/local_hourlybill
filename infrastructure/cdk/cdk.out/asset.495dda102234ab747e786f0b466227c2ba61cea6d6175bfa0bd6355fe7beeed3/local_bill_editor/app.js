const querySelect = document.getElementById('query-select');
const reloadButton = document.getElementById('reload-button');
const saveButton = document.getElementById('save-button');
const saveStatus = document.getElementById('save-status');
const addEntryButton = document.getElementById('add-entry');
const importBill4TimeButton = document.getElementById('import-bill4time');
const bill4TimeFileInput = document.getElementById('bill4time-file');
const pdfLink = document.getElementById('pdf-link');
const entriesContainer = document.getElementById('entries');
const clientNameInput = document.getElementById('client-name');
const userNameInput = document.getElementById('user-name');
const billingRateInput = document.getElementById('billing-rate');
const timezoneInput = document.getElementById('timezone');
const matterList = document.getElementById('matter-list');

let state = null;
let entryIdCounter = 0;
let queryJsonCache = null;
let isDirty = false;
let toastContainer = null;

let systemSenderBlocklist = new Set();
let unavailableTooltip = 'Unable to access document to estimate time';

const isDraftEntry = (entry) => Boolean(entry && entry.__draft);

const ensureToastContainer = () => {
  if (toastContainer) return toastContainer;
  toastContainer = document.createElement('div');
  toastContainer.className = 'toast-container';
  document.body.appendChild(toastContainer);
  return toastContainer;
};

const showToast = (message) => {
  const container = ensureToastContainer();
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  container.appendChild(toast);
  window.setTimeout(() => {
    toast.classList.add('toast-hide');
    window.setTimeout(() => toast.remove(), 280);
  }, 2200);
};

const markDirty = () => {
  isDirty = true;
};

const normalizeEntryType = (value) => {
  const raw = String(value || '')
    .trim()
    .toLowerCase();
  if (raw === 'potential_expense' || raw === 'potential-expense' || raw === 'potential') {
    return 'potential_expense';
  }
  if (raw === 'expense' || raw === 'e') return 'expense';
  if (raw === 'time' || raw === 'fee' || raw === 'f') return 'time';
  return 'time';
};

const getEntryType = (entry) => normalizeEntryType(entry?.entry_type ?? entry?.type);

const isPotentialExpenseEntry = (entry) => getEntryType(entry) === 'potential_expense';

const isExpenseEntry = (entry) => {
  const type = getEntryType(entry);
  return type === 'expense' || type === 'potential_expense';
};

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const toNumber = (value) => {
  const num = parseFloat(value);
  return Number.isFinite(num) ? num : 0;
};

const formatCurrency = (value) => {
  const number = Number.isFinite(value) ? value : 0;
  return number.toFixed(2);
};

const updateSaveStatus = (message, isError = false) => {
  saveStatus.textContent = message;
  saveStatus.style.color = isError ? '#9b2c2c' : '#2d5d4e';
};

const getQueryFromUrl = () => {
  const params = new URLSearchParams(window.location.search);
  return params.get('query');
};

const setQueryInUrl = (query) => {
  const url = new URL(window.location.href);
  url.searchParams.set('query', query);
  window.history.replaceState({}, '', url);
};

const enrichEntries = (entries = []) =>
  entries.map((entry) => {
    const documents = entry.documents || [];
    const predictedTime = entry.predicted_time ?? 0;
    const billingRate = entry.billing_rate ?? 0;
    const amount = entry.amount_charged ?? predictedTime * billingRate;
    entryIdCounter += 1;
    return {
      ...entry,
      predicted_time: predictedTime,
      billing_rate: billingRate,
      amount_charged: amount,
      documents,
      entry_type: getEntryType(entry),
      __id: entryIdCounter,
    };
  });

const fetchQueries = async () => {
  const response = await fetch('/api/queries');
  if (!response.ok) {
    throw new Error('Unable to load queries.');
  }
  const data = await response.json();
  return data.queries || [];
};

const fetchTimeEntries = async (query) => {
  const response = await fetch(`/api/time-entries?query=${encodeURIComponent(query)}`);
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Unable to load time entries.');
  }
  return response.json();
};

const fetchQueryJson = async () => {
  if (queryJsonCache) return queryJsonCache;
  const response = await fetch('/api/query-json');
  if (!response.ok) {
    throw new Error('Unable to load query.json.');
  }
  queryJsonCache = await response.json();
  return queryJsonCache;
};

const loadSystemSenders = async () => {
  const response = await fetch('/api/system-senders');
  if (!response.ok) {
    throw new Error('Unable to load system sender configuration.');
  }

  const data = await response.json().catch(() => ({}));
  const senders = Array.isArray(data.blocked_senders) ? data.blocked_senders : [];
  systemSenderBlocklist = new Set(
    senders.map((value) => String(value || '').trim().toLowerCase()).filter(Boolean)
  );
  if (typeof data.tooltip === 'string' && data.tooltip.trim()) {
    unavailableTooltip = data.tooltip.trim();
  }
};

const extractEmailAddress = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const match = raw.match(/<([^>]+)>/);
  const candidate = (match ? match[1] : raw).trim();
  const maybeEmail = candidate.split(/\s+/)[0];
  return maybeEmail.replace(/^"+|"+$/g, '').toLowerCase();
};

const getSenderForDoc = (doc) => {
  if (!doc || typeof doc !== 'object') return '';
  const candidates = [
    doc.from,
    doc.from_email,
    doc.sender,
    doc.source_email_from,
    doc.email_from,
    doc.metadata?.from,
    doc.headers?.from,
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    const value = Array.isArray(candidate) ? candidate[0] : candidate;
    const email = extractEmailAddress(value);
    if (email) return email;
  }

  const sourceId = String(doc.source_email_id || '').trim();
  if (!sourceId || !state?.sender_by_email_id) return '';
  return extractEmailAddress(state.sender_by_email_id[sourceId] || '');
};

const loadTimeEntries = async (query) => {
  const data = await fetchTimeEntries(query);
  let queryMatters = [];
  try {
    const queryJson = await fetchQueryJson();
    const queryEntry = queryJson?.[query];
    if (queryEntry && typeof queryEntry === 'object' && queryEntry.matters) {
      queryMatters = Object.keys(queryEntry.matters || {}).filter((matter) => String(matter).trim());
    }
  } catch (error) {
    queryMatters = [];
  }
  state = {
    query,
    client_name: data.client_name || '',
    user_name: data.user_name || '',
    billing_rate: data.billing_rate ?? 0,
    timezone: data.timezone || '',
    sender_by_email_id: data.__sender_by_email_id || null,
    query_matters: queryMatters,
    entries: enrichEntries(data.entries || []),
  };
  isDirty = false;
  clientNameInput.value = state.client_name;
  userNameInput.value = state.user_name;
  billingRateInput.value = state.billing_rate;
  timezoneInput.value = state.timezone;
  if (pdfLink) {
    pdfLink.href = `pdf.html?query=${encodeURIComponent(query)}`;
  }
  renderEntries();
  updateSaveStatus('');
};

const buildMatterList = (entries) => {
  const matters = new Set(state?.query_matters || []);
  entries.forEach((entry) => {
    if (entry.matter) {
      matters.add(entry.matter);
    }
  });
  return Array.from(matters);
};

const normalizeMatterSortKey = (matter) => {
  const raw = String(matter || '').trim();
  if (!raw) return '\uffff';
  return raw.toLowerCase();
};

const normalizeDateSortKey = (date) => {
  const raw = String(date || '').trim();
  if (!raw) return '9999-12-31';
  return raw;
};

const entryTypeSortKey = (entry) => {
  const type = getEntryType(entry);
  if (type === 'time') return 0;
  if (type === 'potential_expense') return 1;
  return 2;
};

const sortEntriesForSave = (entries) =>
  entries
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => {
      const matterCompare = normalizeMatterSortKey(a.entry.matter).localeCompare(
        normalizeMatterSortKey(b.entry.matter)
      );
      if (matterCompare) return matterCompare;
      const typeCompare = entryTypeSortKey(a.entry) - entryTypeSortKey(b.entry);
      if (typeCompare) return typeCompare;
      const dateCompare = normalizeDateSortKey(a.entry.date).localeCompare(
        normalizeDateSortKey(b.entry.date)
      );
      if (dateCompare) return dateCompare;
      return a.index - b.index;
    })
    .map(({ entry }) => ({ ...entry, entry_type: getEntryType(entry), __draft: false }));

const parseBill4TimeDate = (value) => {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length !== 8) return '';
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
};

const normalizeBill4TimePersonName = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (!raw.includes(',')) return raw;
  const parts = raw.split(',').map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) return raw.replace(/,+/g, ' ').trim();
  const lastName = parts[0];
  const givenNames = parts.slice(1).join(' ');
  return `${givenNames} ${lastName}`.replace(/\s+/g, ' ').trim();
};

const parseBill4TimeFile = (text) => {
  const rawLines = String(text || '')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!rawLines.length) {
    throw new Error('Bill4Time file is empty.');
  }

  const lines = [...rawLines];
  if (/^led(es)?/i.test(lines[0]) && !lines[0].includes('|')) {
    lines.shift();
  }
  if (!lines.length) {
    throw new Error('Bill4Time file is missing the header row.');
  }

  const headers = lines[0]
    .split('|')
    .map((header) => header.trim().replace(/\[\]$/, ''))
    .filter(Boolean);
  if (headers.length < 4) {
    throw new Error('Unable to parse Bill4Time header row.');
  }

  const descriptionIndex = headers.indexOf('LINE_ITEM_DESCRIPTION');
  const records = [];

  for (const line of lines.slice(1)) {
    let parts = line.split('|');

    if (parts.length !== headers.length && descriptionIndex !== -1 && parts.length > headers.length) {
      const extra = parts.length - headers.length;
      const merged = [
        ...parts.slice(0, descriptionIndex),
        parts.slice(descriptionIndex, descriptionIndex + extra + 1).join('|'),
        ...parts.slice(descriptionIndex + extra + 1),
      ];
      parts = merged;
    }

    if (parts.length < headers.length) {
      continue;
    }
    if (parts.length > headers.length) {
      parts = parts.slice(0, headers.length);
    }

    const record = {};
    for (let idx = 0; idx < headers.length; idx += 1) {
      const key = headers[idx];
      const rawValue = parts[idx] ?? '';
      record[key] = String(rawValue).trim().replace(/\[\]$/, '');
    }
    records.push(record);
  }

  if (!records.length) {
    throw new Error('No line items found in Bill4Time file.');
  }

  const toFloat = (value) => {
    const num = parseFloat(String(value ?? '').trim());
    return Number.isFinite(num) ? num : 0;
  };

	  const lineItems = records
	    .map((record) => {
	      const matterId =
	        String(record.CLIENT_MATTER_ID || '').trim() ||
	        String(record.LAW_FIRM_MATTER_ID || '').trim() ||
	        '';
      const rawType = String(record['EXP/FEE/INV_ADJ_TYPE'] || '').trim().toUpperCase();
      const entryType = rawType.startsWith('E') ? 'expense' : 'time';
      const date = parseBill4TimeDate(record.LINE_ITEM_DATE);
      const predictedTime =
        entryType === 'expense' ? 0 : toFloat(record.LINE_ITEM_NUMBER_OF_UNITS);
      const billingRate = entryType === 'expense' ? 0 : toFloat(record.LINE_ITEM_UNIT_COST);
      const amountChargedRaw = record.LINE_ITEM_TOTAL;
      const amountChargedParsed = toFloat(amountChargedRaw);
      const amountCharged = amountChargedParsed
        ? amountChargedParsed
        : Number((predictedTime * billingRate).toFixed(2));
      const description = String(record.LINE_ITEM_DESCRIPTION || '').trim();
      const userName = normalizeBill4TimePersonName(record.TIMEKEEPER_NAME);
	      return {
	        matterId,
	        date,
	        description,
	        predicted_time: predictedTime,
	        billing_rate: billingRate,
	        amount_charged: Number.isFinite(amountCharged) ? Number(amountCharged.toFixed(2)) : 0,
	        user_name: userName,
	        entry_type: entryType,
	      };
	    })
	    .filter((item) => item.date && item.description);

  if (!lineItems.length) {
    throw new Error('No valid Bill4Time line items were parsed.');
  }

  return lineItems;
};

const showMatterMappingModal = ({
  fileName,
  matterIds,
  defaultMatter,
  onConfirm,
}) => {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  const rowsHtml = matterIds
    .map((id) => {
      const safeId = escapeHtml(id || '(blank)');
      const initialValue = defaultMatter ? `value="${escapeHtml(defaultMatter)}"` : '';
      return `
        <label class="modal-row">
          <span class="modal-row-label">Matter ID ${safeId}</span>
          <input type="text" list="matter-list" data-matter-id="${escapeHtml(id)}" placeholder="Type or choose a matter name" ${initialValue} />
        </label>
      `;
    })
    .join('');

  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true">
      <h2>Map matter IDs</h2>
      <p class="subtle">
        Assign each Bill4Time matter ID to a matter name for this bill. You can pick an existing matter or type a new one.
      </p>
      <div class="modal-grid">
        ${rowsHtml}
      </div>
      <div class="modal-actions">
        <button type="button" data-action="cancel">Cancel</button>
        <button type="button" class="primary" data-action="confirm">Import &amp; save</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const confirmButton = overlay.querySelector('[data-action="confirm"]');
  const inputs = Array.from(overlay.querySelectorAll('input[data-matter-id]'));

  const getMapping = () => {
    const mapping = {};
    for (const input of inputs) {
      const matterId = input.dataset.matterId ?? '';
      const value = String(input.value || '').trim();
      if (!value) return null;
      mapping[matterId] = value;
    }
    return mapping;
  };

  const updateDisabled = () => {
    if (!confirmButton) return;
    confirmButton.disabled = !getMapping();
  };

  inputs.forEach((input) => {
    input.addEventListener('input', updateDisabled);
  });

  updateDisabled();

  const close = () => {
    overlay.remove();
    document.removeEventListener('keydown', onKeyDown);
  };

  const onKeyDown = (event) => {
    if (event.key === 'Escape') close();
  };
  document.addEventListener('keydown', onKeyDown);

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) close();
  });

  overlay.querySelector('[data-action="cancel"]')?.addEventListener('click', close);
  overlay.querySelector('[data-action="confirm"]')?.addEventListener('click', async () => {
    const mapping = getMapping();
    if (!mapping) {
      updateDisabled();
      return;
    }
    close();
    await onConfirm({ mapping, fileName });
  });
};

const renderEmailsHtml = (documents = []) => {
  const docs = Array.isArray(documents) ? documents : [];
  if (!docs.length) {
    return '<p class="empty">No emails linked.</p>';
  }

  return docs
    .map((doc, docIndex) => {
      const subjectLine = doc.subject || '';
      const attachmentName = doc.attachment_filename || '';
      const label = escapeHtml(subjectLine || attachmentName || `Document ${doc.index || docIndex + 1}`);
      const meta = escapeHtml(subjectLine && attachmentName ? attachmentName : '');
      const link = doc.source_email_id
        ? `https://mail.google.com/mail/u/0/#inbox/${encodeURIComponent(doc.source_email_id)}`
        : '';
      if (!link) {
        return `
          <span class="doc-missing">${label || 'Document'}</span>
        `;
      }
      const sender = getSenderForDoc(doc);
      const isBlockedSender = sender && systemSenderBlocklist.has(sender);
      const tooltipAttrs = isBlockedSender
        ? ` data-tooltip="${escapeHtml(unavailableTooltip)}" title="${escapeHtml(unavailableTooltip)}"`
        : '';
      const className = `doc-link${isBlockedSender ? ' doc-link-blocked' : ''}`;
      return `
        <a class="${className}" href="${link}" target="_blank" rel="noreferrer"${tooltipAttrs}>
          ${label || 'Open email'}
        </a>
        ${meta ? `<span class="doc-meta">${meta}</span>` : ''}
      `;
    })
    .join('');
};

const renderEntryCardHtml = (entry, delayMs) => {
  const entryType = getEntryType(entry);
  const isExpense = isExpenseEntry(entry);
  const isPotential = isPotentialExpenseEntry(entry);

  const amountDisplay = formatCurrency(entry.amount_charged);
  const amountInputValue = toNumber(entry.amount_charged);
  const documents = entry.documents || [];
  const docsHtml = renderEmailsHtml(documents);
  const entryClass = `entry${isPotential ? ' entry-potential-expense' : ''}`;

  return `
    <div class="${entryClass}" data-entry-id="${entry.__id}" style="--delay:${delayMs}ms">
      <div class="entry-header">
        <strong>Entry</strong>
        <div class="entry-actions">
          <div class="entry-type-switch ${isPotential ? 'potential' : ''}">
            <span class="entry-type-label">Hours</span>
            <label class="switch">
              <input type="checkbox" data-action="toggle-entry-type" ${
                isExpense ? 'checked' : ''
              } />
              <span class="switch-slider"></span>
            </label>
            <span class="entry-type-label">Expense</span>
            ${
              isPotential
                ? '<span class="entry-type-badge">Potential</span>'
                : ''
            }
          </div>
          <button type="button" data-action="delete">Delete</button>
        </div>
      </div>
      <div class="entry-body">
        <label>
          Matter
          <input type="text" list="matter-list" data-field="matter" value="${entry.matter || ''}" />
        </label>
        <label>
          Date
          <input type="date" data-field="date" value="${entry.date || ''}" />
        </label>
        ${
          entryType === 'time'
            ? `
                <label>
                  Hours
                  <input type="number" step="0.1" data-field="predicted_time" value="${entry.predicted_time}" />
                </label>
                <label>
                  Rate (USD/hr)
                  <input type="number" step="1" data-field="billing_rate" value="${entry.billing_rate}" />
                </label>
              `
            : `
                <label>
                  Amount (USD)
                  <input type="number" step="0.01" min="0" data-field="amount_charged" value="${amountInputValue}" />
                </label>
              `
        }
        <label>
          User name
          <input type="text" data-field="user_name" value="${entry.user_name || ''}" />
        </label>
        ${
          entryType === 'time'
            ? `
                <label class="amount">
                  Amount charged: $<span data-amount-for="${entry.__id}">${amountDisplay}</span>
                </label>
              `
            : ''
        }
        <label>
          Description
          <textarea data-field="description">${entry.description || ''}</textarea>
        </label>
        <div class="doc-list">
          <div class="doc-list-title">Emails</div>
          ${docsHtml}
        </div>
      </div>
    </div>
  `;
};

const renderEntrySectionHtml = ({
  title,
  entries,
  baseDelayMs,
  emptyText,
}) => {
  const safeTitle = escapeHtml(title);
  const rows = entries.length
    ? entries.map((entry, idx) => renderEntryCardHtml(entry, baseDelayMs + idx * 40)).join('')
    : `<p class="empty">${escapeHtml(emptyText)}</p>`;

  return `
    <div class="matter-subsection">
      <div class="matter-subsection-title">${safeTitle}</div>
      ${rows}
    </div>
  `;
};

const renderEntries = () => {
  if (!state) {
    entriesContainer.innerHTML = '<p class="empty">No data loaded.</p>';
    return;
  }

  const drafts = state.entries.filter(isDraftEntry);
  const stableEntries = state.entries.filter((entry) => !isDraftEntry(entry));

  const grouped = {};
  stableEntries.forEach((entry) => {
    const matterName = entry.matter || 'Unassigned';
    grouped[matterName] = grouped[matterName] || [];
    grouped[matterName].push(entry);
  });

  const matters = buildMatterList(state.entries);
  matterList.innerHTML = matters.map((matter) => `<option value="${matter}"></option>`).join('');

  let draftHtml = '';
  if (drafts.length) {
    const draftTime = drafts.filter((entry) => !isExpenseEntry(entry));
    const draftExpenses = drafts.filter(isExpenseEntry);
    const timeSection = renderEntrySectionHtml({
      title: 'Hours',
      entries: draftTime,
      baseDelayMs: 0,
      emptyText: draftExpenses.length ? 'No hour entries.' : 'No entries yet.',
    });
    const expenseSection = draftExpenses.length
      ? renderEntrySectionHtml({
          title: 'Expenses',
          entries: draftExpenses,
          baseDelayMs: draftTime.length * 40,
          emptyText: '',
        })
      : '';

    draftHtml = `
      <div class="matter-group draft-group" style="--delay:0ms">
        <h3>Unsaved</h3>
        ${timeSection}
        ${expenseSection}
      </div>
    `;
  }

  entriesContainer.innerHTML = `${draftHtml}${Object.keys(grouped)
    .sort()
    .map((matter, groupIndex) => {
      const entriesForMatter = grouped[matter] || [];
      const feeEntries = entriesForMatter.filter((entry) => !isExpenseEntry(entry));
      const expenseEntries = entriesForMatter.filter(isExpenseEntry);
      const baseDelayMs = groupIndex * 80;
      const feeSection = renderEntrySectionHtml({
        title: 'Hours',
        entries: feeEntries,
        baseDelayMs,
        emptyText: expenseEntries.length ? 'No hour entries.' : 'No entries yet.',
      });
      const expenseSection = expenseEntries.length
        ? renderEntrySectionHtml({
            title: 'Expenses',
            entries: expenseEntries,
            baseDelayMs: baseDelayMs + feeEntries.length * 40,
            emptyText: '',
          })
        : '';

      return `
        <div class="matter-group" style="--delay:${groupIndex * 80}ms">
          <h3>${matter}</h3>
          ${feeSection}
          ${expenseSection}
        </div>
      `;
    })
    .join('')}`;

  if (!entriesContainer.innerHTML.trim()) {
    entriesContainer.innerHTML = '<p class="empty">No entries yet. Add one to get started.</p>';
  }
};

const addEntry = () => {
  if (!state) return;
  entryIdCounter += 1;
  const billingRate = state.billing_rate ?? 0;
  const predictedTime = 0;
  const newEntry = {
	    matter: '',
	    description: '',
	    predicted_time: predictedTime,
	    date: '',
	    user_name: state.user_name || '',
	    billing_rate: billingRate,
	    amount_charged: predictedTime * billingRate,
	    entry_type: 'time',
	    documents: [],
	    documentsText: '[]',
    __draft: true,
    __id: entryIdCounter,
  };
  state.entries.unshift(newEntry);
  markDirty();
  renderEntries();
};

const deleteEntry = (entryId) => {
  if (!state) return;
  state.entries = state.entries.filter((entry) => entry.__id !== entryId);
  markDirty();
  renderEntries();
};

const updateEntryField = (entryId, field, value) => {
  const entry = state.entries.find((item) => item.__id === entryId);
  if (!entry) return;
  if (field === 'amount_charged') {
    entry.amount_charged = toNumber(value);
    if (isPotentialExpenseEntry(entry) && entry.amount_charged > 0) {
      entry.entry_type = 'expense';
      markDirty();
      renderEntries();
      return;
    }
    markDirty();
    return;
  }

  entry[field] = value;
  markDirty();
  if ((field === 'predicted_time' || field === 'billing_rate') && getEntryType(entry) === 'time') {
    const hours = toNumber(entry.predicted_time);
    const rate = toNumber(entry.billing_rate);
    entry.amount_charged = hours * rate;
    const amountEl = entriesContainer.querySelector(`[data-amount-for="${entryId}"]`);
    if (amountEl) {
      amountEl.textContent = formatCurrency(entry.amount_charged);
    }
  }
  if (field === 'matter') {
    renderEntries();
  }
};

const buildPayload = (entriesOverride) => {
  const sourceEntries = Array.isArray(entriesOverride) ? entriesOverride : state.entries;
  const entries = sourceEntries.map((entry) => {
    const documents = entry.documents || [];
    const predictedTime = toNumber(entry.predicted_time);
    const entryType = getEntryType(entry);
    let billingRate = toNumber(entry.billing_rate);
    if (entryType === 'time' && billingRate <= 0) {
      billingRate = toNumber(state.billing_rate);
    }
    const amountCharged =
      entryType === 'time'
        ? predictedTime * billingRate
        : toNumber(entry.amount_charged);
    const payload = {
      matter: entry.matter || '',
      description: entry.description || '',
      entry_type: getEntryType(entry),
      predicted_time: predictedTime,
      date: entry.date || '',
      user_name: entry.user_name || state.user_name || '',
      billing_rate: billingRate,
      amount_charged: Number.isFinite(amountCharged) ? Number(amountCharged.toFixed(2)) : 0,
      documents,
    };
    if (entry.imported) {
      payload.imported = String(entry.imported);
    }
    if (entry.imported_date) {
      payload.imported_date = String(entry.imported_date);
    }
    return payload;
  });

  return {
    client_name: state.client_name || '',
    billing_rate: toNumber(state.billing_rate),
    user_name: state.user_name || '',
    timezone: state.timezone || '',
    entries,
  };
};

const saveEntries = async () => {
  if (!state) return;
  let payload;
  const sortedEntries = sortEntriesForSave(state.entries);
  try {
    payload = buildPayload(sortedEntries);
  } catch (error) {
    updateSaveStatus(error.message || 'Unable to save.', true);
    return false;
  }
  const response = await fetch(`/api/time-entries?query=${encodeURIComponent(state.query)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    updateSaveStatus(error.error || 'Save failed.', true);
    return false;
  }
  const result = await response.json();
  state.entries = sortedEntries;
  renderEntries();
  isDirty = false;
  updateSaveStatus(
    `Saved as ${result.saved_as}${result.did_backup ? ' (backup rotated)' : ''}`
  );
  showToast('Time entries saved');
  return true;
};

const init = async () => {
  try {
    await loadSystemSenders();
    const queries = await fetchQueries();
    if (!queries.length) {
      updateSaveStatus('No queries found in query.json.', true);
      return;
    }
    querySelect.innerHTML = queries
      .map((query) => `<option value="${query}">${query}</option>`)
      .join('');
    const initialQuery = getQueryFromUrl() || queries[0];
    querySelect.value = initialQuery;
    setQueryInUrl(initialQuery);
    await loadTimeEntries(initialQuery);
  } catch (error) {
    updateSaveStatus(error.message || 'Failed to load data.', true);
  }
};

querySelect.addEventListener('change', async (event) => {
  const query = event.target.value;
  setQueryInUrl(query);
  await loadTimeEntries(query);
});

reloadButton.addEventListener('click', async () => {
  if (!state) return;
  await loadTimeEntries(state.query);
});

saveButton.addEventListener('click', saveEntries);
addEntryButton.addEventListener('click', addEntry);

importBill4TimeButton?.addEventListener('click', () => {
  if (!state) return;
  bill4TimeFileInput.value = '';
  bill4TimeFileInput.click();
});

bill4TimeFileInput?.addEventListener('change', async (event) => {
  if (!state) return;
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  let text;
  try {
    text = await file.text();
  } catch (error) {
    updateSaveStatus('Unable to read Bill4Time file.', true);
    return;
  }

  let lineItems;
  try {
    lineItems = parseBill4TimeFile(text);
  } catch (error) {
    updateSaveStatus(error.message || 'Unable to parse Bill4Time file.', true);
    return;
  }

  const matterIdCounts = new Map();
  lineItems.forEach((item) => {
    const key = String(item.matterId || '').trim();
    matterIdCounts.set(key, (matterIdCounts.get(key) || 0) + 1);
  });
  const matterIds = Array.from(matterIdCounts.keys()).sort();

  const matters = buildMatterList(state.entries);
  const defaultMatter = matterIds.length === 1 && matters.length === 1 ? matters[0] : '';

  showMatterMappingModal({
    fileName: file.name,
    matterIds,
    defaultMatter,
    onConfirm: async ({ mapping, fileName: importedFileName }) => {
      const importedAt = new Date().toISOString();
      const importedEntries = lineItems.map((item) => ({
        matter: mapping[String(item.matterId || '').trim()] || '',
        description: item.description || '',
        predicted_time: item.predicted_time ?? 0,
        date: item.date || '',
        user_name: item.user_name || state.user_name || '',
        billing_rate: item.billing_rate ?? state.billing_rate ?? 0,
        amount_charged: item.amount_charged ?? 0,
        entry_type: item.entry_type || 'time',
        documents: [],
        imported: importedFileName,
        imported_date: importedAt,
      }));

      const combined = [...importedEntries, ...state.entries];
      state.entries = enrichEntries(combined);
      markDirty();
      renderEntries();
      updateSaveStatus(`Imported ${importedEntries.length} entries from ${importedFileName}. Saving…`);
      await saveEntries();
    },
  });
});

clientNameInput.addEventListener('input', (event) => {
  if (!state) return;
  state.client_name = event.target.value;
  markDirty();
});

userNameInput.addEventListener('input', (event) => {
  if (!state) return;
  state.user_name = event.target.value;
  markDirty();
});

billingRateInput.addEventListener('input', (event) => {
  if (!state) return;
  state.billing_rate = event.target.value;
  markDirty();
});

timezoneInput.addEventListener('input', (event) => {
  if (!state) return;
  state.timezone = event.target.value;
  markDirty();
});

entriesContainer.addEventListener('input', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const entryEl = target.closest('[data-entry-id]');
  if (!entryEl) return;
  const entryId = Number(entryEl.dataset.entryId);
  const field = target.dataset.field;
  if (!field) return;
  updateEntryField(entryId, field, target.value);
});

entriesContainer.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const deleteButton = target.closest('[data-action="delete"]');
  if (!deleteButton) return;
  const entryEl = deleteButton.closest('[data-entry-id]');
  if (!entryEl) return;
  deleteEntry(Number(entryEl.dataset.entryId));
});

entriesContainer.addEventListener('change', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  if (target.dataset.action !== 'toggle-entry-type') return;
  const entryEl = target.closest('[data-entry-id]');
  if (!entryEl) return;
  const entryId = Number(entryEl.dataset.entryId);
  const entry = state?.entries?.find((item) => item.__id === entryId);
  if (!entry) return;

  const wantsExpense = Boolean(target.checked);
  entry.entry_type = wantsExpense ? 'expense' : 'time';
  markDirty();

  if (!wantsExpense) {
    const hours = toNumber(entry.predicted_time);
    let rate = toNumber(entry.billing_rate);
    if (rate <= 0) {
      rate = toNumber(state?.billing_rate);
      entry.billing_rate = rate;
    }
    entry.amount_charged = hours * rate;
  }

  renderEntries();
});

pdfLink?.addEventListener('click', async (event) => {
  if (!state) return;
  if (!isDirty) return;
  event.preventDefault();
  updateSaveStatus('Saving changes before generating PDF…');
  const ok = await saveEntries();
  if (ok) {
    window.location.href = pdfLink.href;
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
