const querySelect = document.getElementById('query-select');
const reloadButton = document.getElementById('reload');
const generateButton = document.getElementById('generate');
const statusEl = document.getElementById('status');

const userInput = document.getElementById('user');
const lawFirmPhoneInput = document.getElementById('law-firm-phone');
const lawFirmWebsiteInput = document.getElementById('law-firm-website');
const lawFirmLogoPathInput = document.getElementById('law-firm-logo-path');
const logoFileInput = document.getElementById('logo-file');

const userAddressLine1Input = document.getElementById('user-address-line1');
const userAddressLine2Input = document.getElementById('user-address-line2');
const userCityInput = document.getElementById('user-city');
const userStateInput = document.getElementById('user-state');
const userPostalCodeInput = document.getElementById('user-postal-code');
const userCountryInput = document.getElementById('user-country');

const invoiceEl = document.getElementById('invoice');

let queryJson = {};
let inputsJson = {};
let timeEntries = null;
let selectedQuery = null;

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

const getQueryFromUrl = () => {
  const params = new URLSearchParams(window.location.search);
  return params.get('query');
};

const setQueryInUrl = (query) => {
  const url = new URL(window.location.href);
  url.searchParams.set('query', query);
  window.history.replaceState({}, '', url);
};

const initialsFromName = (name) => {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return '';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
};

const normalizeFullName = (name) => {
  const raw = String(name || '').trim();
  if (!raw) return '';
  if (!raw.includes(',')) return raw;
  const parts = raw.split(',').map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) return raw.replace(/,+/g, ' ').trim();
  const lastName = parts[0];
  const givenNames = parts.slice(1).join(' ');
  return `${givenNames} ${lastName}`.replace(/\s+/g, ' ').trim();
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

const isExpenseEntry = (entry) => {
  const type = getEntryType(entry);
  return type === 'expense' || type === 'potential_expense';
};

const formatCurrency = (value) => {
  const num = Number(value);
  const safe = Number.isFinite(num) ? num : 0;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(safe);
};

const formatHourlyRate = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return '$0';
  const formatted = Number.isInteger(num) ? num.toFixed(0) : num.toFixed(2);
  return `$${formatted}`;
};

const formatDate = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  let parsed;
  if (match) {
    parsed = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  } else {
    parsed = new Date(raw);
  }
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleDateString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
};

const readLines = (...values) =>
  values
    .map((value) => String(value || '').trim())
    .filter(Boolean);

const normalizePhoneDigits = (value) => {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1);
  if (digits.length > 10) return digits.slice(-10);
  return digits;
};

const formatPhoneNumber = (value) => {
  const digits = normalizePhoneDigits(value);
  if (digits.length !== 10) return String(value || '').trim();
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
};

const buildAddressLines = () =>
  readLines(
    userAddressLine1Input.value,
    userAddressLine2Input.value,
    [userCityInput.value, userStateInput.value, userPostalCodeInput.value]
      .map((v) => String(v || '').trim())
      .filter(Boolean)
      .join(', '),
    userCountryInput.value
  );

const buildLogoMarkup = (logoPath) => {
  const safePath = String(logoPath || '').trim();
  if (!safePath) return '';
  return `<img class="invoice-logo" src="${escapeHtml(safePath)}" alt="Law firm logo" />`;
};

const renderInvoice = () => {
  if (!timeEntries) {
    invoiceEl.innerHTML = '<p class="empty">Select a query to preview the invoice.</p>';
    return;
  }

  const entries = Array.isArray(timeEntries.entries) ? timeEntries.entries : [];
  const clientName = timeEntries.client_name || '';
  const billingRate = Number(timeEntries.billing_rate) || 0;
  const userName = userInput.value.trim() || timeEntries.user_name || '';

  const queryEntry = queryJson[selectedQuery] || {};
  const start = queryEntry.start || '';
  const end = queryEntry.end || '';

  const grouped = {};
  for (const entry of entries) {
    const matter = entry.matter || 'General';
    grouped[matter] = grouped[matter] || [];
    grouped[matter].push(entry);
  }

  const matterNames = Object.keys(grouped).sort((a, b) => a.localeCompare(b));

  const totals = entries.reduce(
    (acc, entry) => {
      const hoursOrUnits = Number(entry.predicted_time ?? 0) || 0;
      const rate = Number(entry.billing_rate ?? billingRate) || 0;
      const amount = Number(entry.amount_charged ?? hoursOrUnits * rate) || 0;
      if (!isExpenseEntry(entry)) {
        acc.hours += hoursOrUnits;
      }
      acc.amount += amount;
      return acc;
    },
    { hours: 0, amount: 0 }
  );

  const addressLines = buildAddressLines();
  const phone = formatPhoneNumber(lawFirmPhoneInput.value);
  const website = lawFirmWebsiteInput.value.trim();
  const logoPath = lawFirmLogoPathInput.value.trim();

  const invoiceDate = formatDate(new Date().toISOString());
  const servicePeriod = start && end ? `${formatDate(start)} – ${formatDate(end)}` : '';

  const contactLines = [
    ...addressLines.map((line) => `<div class="invoice-muted">${escapeHtml(line)}</div>`),
    phone ? `<div class="invoice-muted">Phone: ${escapeHtml(phone)}</div>` : '',
    website ? `<div class="invoice-muted">${escapeHtml(website)}</div>` : '',
  ].filter(Boolean);

  const summaryLines = [
    `<div class="summary-row"><span>Invoice Total</span><strong>${formatCurrency(totals.amount)}</strong></div>`,
    `<div class="summary-row"><span>Total Hours</span><strong>${totals.hours.toFixed(2)}</strong></div>`,
    `<div class="summary-row"><span>Invoice Date</span><strong>${escapeHtml(invoiceDate)}</strong></div>`,
  ].join('');

  const feeTableHeader = `
    <thead>
      <tr>
        <th style="width: 90px">Date</th>
        <th style="width: 120px">By</th>
        <th>Service summary</th>
        <th style="width: 140px" class="num">Hours/Rate</th>
        <th style="width: 90px" class="num">Amount</th>
      </tr>
    </thead>
  `;

  const expenseTableHeader = `
    <thead>
      <tr>
        <th style="width: 90px">Date</th>
        <th style="width: 120px">By</th>
        <th>Expense</th>
        <th style="width: 90px" class="num">Amount</th>
      </tr>
    </thead>
  `;

  const tables = matterNames
    .map((matter) => {
      const allEntries = grouped[matter].slice();
      const feeEntries = allEntries.filter((entry) => !isExpenseEntry(entry));
      const expenseEntries = allEntries.filter(isExpenseEntry);

      const feeRows = feeEntries
        .slice()
        .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')))
        .map((entry) => {
          const hours = Number(entry.predicted_time ?? 0) || 0;
          const rate = Number(entry.billing_rate ?? billingRate) || 0;
          const amount = Number(entry.amount_charged ?? hours * rate) || 0;
          const person = normalizeFullName(entry.user_name || userName);
          const hoursRate = `${hours.toFixed(2)} at ${formatHourlyRate(rate)}/hr`;
          return `
            <tr>
              <td>${escapeHtml(formatDate(entry.date || ''))}</td>
              <td>${escapeHtml(person)}</td>
              <td>${escapeHtml(entry.description || '')}</td>
              <td class="num">${escapeHtml(hoursRate)}</td>
              <td class="num">${formatCurrency(amount)}</td>
            </tr>
          `;
        })
        .join('');

      const expenseRows = expenseEntries
        .slice()
        .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')))
        .map((entry) => {
          const amount = Number(entry.amount_charged ?? 0) || 0;
          const person = normalizeFullName(entry.user_name || userName);
          return `
            <tr>
              <td>${escapeHtml(formatDate(entry.date || ''))}</td>
              <td>${escapeHtml(person)}</td>
              <td>${escapeHtml(entry.description || '')}</td>
              <td class="num">${formatCurrency(amount)}</td>
            </tr>
          `;
        })
        .join('');

      return `
        <div class="invoice-matter">
          <div class="matter-header">${escapeHtml(matter)}</div>
          <div class="invoice-subsection-title">Hours</div>
          <table class="invoice-table">
            ${feeTableHeader}
            <tbody>${feeRows || '<tr><td colspan="5" class="invoice-empty">No hour entries.</td></tr>'}</tbody>
          </table>
          ${
            expenseEntries.length
              ? `
                <div class="invoice-subsection-title">Expenses</div>
                <table class="invoice-table">
                  ${expenseTableHeader}
                  <tbody>${expenseRows}</tbody>
                </table>
              `
              : ''
          }
        </div>
      `;
    })
    .join('');

  invoiceEl.innerHTML = `
    <div class="invoice-header">
      <div class="invoice-logo-box">
        ${buildLogoMarkup(logoPath)}
      </div>
      <div class="invoice-contact">
        ${contactLines.join('')}
      </div>
      <div class="invoice-summary">
        ${summaryLines}
      </div>
    </div>

    <div class="invoice-meta-grid">
      <div>
        <div class="invoice-section-title">Invoice submitted to</div>
        <div>${escapeHtml(clientName)}</div>
      </div>
      <div>
        <div class="invoice-section-title">Service period</div>
        <div>${escapeHtml(servicePeriod)}</div>
      </div>
    </div>

    ${tables || '<p class="empty">No billable entries found.</p>'}
  `;
};

const renderQuerySelect = (queries) => {
  querySelect.innerHTML = queries
    .map((query) => `<option value="${escapeHtml(query)}">${escapeHtml(query)}</option>`)
    .join('');
};

const fetchJson = async (url) => {
  const response = await fetch(url);
  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({}));
    throw new Error(errorPayload.error || `Request failed: ${url}`);
  }
  return response.json();
};

const loadInputsIntoForm = () => {
  userInput.value = inputsJson.user_name || inputsJson.user || '';
  lawFirmPhoneInput.value = formatPhoneNumber(inputsJson.law_firm_phone || '');
  lawFirmWebsiteInput.value = inputsJson.law_firm_website || '';
  lawFirmLogoPathInput.value = inputsJson.law_firm_logo_path || '';
  userAddressLine1Input.value = inputsJson.user_address_line1 || '';
  userAddressLine2Input.value = inputsJson.user_address_line2 || '';
  userCityInput.value = inputsJson.user_city || '';
  userStateInput.value = inputsJson.user_state || '';
  userPostalCodeInput.value = inputsJson.user_postal_code || '';
  userCountryInput.value = inputsJson.user_country || '';
};

const saveInputs = async () => {
  const payload = {
    user: userInput.value.trim(),
    law_firm_phone: lawFirmPhoneInput.value.trim(),
    law_firm_website: lawFirmWebsiteInput.value.trim(),
    law_firm_logo_path: lawFirmLogoPathInput.value.trim(),
    user_address_line1: userAddressLine1Input.value.trim(),
    user_address_line2: userAddressLine2Input.value.trim(),
    user_city: userCityInput.value.trim(),
    user_state: userStateInput.value.trim(),
    user_postal_code: userPostalCodeInput.value.trim(),
    user_country: userCountryInput.value.trim(),
  };

  const response = await fetch('/api/inputs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({}));
    throw new Error(errorPayload.error || 'Failed to save inputs.json.');
  }

  inputsJson = await response.json();
};

const loadAll = async (query) => {
  selectedQuery = query;
  document.title = query;
  const [time, queries, inputs] = await Promise.all([
    fetchJson(`/api/time-entries?query=${encodeURIComponent(query)}`),
    fetchJson('/api/query-json'),
    fetchJson('/api/inputs').catch(() => ({})),
  ]);

  timeEntries = time;
  queryJson = queries;
  inputsJson = inputs || {};
  loadInputsIntoForm();
  renderInvoice();
  updateStatus(timeEntries.__loaded_from ? `Loaded ${timeEntries.__loaded_from}` : '');
};

const handleLogoUpload = async (file) => {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      updateStatus('Uploading logo…');
      const dataUrl = reader.result;
      const response = await fetch('/api/logo-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, data_url: dataUrl }),
      });
      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}));
        throw new Error(errorPayload.error || 'Logo upload failed.');
      }
      const result = await response.json();
      lawFirmLogoPathInput.value = result.path || '';
      await saveInputs();
      renderInvoice();
      updateStatus('Logo uploaded.');
    } catch (error) {
      updateStatus(error.message || 'Logo upload failed.', true);
    }
  };
  reader.readAsDataURL(file);
};

const init = async () => {
  try {
    const queries = await fetchJson('/api/queries');
    const queryNames = queries.queries || [];
    if (!queryNames.length) {
      updateStatus('No queries found in query.json.', true);
      return;
    }
    renderQuerySelect(queryNames);
    const initialQuery = getQueryFromUrl() || queryNames[0];
    querySelect.value = initialQuery;
    setQueryInUrl(initialQuery);
    await loadAll(initialQuery);
  } catch (error) {
    updateStatus(error.message || 'Failed to load bill.', true);
  }
};

querySelect.addEventListener('change', async (event) => {
  const query = event.target.value;
  setQueryInUrl(query);
  await loadAll(query);
});

reloadButton.addEventListener('click', async () => {
  if (!selectedQuery) return;
  await loadAll(selectedQuery);
});

generateButton.addEventListener('click', async () => {
  try {
    updateStatus('Saving settings…');
    await saveInputs();
    renderInvoice();
    if (!selectedQuery) {
      updateStatus('Select a query first.', true);
      return;
    }

    updateStatus('Generating PDF…');
    const response = await fetch(
      `/api/generate-pdf?query=${encodeURIComponent(selectedQuery)}`
    );
    if (!response.ok) {
      const errorPayload = await response.json().catch(() => ({}));
      throw new Error(errorPayload.error || 'Unable to generate PDF.');
    }

    const blob = await response.blob();
    const contentDisposition = response.headers.get('content-disposition') || '';
    const match = contentDisposition.match(/filename="([^"]+)"/i);
    const filename = match?.[1] || `${selectedQuery}.pdf`;

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    updateStatus('PDF downloaded.');
  } catch (error) {
    updateStatus(error.message || 'Unable to generate PDF.', true);
  }
});

logoFileInput.addEventListener('change', async (event) => {
  const file = event.target.files && event.target.files[0];
  await handleLogoUpload(file);
  event.target.value = '';
});

[
  userInput,
  lawFirmPhoneInput,
  lawFirmWebsiteInput,
  lawFirmLogoPathInput,
  userAddressLine1Input,
  userAddressLine2Input,
  userCityInput,
  userStateInput,
  userPostalCodeInput,
  userCountryInput,
].forEach((input) => {
  input.addEventListener('input', () => {
    renderInvoice();
  });
});

lawFirmPhoneInput.addEventListener('blur', () => {
  lawFirmPhoneInput.value = formatPhoneNumber(lawFirmPhoneInput.value);
  renderInvoice();
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
