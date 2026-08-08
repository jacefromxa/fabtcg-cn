const BATCH_LABELS = {
  heroes: '英雄',
  't1-generic': '通用',
  't2-equipment': '装备',
  't3-assassin': '刺客',
  't3-bard-merchant': '吟游诗人 / 商人',
  't3-brute': '蛮将',
  't3-chaos': '混沌',
  't3-draconic': '龙裔',
  't3-earth-ice-elem': '大地 / 冰 / 元素',
  't3-guardian': '守护者',
  't3-illusionist': '幻术师',
  't3-light': '光',
  't3-lightning': '闪电',
  't3-mechanologist': '机械师',
  't3-mystic': '秘法',
  't3-ninja': '忍者',
  't3-pirate': '海盗',
  't3-ranger': '游侠',
  't3-revered': '崇敬',
  't3-reviled': '憎恶',
  't3-runeblade': '符文剑士',
  't3-shadow': '暗影',
  't3-warrior': '战士',
  't3-wizard': '法师',
  't4-remaining': '其他',
};

const state = {
  batches: [],
  batch: '',
  query: '',
  page: 1,
  pageSize: 50,
  rows: [],
  rowsById: new Map(),
  edits: new Map(),
  total: 0,
  totalPages: 0,
};

const ui = {
  batchTabs: document.querySelector('#batch-tabs'),
  batchTitle: document.querySelector('#batch-title'),
  rowCount: document.querySelector('#row-count'),
  searchInput: document.querySelector('#search-input'),
  connectionStatus: document.querySelector('#connection-status'),
  refreshButton: document.querySelector('#refresh-button'),
  tableBody: document.querySelector('#card-table-body'),
  emptyState: document.querySelector('#empty-state'),
  previousPage: document.querySelector('#previous-page'),
  nextPage: document.querySelector('#next-page'),
  pageSummary: document.querySelector('#page-summary'),
  editSummary: document.querySelector('#edit-summary'),
  submitButton: document.querySelector('#submit-button'),
  message: document.querySelector('#message'),
  preview: document.querySelector('#card-preview'),
  previewTitle: document.querySelector('#preview-title'),
  previewImage: document.querySelector('#preview-image'),
  previewFallback: document.querySelector('#preview-fallback'),
  previewLink: document.querySelector('#preview-link'),
};

let searchTimer = null;

function batchLabel(batch) {
  if (BATCH_LABELS[batch]) return BATCH_LABELS[batch];
  return batch.replace(/^t\d-/, '').replace(/-/g, ' ');
}

function createElement(tagName, className, text) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

async function requestJson(url, options) {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error || `请求失败（${response.status}）`);
    error.details = body.details || [];
    throw error;
  }
  return body;
}

function setMessage(message, isError = false) {
  ui.message.textContent = message || '';
  ui.message.classList.toggle('error', isError);
}

function renderTabs() {
  ui.batchTabs.replaceChildren();
  for (const batch of state.batches) {
    const button = createElement('button', 'batch-tab', batchLabel(batch.name));
    button.type = 'button';
    button.role = 'tab';
    button.setAttribute('aria-selected', String(batch.name === state.batch));
    button.title = batch.name;
    button.addEventListener('click', () => {
      if (state.batch === batch.name) return;
      state.batch = batch.name;
      state.page = 1;
      renderTabs();
      loadRows();
    });
    ui.batchTabs.appendChild(button);
  }
}

function variantLabel(variant) {
  return variant.pitch === null || variant.pitch === undefined ? '基础' : `Pitch ${variant.pitch}`;
}

function renderVariantDetails(row) {
  if (row.variants.length < 2) return null;
  const details = createElement('details', 'variant-details');
  details.appendChild(createElement('summary', '', `版本信息（${row.variants.length} 个 pitch）`));
  for (const variant of row.variants) {
    const item = createElement('div', 'variant-item');
    const stats = [
      `${variantLabel(variant)}`,
      `费用 ${variant.cost ?? '—'}`,
      `力量 ${variant.power ?? '—'}`,
      `防御 ${variant.defense ?? '—'}`,
    ].join(' · ');
    item.appendChild(createElement('div', 'variant-stats', stats));
    item.appendChild(createElement('div', 'variant-text', variant.text_zh || '（无正文）'));
    details.appendChild(item);
  }
  return details;
}

function renderCurrentName(row) {
  const cell = createElement('div', 'current-name');
  if (row.current_name !== null) {
    cell.appendChild(createElement('div', '', row.current_name || '（未填写）'));
  } else {
    cell.appendChild(createElement('div', 'mixed-warning', '⚠ 不同 pitch 的当前译名不一致'));
    const names = createElement('div', 'variant-names');
    for (const variant of row.variants) {
      const name = row.current_names[variant.key] || '（未填写）';
      names.appendChild(createElement('div', '', `${variantLabel(variant)}：${name}`));
    }
    cell.appendChild(names);
  }
  const details = renderVariantDetails(row);
  if (details) cell.appendChild(details);
  return cell;
}

function previewPosition(event) {
  const gap = 18;
  const width = 232;
  const height = Math.min(620, window.innerHeight - 24);
  let left = event.clientX + gap;
  let top = event.clientY + gap;
  if (left + width > window.innerWidth - 12) left = event.clientX - width - gap;
  if (top + height > window.innerHeight - 12) top = window.innerHeight - height - 12;
  ui.preview.style.left = `${Math.max(12, left)}px`;
  ui.preview.style.top = `${Math.max(12, top)}px`;
}

function showPreview(row, event, anchor) {
  const rect = anchor.getBoundingClientRect();
  const pointerEvent = event && event.clientX ? event : {
    clientX: rect.left + rect.width / 2,
    clientY: rect.top + rect.height / 2,
  };
  ui.previewTitle.textContent = row.name_en;
  ui.previewImage.alt = row.name_en;
  ui.previewFallback.hidden = Boolean(row.image_url);
  ui.previewImage.hidden = !row.image_url;
  ui.previewImage.src = row.image_url || '';
  ui.previewLink.href = row.source || '#';
  ui.previewLink.hidden = !row.source;
  ui.preview.hidden = false;
  previewPosition(pointerEvent);
}

function hidePreview() {
  ui.preview.hidden = true;
}

function renderCardName(row) {
  const cell = createElement('div');
  const link = createElement('a', 'card-name-link', row.name_en);
  link.href = row.source || '#';
  link.target = '_blank';
  link.rel = 'noreferrer';
  if (!row.source) link.addEventListener('click', (event) => event.preventDefault());
  link.addEventListener('mouseenter', (event) => showPreview(row, event, link));
  link.addEventListener('mousemove', (event) => previewPosition(event));
  link.addEventListener('mouseleave', hidePreview);
  link.addEventListener('focus', () => showPreview(row, null, link));
  link.addEventListener('blur', hidePreview);
  cell.appendChild(link);
  cell.appendChild(createElement('span', 'card-id', row.card_id));
  return cell;
}

function renderEditInput(row) {
  const input = createElement('input', 'name-input');
  input.type = 'text';
  input.value = state.edits.get(row.card_id) || '';
  input.placeholder = row.current_name || '输入统一译名';
  if (state.edits.has(row.card_id)) input.classList.add('edited');
  input.addEventListener('input', () => {
    const value = input.value.trim();
    if (!value || (row.current_name !== null && value === row.current_name)) {
      state.edits.delete(row.card_id);
      input.classList.remove('edited');
    } else {
      state.edits.set(row.card_id, value);
      input.classList.add('edited');
    }
    updateEditSummary();
  });
  return input;
}

function renderRows() {
  ui.tableBody.replaceChildren();
  ui.emptyState.hidden = state.rows.length !== 0;
  for (const row of state.rows) {
    state.rowsById.set(row.card_id, row);
    const tr = document.createElement('tr');
    const nameCell = document.createElement('td');
    nameCell.appendChild(renderCardName(row));
    const currentCell = document.createElement('td');
    currentCell.appendChild(renderCurrentName(row));
    const editCell = document.createElement('td');
    editCell.appendChild(renderEditInput(row));
    tr.append(nameCell, currentCell, editCell);
    ui.tableBody.appendChild(tr);
  }
}

function renderPagination() {
  ui.pageSummary.textContent = state.totalPages ? `第 ${state.page} / ${state.totalPages} 页` : '第 — 页';
  ui.previousPage.disabled = state.page <= 1;
  ui.nextPage.disabled = state.totalPages === 0 || state.page >= state.totalPages;
}

function updateEditSummary() {
  const count = state.edits.size;
  ui.editSummary.textContent = count ? `已修改 ${count} 项` : '尚未修改';
  ui.submitButton.disabled = count === 0;
}

async function loadRows() {
  if (!state.batch) return;
  ui.batchTitle.textContent = batchLabel(state.batch);
  ui.rowCount.textContent = '加载中…';
  try {
    const params = new URLSearchParams({
      batch: state.batch,
      q: state.query,
      page: String(state.page),
      page_size: String(state.pageSize),
    });
    const result = await requestJson(`/api/cards?${params}`);
    state.rows = result.items;
    state.total = result.total;
    state.page = result.page;
    state.totalPages = result.totalPages;
    ui.rowCount.textContent = `共 ${result.total} 张`;
    renderRows();
    renderPagination();
    ui.connectionStatus.textContent = '已连接';
    ui.connectionStatus.classList.remove('error');
  } catch (error) {
    ui.connectionStatus.textContent = '连接失败';
    ui.connectionStatus.classList.add('error');
    setMessage(error.message, true);
  }
}

function buildChanges() {
  return [...state.edits.entries()]
    .map(([cardId, newName]) => {
      const row = state.rowsById.get(cardId);
      if (!row) return null;
      return {
        card_id: row.card_id,
        batch: row.batch,
        name_en: row.name_en,
        new_name_zh: newName,
        variants: row.variants.map((variant) => ({
          key: variant.key,
          current_name_zh: variant.name_zh,
        })),
      };
    })
    .filter(Boolean);
}

async function submitChanges() {
  const changes = buildChanges();
  if (!changes.length) return;
  ui.submitButton.disabled = true;
  setMessage('正在写入待处理队列…');
  try {
    const result = await requestJson('/api/submissions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ changes }),
    });
    for (const change of changes) state.edits.delete(change.card_id);
    updateEditSummary();
    renderRows();
    setMessage(`已提交 ${result.changeCount} 项：${result.fileName}`);
  } catch (error) {
    ui.submitButton.disabled = state.edits.size === 0;
    setMessage(error.message, true);
  }
}

ui.searchInput.addEventListener('input', () => {
  state.query = ui.searchInput.value;
  state.page = 1;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(loadRows, 180);
});
ui.refreshButton.addEventListener('click', loadRows);
ui.previousPage.addEventListener('click', () => {
  if (state.page > 1) { state.page -= 1; loadRows(); }
});
ui.nextPage.addEventListener('click', () => {
  if (state.page < state.totalPages) { state.page += 1; loadRows(); }
});
ui.submitButton.addEventListener('click', submitChanges);
ui.previewImage.addEventListener('error', () => {
  ui.previewImage.hidden = true;
  ui.previewFallback.hidden = false;
});
ui.preview.addEventListener('mouseleave', hidePreview);

async function init() {
  try {
    state.batches = await requestJson('/api/batches');
    state.batch = state.batches[0]?.name || '';
    renderTabs();
    await loadRows();
    if (!state.batch) setMessage('没有可用翻译批次。', true);
  } catch (error) {
    ui.connectionStatus.textContent = '连接失败';
    setMessage(error.message, true);
  }
}

init();
