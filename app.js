/* ===== TAB NAVIGATION ===== */
const TAB_IDS = ['energy', 'counter', 'price', 'timer'];
const ACTIVE_TAB_KEY = 'toolbox_active_tab';

// Pure helpers are kept separate from DOM wiring so the input and persistence
// contracts can be exercised with Node's built-in test runner.
function parseNonNegativeFiniteNumber(value) {
  const text = value == null ? '' : String(value).trim();
  if (!text) return null;
  const number = Number(text);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function parsePositiveFiniteNumber(value) {
  const number = parseNonNegativeFiniteNumber(value);
  return number !== null && number > 0 ? number : null;
}

function parsePositiveInteger(value) {
  const number = parsePositiveFiniteNumber(value);
  return number !== null && Number.isSafeInteger(number) ? number : null;
}

// Modified keys belong to the browser and OS (Cmd/Ctrl+R reload, Ctrl+'+'
// zoom): claiming them would break those shortcuts and silently reset or
// advance the counter.
function shouldHandleCounterShortcut(counterActive, isTextEntry, isTabControl, hasModifier) {
  return counterActive && !isTextEntry && !isTabControl && !hasModifier;
}

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
    // Modified arrow keys belong to the browser/OS (e.g. Cmd+Left history
    // navigation); only plain keys drive tab navigation.
    if (e.metaKey || e.ctrlKey || e.altKey) return;
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
      // The counter also has document-level arrow shortcuts. Stop this tab
      // navigation event before the newly activated counter can consume it.
      e.stopPropagation();
      switchTab(TAB_IDS[nextIdx]);
    }
  });
}

/* ===== ENERGY CONVERTER ===== */
// Integer output is deliberate: food labels quote whole numbers, so a
// whole-number result reads cleaner (100 kJ → 24 kcal, not 23.92). This is
// also why the inputs keep inputmode="numeric" (no decimal point) — do not
// "fix" either to decimals.
function convertKjToKcal(kj) { return kj / 4.184; }
function convertKcalToKj(kcal) { return kcal * 4.184; }

function initEnergyConverter() {
  const inputKj = document.getElementById('input-kj');
  const inputKcal = document.getElementById('input-kcal');

  function bind(source, target, convert) {
    source.addEventListener('input', function() {
      const raw = this.value.trim();
      if (raw === '') {
        this.classList.remove('error');
        target.value = '';
        return;
      }
      const val = parseNonNegativeFiniteNumber(raw);
      if (val === null) {
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
// A long-press auto-repeat feature (hold +/− to count fast) existed briefly
// and was deliberately removed in favour of plain taps and keyboard
// shortcuts. Do not re-add it.
const COUNTER_KEY = 'toolbox_counter';
let counterState = { value: 0 };

function loadCounter() {
  try {
    const raw = localStorage.getItem(COUNTER_KEY);
    if (raw !== null) {
      const storedValue = Number(raw);
      counterState.value = Number.isSafeInteger(storedValue) ? storedValue : 0;
    }
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
  document.getElementById('btn-plus').addEventListener('click', () => updateCounter(1));
  document.getElementById('btn-minus').addEventListener('click', () => updateCounter(-1));
  document.getElementById('btn-reset').addEventListener('click', resetCounter);

  document.addEventListener('keydown', function(e) {
    const counterPage = document.getElementById('page-counter');
    const counterActive = !!counterPage && counterPage.classList.contains('active');
    const isTextEntry = !!e.target.closest('input, textarea, select, [contenteditable="true"]');
    const isTabControl = !!e.target.closest('[role="tab"], [role="tablist"]');
    const hasModifier = e.metaKey || e.ctrlKey || e.altKey;
    if (!shouldHandleCounterShortcut(counterActive, isTextEntry, isTabControl, hasModifier)) return;
    // A focused button only claims Space (it would activate the button *and*
    // run the shortcut); arrows and R stay live so clicking +/- with the mouse
    // doesn't kill keyboard control.
    const onButton = !!e.target.closest('button');
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
        if (onButton) return;
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
// Storage is localStorage-only by design: no import/export or remote backup.
// Every read is decoded at the boundary, and revisions prevent a stale tab
// from silently replacing a newer snapshot.
const STORAGE_VERSION = 1;
const PRICE_STORAGE_KEY = 'toolbox_price_groups';
const PRICE_STORAGE_LOCK = 'toolbox-price-groups-write';
const PRICE_PRESENCE_PREFIX = 'toolbox_price_tab_';
const PRICE_PRESENCE_TTL_MS = 5000;
let groups = []; // [{ id, name, items: [...] }]
let editingId = null;
let editingGroupId = null;
let editingBaseRevision = null;
let groupsRevision = 0;
let persistedGroupsSnapshot = [];
let priceStatusTimer = null;
let priceTabId = null;
let pricePresenceKey = null;
let pricePresenceTimer = null;
const pendingPriceForms = new WeakSet();

function cloneGroups(value) {
  return JSON.parse(JSON.stringify(value));
}

function isSafeStoredId(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 128 && /^[A-Za-z0-9-]+$/.test(value);
}

function normalizeStoredItem(item) {
  if (!item || typeof item !== 'object' || !isSafeStoredId(item.id)) return null;
  const unitWeight = parsePositiveFiniteNumber(item.unitWeight);
  const packSize = parsePositiveInteger(item.packSize);
  const packCount = parsePositiveInteger(item.packCount);
  const totalPrice = parsePositiveFiniteNumber(item.totalPrice);
  if (unitWeight === null || packSize === null || packCount === null || totalPrice === null) return null;
  return {
    id: item.id,
    name: typeof item.name === 'string' ? item.name : '',
    unitWeight,
    packSize,
    packCount,
    totalPrice,
  };
}

function normalizeStoredGroup(group) {
  if (!group || typeof group !== 'object' || !isSafeStoredId(group.id) || !Array.isArray(group.items)) return null;
  const items = group.items.map(normalizeStoredItem).filter(Boolean);
  return {
    group: {
      id: group.id,
      name: typeof group.name === 'string' ? group.name : '',
      items,
    },
    hadInvalidData: items.length !== group.items.length,
  };
}

function decodeStoredGroups(raw) {
  if (!raw) return { groups: [], revision: 0, hadInvalidData: false };
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || parsed.v !== STORAGE_VERSION || !Array.isArray(parsed.groups)) {
      return { groups: [], revision: 0, hadInvalidData: true };
    }
    const normalized = parsed.groups.map(normalizeStoredGroup);
    const groups = normalized.filter(Boolean).map(result => result.group);
    const revisionValid = parsed.revision == null ||
      (Number.isSafeInteger(parsed.revision) && parsed.revision >= 0);
    return {
      groups,
      revision: revisionValid && parsed.revision != null ? parsed.revision : 0,
      hadInvalidData: !revisionValid || groups.length !== parsed.groups.length ||
        normalized.some(result => result && result.hadInvalidData),
    };
  } catch (e) {
    return { groups: [], revision: 0, hadInvalidData: true };
  }
}

function showPriceStatus(message) {
  const status = document.getElementById('price-storage-status');
  if (!status) return;
  clearTimeout(priceStatusTimer);
  status.textContent = message;
  status.hidden = !message;
  if (message) {
    priceStatusTimer = setTimeout(() => {
      status.hidden = true;
      status.textContent = '';
    }, 6000);
  }
}

function readStoredGroups() {
  try {
    return { ...decodeStoredGroups(localStorage.getItem(PRICE_STORAGE_KEY)), storageError: false };
  } catch (e) {
    return {
      groups: cloneGroups(persistedGroupsSnapshot),
      revision: groupsRevision,
      hadInvalidData: false,
      storageError: true,
    };
  }
}

function applyStoredGroups(state) {
  groups = cloneGroups(state.groups);
  groupsRevision = state.revision;
  persistedGroupsSnapshot = cloneGroups(state.groups);
}

function runWithPriceStorageLock(lockManager, task, fallback) {
  if (lockManager && typeof lockManager.request === 'function') {
    return lockManager.request(PRICE_STORAGE_LOCK, task);
  }
  return fallback ? fallback(task) : Promise.resolve().then(task);
}

// Presence heartbeat for the no-Web-Locks fallback: it is the only signal
// other fallback tabs use to detect this tab, so it only runs where
// navigator.locks is missing (everywhere else it would be pure localStorage
// churn every 2 seconds).
function initPricePresence() {
  if (!pricePresenceKey) {
    priceTabId = uid();
    pricePresenceKey = PRICE_PRESENCE_PREFIX + priceTabId;
  }
  clearInterval(pricePresenceTimer);
  try { localStorage.setItem(pricePresenceKey, String(Date.now())); } catch (e) {}
  pricePresenceTimer = setInterval(() => {
    try { localStorage.setItem(pricePresenceKey, String(Date.now())); } catch (e) {}
  }, 2000);
}

function stopPriceHeartbeat() {
  clearInterval(pricePresenceTimer);
  pricePresenceTimer = null;
  if (pricePresenceKey) {
    try { localStorage.removeItem(pricePresenceKey); } catch (e) {}
  }
}

function hasFreshPricePresence(entries, ownKey, now) {
  return entries.some(([key, value]) => {
    if (!key.startsWith(PRICE_PRESENCE_PREFIX) || key === ownKey) return false;
    const timestamp = Number(value);
    const age = now - timestamp;
    return Number.isFinite(timestamp) && age >= 0 && age < PRICE_PRESENCE_TTL_MS;
  });
}

function hasAnotherPriceTab() {
  initPricePresence();
  try {
    const now = Date.now();
    localStorage.setItem(pricePresenceKey, String(now));
    const entries = [];
    const invalidPresenceKeys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      const value = localStorage.getItem(key);
      entries.push([key, value]);
      if (key.startsWith(PRICE_PRESENCE_PREFIX) && key !== pricePresenceKey) {
        const timestamp = Number(value);
        const age = now - timestamp;
        if (!Number.isFinite(timestamp) || age < 0 || age >= PRICE_PRESENCE_TTL_MS) {
          invalidPresenceKeys.push(key);
        }
      }
    }
    invalidPresenceKeys.forEach(key => localStorage.removeItem(key));
    return hasFreshPricePresence(entries, pricePresenceKey, now);
  } catch (e) {
    return false;
  }
}

async function runFallbackPriceWrite(task) {
  // Give a simultaneously opened tab time to publish its distinct presence key.
  await new Promise(resolve => setTimeout(resolve, 100));
  if (hasAnotherPriceTab()) {
    showPriceStatus('当前浏览器不支持跨标签写入锁；请关闭其他工具箱标签页后重试。');
    return false;
  }
  return task();
}

function withPriceStorageLock(task) {
  const lockManager = typeof navigator !== 'undefined' ? navigator.locks : null;
  return runWithPriceStorageLock(lockManager, task, runFallbackPriceWrite);
}

function hasEditConflict(baseRevision, latestRevision) {
  return baseRevision !== latestRevision;
}

function hasGroupSnapshotConflict(expectedGroup, latestGroup) {
  return !expectedGroup || !latestGroup || JSON.stringify(expectedGroup) !== JSON.stringify(latestGroup);
}

async function runFormSubmissionOnce(form, task) {
  if (pendingPriceForms.has(form)) return false;
  pendingPriceForms.add(form);
  const buttons = Array.from(form.querySelectorAll('button[type="submit"], input[type="submit"]'));
  const disabledStates = buttons.map(button => button.disabled);
  buttons.forEach(button => { button.disabled = true; });
  form.setAttribute('aria-busy', 'true');
  try {
    return await task();
  } finally {
    pendingPriceForms.delete(form);
    buttons.forEach((button, index) => { button.disabled = disabledStates[index]; });
    form.removeAttribute('aria-busy');
  }
}

async function mutateGroups(mutator) {
  return withPriceStorageLock(async () => {
    const latest = readStoredGroups();
    if (!latest.storageError && latest.revision !== groupsRevision) {
      applyStoredGroups(latest);
      editingId = null;
      editingGroupId = null;
      editingBaseRevision = null;
      renderPriceList();
      showPriceStatus('已同步其他标签页的修改。');
    }
    if (mutator() === false) return false;
    return saveGroups();
  });
}

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
  const latest = readStoredGroups();
  if (!latest.storageError && latest.revision !== groupsRevision) {
    applyStoredGroups(latest);
    editingId = null;
    editingGroupId = null;
    editingBaseRevision = null;
    renderPriceList();
    showPriceStatus('检测到其他标签页的新修改，已保留最新数据；请重试刚才的操作。');
    return false;
  }

  const nextRevision = groupsRevision + 1;
  try {
    localStorage.setItem(PRICE_STORAGE_KEY, JSON.stringify({
      v: STORAGE_VERSION,
      revision: nextRevision,
      groups,
    }));
    groupsRevision = nextRevision;
    persistedGroupsSnapshot = cloneGroups(groups);
    return true;
  } catch (e) {
    groups = cloneGroups(persistedGroupsSnapshot);
    renderPriceList();
    showPriceStatus('无法保存到浏览器，本次修改未保留。');
    return false;
  }
}

function loadGroups() {
  const stored = readStoredGroups();
  applyStoredGroups(stored);
  if (stored.storageError) showPriceStatus('浏览器存储不可用，本页修改可能无法保留。');
  else if (stored.hadInvalidData) showPriceStatus('部分本地数据格式无效，已安全忽略。');
}

// crypto.randomUUID() is restricted to secure contexts, so it's missing when
// the page is served over plain HTTP on a LAN address (phone → dev server).
// getRandomValues() has no such restriction, so build a v4 UUID from it.
function uid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40; // version 4
    b[8] = (b[8] & 0x3f) | 0x80; // variant 10
    const hex = Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
    return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) +
           '-' + hex.slice(16, 20) + '-' + hex.slice(20);
  }
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

async function addGroup(name) {
  const saved = await mutateGroups(() => {
    groups.push({ id: uid(), name, items: [] });
  });
  if (saved) renderPriceList();
  return saved;
}

async function deleteGroup(groupId) {
  const group = groups.find(g => g.id === groupId);
  if (!group) { renderPriceList(); return; }
  const confirmedSnapshot = cloneGroups([group])[0];
  const itemCount = group.items.length;
  const detail = itemCount > 0 ? `（含 ${itemCount} 件商品）` : '';
  if (!confirm(`确定要删除对比组「${group.name || '未命名组'}」${detail}吗？此操作不可撤销。`)) return;
  const saved = await withPriceStorageLock(async () => {
    const latest = readStoredGroups();
    if (!latest.storageError) applyStoredGroups(latest);
    const latestGroup = groups.find(g => g.id === groupId);
    if (hasGroupSnapshotConflict(confirmedSnapshot, latestGroup)) {
      renderPriceList();
      showPriceStatus('该对比组在确认期间已发生变化，未执行删除；请检查后重试。');
      return false;
    }
    groups = groups.filter(g => g.id !== groupId);
    if (editingGroupId === groupId) {
      editingId = null;
      editingGroupId = null;
      editingBaseRevision = null;
    }
    return saveGroups();
  });
  if (saved) renderPriceList();
}

async function addItemToGroup(groupId, formData) {
  const saved = await mutateGroups(() => {
    const group = groups.find(g => g.id === groupId);
    if (!group) return false;
    group.items.push({
      id: uid(),
      name: formData.name || ('商品 ' + (group.items.length + 1)),
      unitWeight: formData.unitWeight,
      packSize: formData.packSize,
      packCount: formData.packCount,
      totalPrice: formData.totalPrice,
    });
  });
  if (!saved) { renderPriceList(); return false; }
  const group = groups.find(g => g.id === groupId);
  if (group) renderGroup(group);
  return true;
}

async function deleteItemFromGroup(groupId, itemId) {
  const saved = await mutateGroups(() => {
    const group = groups.find(g => g.id === groupId);
    if (!group || !group.items.some(i => i.id === itemId)) return false;
    group.items = group.items.filter(i => i.id !== itemId);
    if (editingGroupId === groupId && editingId === itemId) {
      editingId = null;
      editingGroupId = null;
      editingBaseRevision = null;
    }
  });
  if (!saved) { renderPriceList(); return; }
  const group = groups.find(g => g.id === groupId);
  if (group) renderGroup(group);
}

function startEditItem(groupId, itemId) {
  const previousGroupId = editingGroupId;
  editingGroupId = groupId;
  editingId = itemId;
  editingBaseRevision = groupsRevision;
  if (previousGroupId && previousGroupId !== groupId) {
    const previousGroup = groups.find(g => g.id === previousGroupId);
    if (previousGroup) renderGroup(previousGroup);
  }
  const group = groups.find(g => g.id === groupId);
  if (group) renderGroup(group);
}

function cancelEdit(groupId, itemId) {
  if (groupId && (editingGroupId !== groupId || editingId !== itemId)) {
    const staleGroup = groups.find(g => g.id === groupId);
    if (staleGroup) renderGroup(staleGroup);
    return;
  }
  const prevGroupId = editingGroupId;
  editingId = null;
  editingGroupId = null;
  editingBaseRevision = null;
  if (prevGroupId != null) {
    const group = groups.find(g => g.id === prevGroupId);
    if (group) renderGroup(group);
  }
}

// Only drop the edit session when it still points at this exact item — a
// save finishing must not clobber an edit the user started elsewhere while
// the write was in flight (the fallback lock path adds a 100ms window).
function clearEditingIfMatches(groupId, itemId) {
  if (editingGroupId !== groupId || editingId !== itemId) return;
  editingId = null;
  editingGroupId = null;
  editingBaseRevision = null;
}

async function saveEditItem(form, groupId, itemId) {
  const fields = parseItemFields(form);
  if (!fields) return;
  const nameEl = form.querySelector('[data-field="name"]');

  const baseRevision = editingBaseRevision;
  const saved = await withPriceStorageLock(async () => {
    const latest = readStoredGroups();
    if (!latest.storageError && hasEditConflict(baseRevision, latest.revision)) {
      applyStoredGroups(latest);
      clearEditingIfMatches(groupId, itemId);
      renderPriceList();
      showPriceStatus('该商品在其他标签页中已发生变化，已保留最新数据；请重新编辑。');
      return false;
    }
    if (!latest.storageError) applyStoredGroups(latest);
    const group = groups.find(g => g.id === groupId);
    const item = group && group.items.find(i => i.id === itemId);
    if (!item) { renderPriceList(); return false; }
    item.name = nameEl.value.trim() || item.name;
    item.unitWeight = fields.unitWeight;
    item.packSize = fields.packSize;
    item.packCount = fields.packCount;
    item.totalPrice = fields.totalPrice;
    clearEditingIfMatches(groupId, itemId);
    return saveGroups();
  });
  if (!saved) return;
  const group = groups.find(g => g.id === groupId);
  if (group) renderGroup(group);
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
            <!-- novalidate routes submits through parseItemFields like the
                 other forms, so errors show the shared .error styling instead
                 of native bubbles in the browser's UI language. -->
            <form class="item-edit-form" data-group-id="${group.id}" data-item-id="${item.id}" novalidate>
              <div class="form-field full-width">
                <label for="edit-name-${item.id}">商品名称</label>
                <input class="input" type="text" id="edit-name-${item.id}" data-field="name" value="${escHtml(item.name)}">
              </div>
              <div class="form-field">
                <label for="edit-weight-${item.id}">单品重量 (g)</label>
                <input class="input" type="number" min="0.01" step="0.01" id="edit-weight-${item.id}" data-field="unitWeight" value="${item.unitWeight}" required>
              </div>
              <div class="form-field">
                <label for="edit-pack-size-${item.id}">套装内数量</label>
                <input class="input" type="number" min="1" step="1" id="edit-pack-size-${item.id}" data-field="packSize" value="${item.packSize}">
              </div>
              <div class="form-field">
                <label for="edit-pack-count-${item.id}">套装数量</label>
                <input class="input" type="number" min="1" step="1" id="edit-pack-count-${item.id}" data-field="packCount" value="${item.packCount}">
              </div>
              <div class="form-field">
                <label for="edit-price-${item.id}">总价 (元)</label>
                <input class="input" type="number" min="0.01" step="0.01" id="edit-price-${item.id}" data-field="totalPrice" value="${item.totalPrice}" required>
              </div>
              <div class="item-edit-actions">
                <button type="button" class="btn-ghost" data-action="cancel-edit" data-group-id="${group.id}" data-item-id="${item.id}">取消</button>
                <button type="submit" class="btn-primary">保存</button>
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
        <button class="btn-ghost btn-delete" data-action="delete-group" data-group-id="${group.id}" aria-label="删除组">删除组</button>
      </div>
      ${summaryHtml}
      <div class="group-items">${itemsHtml}</div>
      <div class="group-add-form">
        <form class="group-add-item-form" data-group-id="${group.id}" novalidate>
          <div class="group-add-row">
            <input class="input" type="text" placeholder="商品名称" data-field="name" aria-label="商品名称">
            <input class="input" type="number" min="0.01" step="0.01" placeholder="单品重量(g) *" data-field="unitWeight" aria-label="单品重量，单位克" required>
            <input class="input" type="number" min="1" step="1" placeholder="件数" data-field="packSize" value="1" aria-label="套装内数量">
            <input class="input" type="number" min="1" step="1" placeholder="套数" data-field="packCount" value="1" aria-label="套装数量">
            <input class="input" type="number" min="0.01" step="0.01" placeholder="总价(元) *" data-field="totalPrice" aria-label="总价，单位元" required>
            <button type="submit" class="btn-primary">添加</button>
          </div>
        </form>
      </div>
    </div>`;
  }).join('');
}

// Shared validation for the add-item and edit-item forms: parse all four
// numeric fields and flag every invalid one so the user sees all errors.
function parseItemFields(form) {
  const parsers = {
    unitWeight: parsePositiveFiniteNumber,
    packSize: parsePositiveInteger,
    packCount: parsePositiveInteger,
    totalPrice: parsePositiveFiniteNumber,
  };
  const fields = {};
  let invalid = false;
  for (const [field, parse] of Object.entries(parsers)) {
    const el = form.querySelector('[data-field="' + field + '"]');
    const value = parse(el.value);
    if (value === null) { flagInputError(el); invalid = true; }
    fields[field] = value;
  }
  return invalid ? null : fields;
}

async function handleAddSubmit(form, groupId) {
  const fields = parseItemFields(form);
  if (!fields) return;
  const formData = {
    name: form.querySelector('[data-field="name"]').value.trim(),
    unitWeight: fields.unitWeight,
    packSize: fields.packSize,
    packCount: fields.packCount,
    totalPrice: fields.totalPrice,
  };
  if (await addItemToGroup(groupId, formData)) form.reset();
}

function escHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  // innerHTML escapes < > & but NOT quotes — escape them so values are safe
  // inside double-quoted HTML attributes (e.g. value="${escHtml(name)}").
  return div.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function initPriceCalculator() {
  const lockManager = typeof navigator !== 'undefined' ? navigator.locks : null;
  if (!lockManager) {
    initPricePresence();
    // Release the presence claim while hidden and rebuild it on return, so a
    // bfcache restore doesn't leave this tab invisible to other fallback tabs.
    window.addEventListener('pagehide', stopPriceHeartbeat);
    window.addEventListener('pageshow', initPricePresence);
  }
  loadGroups();
  renderPriceList();

  window.addEventListener('storage', function(e) {
    if (e.key !== PRICE_STORAGE_KEY) return;
    const stored = decodeStoredGroups(e.newValue);
    if (stored.revision <= groupsRevision) return;
    const previousGroups = groups;
    // Re-render only groups whose content actually changed so in-progress
    // add-form inputs elsewhere survive the sync.
    const changedIds = new Set(stored.groups
      .filter(g => {
        const prev = previousGroups.find(p => p.id === g.id);
        return !prev || JSON.stringify(prev) !== JSON.stringify(g);
      })
      .map(g => g.id));
    // An edit whose group is byte-identical stays open; just re-base it so
    // the next save passes the revision check.
    const keepEditing = editingGroupId != null && !changedIds.has(editingGroupId) &&
      stored.groups.some(g => g.id === editingGroupId);
    applyStoredGroups(stored);
    if (keepEditing) {
      editingBaseRevision = stored.revision;
    } else {
      editingId = null;
      editingGroupId = null;
      editingBaseRevision = null;
    }
    if (previousGroups.some(p => !stored.groups.some(g => g.id === p.id))) {
      renderPriceList();
    } else {
      stored.groups.forEach(g => {
        // A group added remotely has no card yet; renderGroup falls back to
        // a full render for it.
        if (changedIds.has(g.id)) renderGroup(g);
      });
    }
    showPriceStatus(stored.hadInvalidData
      ? '其他标签页写入的数据格式无效，已安全忽略。'
      : '已同步其他标签页的修改。');
  });

  const list = document.getElementById('price-list');

  // Single delegated click handler for every action button inside the list.
  list.addEventListener('click', async function(e) {
    const btn = e.target.closest('[data-action]');
    if (!btn || !list.contains(btn)) return;
    const action = btn.dataset.action;
    const groupId = btn.dataset.groupId;
    const itemId = btn.dataset.itemId;
    if (action === 'edit') startEditItem(groupId, itemId);
    else if (action === 'delete-item') await deleteItemFromGroup(groupId, itemId);
    else if (action === 'cancel-edit') cancelEdit(groupId, itemId);
    else if (action === 'delete-group') await deleteGroup(groupId);
  });

  // Single delegated submit handler for both the add-item and edit-item forms.
  list.addEventListener('submit', async function(e) {
    const form = e.target;
    if (!form.matches('form')) return;
    if (form.classList.contains('group-add-item-form')) {
      e.preventDefault();
      await runFormSubmissionOnce(form, () => handleAddSubmit(form, form.dataset.groupId));
    } else if (form.classList.contains('item-edit-form')) {
      e.preventDefault();
      await runFormSubmissionOnce(form, () => saveEditItem(form, form.dataset.groupId, form.dataset.itemId));
    }
  });

  const createGroupForm = document.getElementById('create-group-form');
  if (createGroupForm) {
    createGroupForm.addEventListener('submit', async function(e) {
      e.preventDefault();
      const nameInput = document.getElementById('new-group-name');
      const name = nameInput.value.trim();
      if (!name) { flagInputError(nameInput); return; }
      await runFormSubmissionOnce(createGroupForm, async () => {
        if (await addGroup(name)) nameInput.value = '';
      });
    });
  }
}

/* ===== BOSS TIMER ===== */
// Pure schedule/format helpers live at module level so Node's test runner
// can exercise the boundary math directly.
function pad(n) { return String(n).padStart(2, '0'); }

// Next spawn strictly after `now`: ceil alone returns a boundary that can
// equal `now`, so the loop advances one extra cycle in that case.
function getNext(now, baseMs, intervalMs) {
  const elapsed = now - baseMs;
  let next = baseMs + Math.ceil(elapsed / intervalMs) * intervalMs;
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

function initBossTimer() {
  const originalTitle = document.title;

  function flash(el) { el.classList.remove('boss-flash'); void el.offsetWidth; el.classList.add('boss-flash'); }
  function fmtDate(ts) {
    return new Date(ts).toLocaleString('zh-CN', {
      month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    }).replace(/\//g, '-');
  }
  function onSpawn(cfg) {
    // Distinct spawn pulse so a refresh is obvious even without watching the digits.
    cfg.card.classList.remove('boss-spawned');
    void cfg.card.offsetWidth;
    cfg.card.classList.add('boss-spawned');
  }

  // Base times and intervals are hardcoded on purpose: this timer tracks one
  // game's fixed spawn schedule. If the schedule ever changes, edit the base
  // and interval below — a settings UI is deliberately out of scope.
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
    if (now >= cfg.next) cfg.next = getNext(now, cfg.base, cfg.interval);
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
function initSafely(name, initializer) {
  try {
    initializer();
  } catch (error) {
    console.error(`[Toolbox] ${name} 初始化失败`, error);
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    setActiveTab(restoreTab());
    initTabKeyboard();
    window.addEventListener('hashchange', () => {
      const hash = location.hash.replace('#', '');
      if (TAB_IDS.includes(hash)) switchTab(hash);
    });

    initSafely('热量换算', initEnergyConverter);
    initSafely('计数器', initCounter);
    initSafely('比价计算', initPriceCalculator);
    initSafely('Boss 计时', initBossTimer);
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    convertKcalToKj,
    convertKjToKcal,
    decodeStoredGroups,
    findCheapestInGroup,
    fmtCountdown,
    getNext,
    hasEditConflict,
    hasFreshPricePresence,
    hasGroupSnapshotConflict,
    parseNonNegativeFiniteNumber,
    parsePositiveFiniteNumber,
    parsePositiveInteger,
    runFormSubmissionOnce,
    runWithPriceStorageLock,
    shouldHandleCounterShortcut,
  };
}
