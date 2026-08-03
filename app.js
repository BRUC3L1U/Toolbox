/* ===== TAB NAVIGATION ===== */
const TAB_IDS = ['energy', 'counter', 'price', 'timer'];
const ACTIVE_TAB_KEY = 'toolbox_active_tab';

// Roving tabindex: only the active tab is in the tab order (tabindex="0"),
// the rest are tabindex="-1" but still reachable via arrow keys.
function setActiveTab(tabId) {
  if (!TAB_IDS.includes(tabId)) tabId = 'energy';
  document.querySelectorAll('.tool-page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => {
    b.setAttribute('aria-selected', 'false');
    b.setAttribute('tabindex', '-1');
  });
  const page = document.getElementById('page-' + tabId);
  if (page) page.classList.add('active');
  const tab = document.getElementById('tab-' + tabId);
  if (tab) {
    tab.setAttribute('aria-selected', 'true');
    tab.setAttribute('tabindex', '0');
  }
}

function switchTab(tabId) {
  if (!TAB_IDS.includes(tabId)) return;
  setActiveTab(tabId);
  const tab = document.getElementById('tab-' + tabId);
  if (tab) tab.focus({ preventScroll: true });
  try { localStorage.setItem(ACTIVE_TAB_KEY, tabId); } catch (e) {}
  if (location.hash !== '#' + tabId) {
    history.replaceState(null, '', '#' + tabId);
  }
}

function restoreTab() {
  const hash = location.hash.replace('#', '');
  if (TAB_IDS.includes(hash)) return hash;
  try {
    const saved = localStorage.getItem(ACTIVE_TAB_KEY);
    if (saved && TAB_IDS.includes(saved)) return saved;
  } catch (e) {}
  return 'energy';
}

// WAI-ARIA tablist keyboard interaction: arrow keys move between tabs,
// Home/End jump to the first/last tab. Click is delegated so no inline
// onclick handlers are needed on the buttons.
function initTabKeyboard() {
  const tablist = document.getElementById('main-tablist');
  if (!tablist) return;
  tablist.addEventListener('click', function(e) {
    const btn = e.target.closest('.tab-btn');
    if (!btn) return;
    switchTab(btn.id.replace('tab-', ''));
  });
  tablist.addEventListener('keydown', function(e) {
    const btn = e.target.closest('.tab-btn');
    if (!btn) return;
    const currentIdx = TAB_IDS.indexOf(btn.id.replace('tab-', ''));
    if (currentIdx === -1) return;
    let nextIdx = null;
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        nextIdx = (currentIdx + 1) % TAB_IDS.length;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        nextIdx = (currentIdx - 1 + TAB_IDS.length) % TAB_IDS.length;
        break;
      case 'Home':
        nextIdx = 0;
        break;
      case 'End':
        nextIdx = TAB_IDS.length - 1;
        break;
    }
    if (nextIdx !== null) {
      e.preventDefault();
      switchTab(TAB_IDS[nextIdx]);
    }
  });
}

/* ===== ENERGY CONVERTER ===== */
function convertKjToKcal(kj) { return kj / 4.184; }
function convertKcalToKj(kcal) { return kcal * 4.184; }

function initEnergyConverter() {
  const inputKj = document.getElementById('input-kj');
  const inputKcal = document.getElementById('input-kcal');

  function bind(source, target, convert) {
    source.addEventListener('input', function() {
      const val = parseFloat(this.value);
      if (isNaN(val) || this.value.trim() === '') {
        this.classList.remove('error');
        target.value = '';
        return;
      }
      if (val < 0) {
        // Negative energy has no physical meaning — reject and flag the field.
        this.classList.add('error');
        target.value = '';
        return;
      }
      this.classList.remove('error');
      target.value = Math.round(convert(val));
    });
  }

  bind(inputKj, inputKcal, convertKjToKcal);
  bind(inputKcal, inputKj, convertKcalToKj);
}

/* ===== COUNTER ===== */
const COUNTER_KEY = 'toolbox_counter';
const COUNTER = {
  LONG_PRESS_DELAY: 450,      // ms before auto-repeat kicks in
  LONG_PRESS_INTERVAL: 90,    // ms between auto-repeat ticks
  ACCEL_TICKS: 8,             // double the step every N ticks
  MAX_STEP: 100               // cap on the auto-repeat step
};
let counterState = { value: 0 };
let longPressTimer = null;
let longPressInterval = null;
let longPressStep = 1;

function loadCounter() {
  try {
    const raw = localStorage.getItem(COUNTER_KEY);
    if (raw !== null) counterState.value = parseInt(raw, 10) || 0;
  } catch (e) {}
  document.getElementById('counter-value').textContent = counterState.value;
}

function updateCounter(delta) {
  counterState.value += delta;
  document.getElementById('counter-value').textContent = counterState.value;
  try { localStorage.setItem(COUNTER_KEY, String(counterState.value)); } catch (e) {}
}

function resetCounter() {
  counterState.value = 0;
  document.getElementById('counter-value').textContent = 0;
  try { localStorage.setItem(COUNTER_KEY, '0'); } catch (e) {}
}

function initCounter() {
  loadCounter();
  const btnPlus = document.getElementById('btn-plus');
  const btnMinus = document.getElementById('btn-minus');
  const btnReset = document.getElementById('btn-reset');

  function doPlus() { updateCounter(longPressStep); }
  function doMinus() { updateCounter(-longPressStep); }

  function startLongPress(actionFn) {
    // Accelerate: step grows and interval shrinks the longer you hold.
    longPressStep = 1;
    longPressTimer = setTimeout(() => {
      let ticks = 0;
      longPressInterval = setInterval(() => {
        actionFn();
        ticks++;
        if (ticks % COUNTER.ACCEL_TICKS === 0) longPressStep = Math.min(longPressStep * 2, COUNTER.MAX_STEP);
      }, COUNTER.LONG_PRESS_INTERVAL);
    }, COUNTER.LONG_PRESS_DELAY);
  }

  function stopLongPress() {
    clearTimeout(longPressTimer);
    clearInterval(longPressInterval);
    longPressTimer = null;
    longPressInterval = null;
    longPressStep = 1;
  }

  btnPlus.addEventListener('pointerdown', e => { e.preventDefault(); doPlus(); startLongPress(doPlus); });
  btnPlus.addEventListener('pointerup', stopLongPress);
  btnPlus.addEventListener('pointerleave', stopLongPress);
  btnPlus.addEventListener('pointercancel', stopLongPress);

  btnMinus.addEventListener('pointerdown', e => { e.preventDefault(); doMinus(); startLongPress(doMinus); });
  btnMinus.addEventListener('pointerup', stopLongPress);
  btnMinus.addEventListener('pointerleave', stopLongPress);
  btnMinus.addEventListener('pointercancel', stopLongPress);

  btnReset.addEventListener('click', resetCounter);

  // Keyboard shortcuts (only active while the counter tab is visible and
  // the user isn't typing in some other control).
  document.addEventListener('keydown', function(e) {
    const counterPage = document.getElementById('page-counter');
    if (!counterPage || !counterPage.classList.contains('active')) return;
    // Ignore shortcuts when the user is interacting with a form control
    // (including buttons) so Space / +/- don't trigger both the control
    // and the shortcut at once.
    if (e.target.closest('input, textarea, select, button, [contenteditable="true"]')) return;
    switch (e.key) {
      case '+':
      case 'ArrowUp':
        e.preventDefault();
        updateCounter(1);
        break;
      case '-':
      case 'ArrowDown':
        e.preventDefault();
        updateCounter(-1);
        break;
      case ' ':
        e.preventDefault();
        updateCounter(1);
        break;
      case 'r':
      case 'R':
        e.preventDefault();
        resetCounter();
        break;
    }
  });
}

/* ===== PRICE CALCULATOR ===== */
const STORAGE_VERSION = 1;
let groups = []; // [{ id, name, items: [...] }]
let editingId = null;
let editingGroupId = null;

function calcUnitPrice(item) {
  const totalWeight = item.unitWeight * item.packSize * item.packCount;
  if (totalWeight <= 0) return null;
  return item.totalPrice / totalWeight;
}

const PRICE_EPSILON = 1e-9;

// Briefly flag an input as invalid so the user sees *why* nothing happened.
function flagInputError(el) {
  if (!el) return;
  el.classList.add('error');
  clearTimeout(el._errorTimer);
  el._errorTimer = setTimeout(() => el.classList.remove('error'), 2000);
}

// Compute { id, up } for every item in one pass so downstream code
// (cheapest detection, display, summary) can reuse the results.
function computeUnitPrices(items) {
  return items.map(item => ({ id: item.id, up: calcUnitPrice(item) }));
}

function findCheapestInGroup(unitPrices) {
  const priced = unitPrices.filter(w => w.up !== null && w.up > 0);
  if (priced.length === 0) return [];
  const minPrice = Math.min(...priced.map(w => w.up));
  return priced.filter(w => Math.abs(w.up - minPrice) < PRICE_EPSILON).map(w => w.id);
}

function saveGroups() {
  try {
    localStorage.setItem('toolbox_price_groups', JSON.stringify({ v: STORAGE_VERSION, groups }));
  } catch (e) {}
}

function loadGroups() {
  try {
    const raw = localStorage.getItem('toolbox_price_groups');
    if (!raw) return;
    const parsed = JSON.parse(raw);
    // Version guard: reset on unknown / legacy schema.
    if (parsed.v !== STORAGE_VERSION) {
      groups = [];
      return;
    }
    if (parsed.groups && Array.isArray(parsed.groups)) {
      groups = parsed.groups;
    }
  } catch (e) {
    groups = [];
  }
}

function addGroup(name) {
  groups.push({ id: crypto.randomUUID(), name, items: [] });
  saveGroups();
  renderPriceList();
}

function deleteGroup(groupId) {
  const group = groups.find(g => g.id === groupId);
  if (!group) return;
  const itemCount = group.items.length;
  const detail = itemCount > 0 ? `（含 ${itemCount} 件商品）` : '';
  if (!confirm(`确定要删除对比组「${group.name || '未命名组'}」${detail}吗？此操作不可撤销。`)) return;
  groups = groups.filter(g => g.id !== groupId);
  // If the item being edited lived in this group, bail out of edit mode.
  if (editingGroupId === groupId) {
    editingId = null;
    editingGroupId = null;
  }
  saveGroups();
  renderPriceList();
}

function addItemToGroup(groupId, formData) {
  const group = groups.find(g => g.id === groupId);
  if (!group) return;
  const item = {
    id: crypto.randomUUID(),
    name: formData.name || ('商品 ' + (group.items.length + 1)),
    unitWeight: parseFloat(formData.unitWeight),
    packSize: parseInt(formData.packSize) || 1,
    packCount: parseInt(formData.packCount) || 1,
    totalPrice: parseFloat(formData.totalPrice)
  };
  group.items.push(item);
  saveGroups();
  renderGroup(group);
}

function deleteItemFromGroup(groupId, itemId) {
  const group = groups.find(g => g.id === groupId);
  if (!group) return;
  group.items = group.items.filter(i => i.id !== itemId);
  if (editingGroupId === groupId && editingId === itemId) {
    editingId = null;
    editingGroupId = null;
  }
  saveGroups();
  renderGroup(group);
}

function startEditItem(groupId, itemId) {
  editingGroupId = groupId;
  editingId = itemId;
  const group = groups.find(g => g.id === groupId);
  if (group) renderGroup(group);
}

function cancelEdit() {
  const prevGroupId = editingGroupId;
  editingId = null;
  editingGroupId = null;
  if (prevGroupId != null) {
    const group = groups.find(g => g.id === prevGroupId);
    if (group) renderGroup(group);
  }
}

function saveEditItem(form, groupId, itemId) {
  const nameEl = form.querySelector('.edit-name');
  const uwEl = form.querySelector('.edit-unit-weight');
  const psEl = form.querySelector('.edit-pack-size');
  const pcEl = form.querySelector('.edit-pack-count');
  const tpEl = form.querySelector('.edit-total-price');

  const unitWeight = parseFloat(uwEl.value);
  const totalPrice = parseFloat(tpEl.value);
  let invalid = false;
  if (isNaN(unitWeight) || unitWeight <= 0) { flagInputError(uwEl); invalid = true; }
  if (isNaN(totalPrice) || totalPrice <= 0) { flagInputError(tpEl); invalid = true; }
  if (invalid) return;

  const group = groups.find(g => g.id === groupId);
  if (!group) return;
  const item = group.items.find(i => i.id === itemId);
  if (!item) return;
  item.name = nameEl.value.trim() || item.name;
  item.unitWeight = unitWeight;
  item.packSize = parseInt(psEl.value) || 1;
  item.packCount = parseInt(pcEl.value) || 1;
  item.totalPrice = totalPrice;

  editingId = null;
  editingGroupId = null;
  saveGroups();
  renderGroup(group);
}

// Build the summary + items HTML for a single group. Shared by the full
// list render and the per-group partial update so they never diverge.
function renderGroupContent(group) {
  const unitPrices = computeUnitPrices(group.items);
  const cheapestIds = findCheapestInGroup(unitPrices);
  const upById = new Map(unitPrices.map(w => [w.id, w.up]));

  const itemsHtml = group.items.length === 0
    ? '<div class="group-empty">该组暂无商品，请在下方表单中添加</div>'
    : group.items.map(item => {
        const up = upById.get(item.id);
        const isCheapest = cheapestIds.includes(item.id);
        const totalWeight = item.unitWeight * item.packSize * item.packCount;
        const isEditing = editingId === item.id && editingGroupId === group.id;

        let cardClass = 'item-card';
        if (isCheapest && group.items.length > 1) cardClass += ' cheapest';
        const cheapestBadge = isCheapest && group.items.length > 1 ? '<span class="item-cheapest-badge">最划算 ✓</span>' : '';

        let body = '';
        if (isEditing) {
          body = `<div class="item-card-inner">
              <div class="item-info">
                <div class="item-name">${escHtml(item.name)}${cheapestBadge}</div>
                <div class="item-spec">${item.unitWeight}g × ${item.packSize}件 × ${item.packCount}套</div>
              </div>
            </div>
            <form class="item-edit-form" data-group-id="${group.id}" data-item-id="${item.id}">
              <div class="form-field full-width">
                <label>商品名称</label>
                <input class="input edit-name" type="text" value="${escHtml(item.name)}" aria-label="商品名称">
              </div>
              <div class="form-field">
                <label>单品重量 (g)</label>
                <input class="input edit-unit-weight" type="number" min="0.01" step="0.01" value="${item.unitWeight}" required aria-label="单品重量，单位克">
              </div>
              <div class="form-field">
                <label>套装内数量</label>
                <input class="input edit-pack-size" type="number" min="1" step="1" value="${item.packSize}" aria-label="套装内数量">
              </div>
              <div class="form-field">
                <label>套装数量</label>
                <input class="input edit-pack-count" type="number" min="1" step="1" value="${item.packCount}" aria-label="套装数量">
              </div>
              <div class="form-field">
                <label>总价 (元)</label>
                <input class="input edit-total-price" type="number" min="0.01" step="0.01" value="${item.totalPrice}" required aria-label="总价，单位元">
              </div>
              <div class="item-edit-actions">
                <button type="button" class="btn-ghost" data-action="cancel-edit">取消</button>
                <button type="submit" class="btn-primary" style="font-size:var(--text-sm);padding:var(--space-1) var(--space-4)">保存</button>
              </div>
            </form>`;
        } else {
          body = `<div class="item-card-inner">
              <div class="item-info">
                <div class="item-name">${escHtml(item.name)}${cheapestBadge}</div>
                <div class="item-spec">${item.unitWeight}g × ${item.packSize}件 × ${item.packCount}套</div>
              </div>
              <div class="item-meta">
                <div class="item-total-price">¥${item.totalPrice.toFixed(2)} 元</div>
                <div class="item-total-weight">${totalWeight.toFixed(1)} g</div>
                <div class="item-unit-price">${up !== null ? up.toFixed(4) : '--'} 元/g</div>
                <div class="item-unit-price-100">≈ ${up !== null ? (up * 100).toFixed(2) : '--'} 元/100g</div>
              </div>
            </div>
            <div class="item-actions">
              <button class="btn-ghost" data-action="edit" data-group-id="${group.id}" data-item-id="${item.id}" aria-label="编辑">编辑</button>
              <button class="btn-ghost btn-delete" data-action="delete-item" data-group-id="${group.id}" data-item-id="${item.id}" aria-label="删除">删除</button>
            </div>`;
        }
        return '<div class="' + cardClass + '">' + body + '</div>';
      }).join('');

  const summaryHtml = group.items.length > 0 ? (() => {
    const priced = unitPrices.filter(w => w.up !== null && w.up > 0);
    const prices = group.items.map(i => i.totalPrice);
    const cheapestPrice = priced.length > 0 ? Math.min(...priced.map(w => w.up)) : null;
    const maxPrice = priced.length > 0 ? Math.max(...priced.map(w => w.up)) : null;
    let percentStr = '--';
    if (cheapestPrice !== null && maxPrice !== null && maxPrice > 0) {
      percentStr = ((maxPrice - cheapestPrice) / maxPrice * 100).toFixed(1) + '%';
    }
    return '<div class="group-summary">共 ' + group.items.length + ' 件商品 · 价格区间 ¥' +
      Math.min(...prices).toFixed(2) + ' ~ ¥' + Math.max(...prices).toFixed(2) +
      ' · 最划算比最贵便宜 ' + percentStr + '</div>';
  })() : '';

  return { summaryHtml, itemsHtml };
}

// Re-render just one group in place — preserves the add-form inputs and
// the scroll position of the rest of the page. Falls back to a full
// render if the group's card isn't in the DOM yet.
function renderGroup(group) {
  const card = document.querySelector('.group-card[data-group-id="' + group.id + '"]');
  if (!card) { renderPriceList(); return; }
  const { summaryHtml, itemsHtml } = renderGroupContent(group);

  const oldSummary = card.querySelector(':scope > .group-summary');
  if (oldSummary) oldSummary.remove();
  if (summaryHtml) {
    const header = card.querySelector(':scope > .group-header');
    if (header) header.insertAdjacentHTML('afterend', summaryHtml);
  }

  const itemsDiv = card.querySelector(':scope > .group-items');
  if (itemsDiv) itemsDiv.innerHTML = itemsHtml;
}

function renderPriceList() {
  const list = document.getElementById('price-list');
  const empty = document.getElementById('price-empty');

  if (groups.length === 0) {
    list.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  list.innerHTML = groups.map(group => {
    const { summaryHtml, itemsHtml } = renderGroupContent(group);
    return `<div class="group-card" data-group-id="${group.id}">
      <div class="group-header">
        <h2 class="group-name">${escHtml(group.name) || '未命名组'}</h2>
        <button class="btn-ghost btn-delete" style="font-size:var(--text-xs);padding:var(--space-1) var(--space-3)" data-action="delete-group" data-group-id="${group.id}" aria-label="删除组">删除组</button>
      </div>
      ${summaryHtml}
      <div class="group-items">${itemsHtml}</div>
      <div class="group-add-form">
        <form class="group-add-item-form" data-group-id="${group.id}" novalidate>
          <div class="group-add-row">
            <input class="input" type="text" placeholder="商品名称" data-field="name" aria-label="商品名称" style="min-width:120px">
            <input class="input" type="number" min="0.01" step="0.01" placeholder="单品重量(g) *" data-field="unitWeight" aria-label="单品重量，单位克" style="min-width:100px" required>
            <input class="input" type="number" min="1" step="1" placeholder="件数" data-field="packSize" value="1" aria-label="套装内数量" style="min-width:60px">
            <input class="input" type="number" min="1" step="1" placeholder="套数" data-field="packCount" value="1" aria-label="套装数量" style="min-width:60px">
            <input class="input" type="number" min="0.01" step="0.01" placeholder="总价(元) *" data-field="totalPrice" aria-label="总价，单位元" style="min-width:100px" required>
            <button type="submit" class="btn-primary" style="font-size:var(--text-xs);padding:var(--space-2) var(--space-3);white-space:nowrap">添加</button>
          </div>
        </form>
      </div>
    </div>`;
  }).join('');
}

function handleAddSubmit(form, groupId) {
  const uwEl = form.querySelector('[data-field="unitWeight"]');
  const tpEl = form.querySelector('[data-field="totalPrice"]');
  const unitWeight = parseFloat(uwEl.value);
  const totalPrice = parseFloat(tpEl.value);
  let invalid = false;
  if (isNaN(unitWeight) || unitWeight <= 0) { flagInputError(uwEl); invalid = true; }
  if (isNaN(totalPrice) || totalPrice <= 0) { flagInputError(tpEl); invalid = true; }
  if (invalid) return;
  const formData = {
    name: form.querySelector('[data-field="name"]').value.trim(),
    unitWeight: unitWeight,
    packSize: form.querySelector('[data-field="packSize"]').value,
    packCount: form.querySelector('[data-field="packCount"]').value,
    totalPrice: totalPrice
  };
  addItemToGroup(groupId, formData);
  form.reset();
  form.querySelector('[data-field="packSize"]').value = '1';
  form.querySelector('[data-field="packCount"]').value = '1';
}

function escHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  // innerHTML escapes < > & but NOT quotes — escape them so values are safe
  // inside double-quoted HTML attributes (e.g. value="${escHtml(name)}").
  return div.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function initPriceCalculator() {
  loadGroups();
  renderPriceList();

  const list = document.getElementById('price-list');

  // Single delegated click handler for every action button inside the list.
  list.addEventListener('click', function(e) {
    const btn = e.target.closest('[data-action]');
    if (!btn || !list.contains(btn)) return;
    const action = btn.dataset.action;
    const groupId = btn.dataset.groupId;
    const itemId = btn.dataset.itemId;
    if (action === 'edit') startEditItem(groupId, itemId);
    else if (action === 'delete-item') deleteItemFromGroup(groupId, itemId);
    else if (action === 'cancel-edit') cancelEdit();
    else if (action === 'delete-group') deleteGroup(groupId);
  });

  // Single delegated submit handler for both the add-item and edit-item forms.
  list.addEventListener('submit', function(e) {
    const form = e.target;
    if (!form.matches('form')) return;
    if (form.classList.contains('group-add-item-form')) {
      e.preventDefault();
      handleAddSubmit(form, form.dataset.groupId);
    } else if (form.classList.contains('item-edit-form')) {
      e.preventDefault();
      saveEditItem(form, form.dataset.groupId, form.dataset.itemId);
    }
  });

  const createGroupForm = document.getElementById('create-group-form');
  if (createGroupForm) {
    createGroupForm.addEventListener('submit', function(e) {
      e.preventDefault();
      const nameInput = document.getElementById('new-group-name');
      const name = nameInput.value.trim();
      if (!name) { flagInputError(nameInput); return; }
      addGroup(name);
      nameInput.value = '';
    });
  }
}

/* ===== BOSS TIMER ===== */
function initBossTimer() {
  const originalTitle = document.title;

  function pad(n) { return String(n).padStart(2, '0'); }
  function flash(el) { el.classList.remove('boss-flash'); void el.offsetWidth; el.classList.add('boss-flash'); }
  function fmtDate(ts) {
    return new Date(ts).toLocaleString('zh-CN', {
      month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    }).replace(/\//g, '-');
  }
  function getNext(baseMs, intervalMs) {
    const now = Date.now();
    const elapsed = now - baseMs;
    // Use ceil so that when elapsed is an exact multiple of intervalMs
    // we don't skip ahead an extra cycle.
    let next = baseMs + Math.ceil(elapsed / intervalMs) * intervalMs;
    // If the computed boundary is already in the past (or exactly now),
    // advance to the following interval.
    while (next <= now) next += intervalMs;
    return next;
  }
  function fmtCountdown(totalSecs, hasHours) {
    if (hasHours) {
      const h = Math.floor(totalSecs / 3600);
      const m = Math.floor((totalSecs % 3600) / 60);
      const s = totalSecs % 60;
      return pad(h) + ':' + pad(m) + ':' + pad(s);
    }
    const m = Math.floor(totalSecs / 60);
    const s = totalSecs % 60;
    return pad(m) + ':' + pad(s);
  }

  function onSpawn(cfg) {
    // Distinct spawn pulse so a refresh is obvious even without watching the digits.
    cfg.card.classList.remove('boss-spawned');
    void cfg.card.offsetWidth;
    cfg.card.classList.add('boss-spawned');
  }

  const WORLD = {
    key: 'world', title: '世界首领',
    base: new Date('2023-10-27T22:00:00+08:00').getTime(),
    interval: 12600 * 1000,
    els: { spawn: document.getElementById('w-spawn'), h: document.getElementById('w-h'), m: document.getElementById('w-m'), s: document.getElementById('w-s') },
    card: document.querySelector('.boss-card.world'),
    prev: null, next: 0, hasHours: true, notifiedFor: -1,
  };
  const NORMAL = {
    key: 'normal', title: '巢穴首领',
    base: new Date('2026-03-31T18:45:00+08:00').getTime(),
    interval: 2700 * 1000,
    els: { spawn: document.getElementById('n-spawn'), m: document.getElementById('n-m'), s: document.getElementById('n-s') },
    card: document.querySelector('.boss-card.normal'),
    prev: null, next: 0, hasHours: false, notifiedFor: -1,
  };

  function updateCard(cfg) {
    const now = Date.now();
    if (now >= cfg.next) cfg.next = getNext(cfg.base, cfg.interval);
    // Detect a rollover into the next cycle → fire spawn effects once.
    if (cfg.notifiedFor !== -1 && cfg.next !== cfg.notifiedFor) onSpawn(cfg);
    cfg.notifiedFor = cfg.next;

    cfg.els.spawn.textContent = fmtDate(cfg.next);
    const remaining = Math.max(0, cfg.next - now);
    const totalSecs = Math.floor(remaining / 1000);
    const h = Math.floor(totalSecs / 3600);
    const m = Math.floor((totalSecs % 3600) / 60);
    const s = totalSecs % 60;
    if (cfg.hasHours) {
      if (!cfg.prev || h !== cfg.prev.h) { cfg.els.h.textContent = pad(h); if (cfg.prev) flash(cfg.els.h); }
      if (!cfg.prev || m !== cfg.prev.m) { cfg.els.m.textContent = pad(m); if (cfg.prev) flash(cfg.els.m); }
      if (!cfg.prev || s !== cfg.prev.s) { cfg.els.s.textContent = pad(s); if (cfg.prev) flash(cfg.els.s); }
      cfg.prev = { h, m, s };
    } else {
      const totalM = Math.floor(totalSecs / 60);
      if (!cfg.prev || totalM !== cfg.prev.m) { cfg.els.m.textContent = pad(totalM); if (cfg.prev) flash(cfg.els.m); }
      if (!cfg.prev || s !== cfg.prev.s) { cfg.els.s.textContent = pad(s); if (cfg.prev) flash(cfg.els.s); }
      cfg.prev = { m: totalM, s };
    }

    // Urgency highlight in the final minute before a spawn.
    if (totalSecs > 0 && totalSecs <= 60) cfg.card.classList.add('boss-soon');
    else cfg.card.classList.remove('boss-soon');

    return totalSecs;
  }

  const TICK_MS_VISIBLE = 1000;
  const TICK_MS_HIDDEN = 5000;

  function tick() {
    const ws = updateCard(WORLD);
    const ns = updateCard(NORMAL);
    // Show a countdown in the tab title while the page is in the background.
    if (document.hidden) {
      document.title = '巢穴 ' + fmtCountdown(ns, false) + ' · 世界 ' + fmtCountdown(ws, true) + ' — ' + originalTitle;
    } else if (document.title !== originalTitle) {
      document.title = originalTitle;
    }
  }

  let timerId = null;
  function startTimer() {
    if (timerId) clearInterval(timerId);
    timerId = setInterval(tick, document.hidden ? TICK_MS_HIDDEN : TICK_MS_VISIBLE);
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && document.title !== originalTitle) document.title = originalTitle;
    startTimer();
  });

  tick();
  startTimer();
}

/* ===== INIT ===== */
document.addEventListener('DOMContentLoaded', () => {
  setActiveTab(restoreTab());
  initTabKeyboard();
  window.addEventListener('hashchange', () => {
    const hash = location.hash.replace('#', '');
    if (TAB_IDS.includes(hash)) switchTab(hash);
  });

  initEnergyConverter();
  initCounter();
  initPriceCalculator();
  initBossTimer();
});