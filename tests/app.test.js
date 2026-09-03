const test = require('node:test');
const assert = require('node:assert/strict');

const {
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
} = require('../app.js');

test('energy input accepts only a complete finite non-negative number', () => {
  assert.equal(parseNonNegativeFiniteNumber('12.5'), 12.5);
  assert.equal(parseNonNegativeFiniteNumber('0'), 0);
  assert.equal(parseNonNegativeFiniteNumber('12abc'), null);
  assert.equal(parseNonNegativeFiniteNumber('1,000'), null);
  assert.equal(parseNonNegativeFiniteNumber('1e309'), null);
  assert.equal(parseNonNegativeFiniteNumber('-1'), null);
  assert.equal(parseNonNegativeFiniteNumber(''), null);
});

test('price inputs require finite positive numbers and safe positive integers', () => {
  assert.equal(parsePositiveFiniteNumber('0.01'), 0.01);
  assert.equal(parsePositiveFiniteNumber('0'), null);
  assert.equal(parsePositiveFiniteNumber('1e309'), null);

  assert.equal(parsePositiveInteger('1e2'), 100);
  assert.equal(parsePositiveInteger('2'), 2);
  assert.equal(parsePositiveInteger('-2'), null);
  assert.equal(parsePositiveInteger('2.5'), null);
  assert.equal(parsePositiveInteger(''), null);
});

test('tab navigation events never reach counter shortcuts', () => {
  assert.equal(shouldHandleCounterShortcut(true, false, false, false), true);
  assert.equal(shouldHandleCounterShortcut(true, false, true, false), false);
  assert.equal(shouldHandleCounterShortcut(true, true, false, false), false);
  assert.equal(shouldHandleCounterShortcut(false, false, false, false), false);
});

test('modified keys never reach the counter shortcuts', () => {
  assert.equal(shouldHandleCounterShortcut(true, false, false, true), false);
});

test('energy conversion uses the 4.184 factor in both directions', () => {
  assert.ok(Math.abs(convertKjToKcal(418.4) - 100) < 1e-9);
  assert.ok(Math.abs(convertKcalToKj(100) - 418.4) < 1e-9);
  assert.ok(Math.abs(convertKcalToKj(convertKjToKcal(123.4)) - 123.4) < 1e-6);
});

test('boss schedule returns the first boundary strictly after now', () => {
  const base = 1_000_000;
  const interval = 600_000; // 10 min
  // Mid-cycle: the next boundary is one full interval out.
  assert.equal(getNext(base + 250_000, base, interval), base + interval);
  // Exactly on a boundary: the due spawn is consumed, show the following one.
  assert.equal(getNext(base + interval, base, interval), base + 2 * interval);
  // Long elapsed spans land on the first future boundary.
  assert.equal(getNext(base + 10.3 * interval, base, interval), base + 11 * interval);
  // A base time still in the future is returned as-is.
  assert.equal(getNext(base - 5_000, base, interval), base);
});

test('boss countdown formats with and without the hours column', () => {
  assert.equal(fmtCountdown(3661, true), '01:01:01');
  assert.equal(fmtCountdown(3600, true), '01:00:00');
  assert.equal(fmtCountdown(45 * 60 + 7, false), '45:07');
  assert.equal(fmtCountdown(0, false), '00:00');
});

test('price writes use the shared cross-tab lock when available', async () => {
  const calls = [];
  const lockManager = {
    request(name, task) {
      calls.push(name);
      return task();
    },
  };
  const result = await runWithPriceStorageLock(lockManager, async () => 'saved');
  assert.equal(result, 'saved');
  assert.deepEqual(calls, ['toolbox-price-groups-write']);
});

test('price writes use the supplied safe fallback without Web Locks', async () => {
  const calls = [];
  const result = await runWithPriceStorageLock(null, async () => 'saved', async task => {
    calls.push('fallback');
    return task();
  });
  assert.equal(result, 'saved');
  assert.deepEqual(calls, ['fallback']);
});

test('fallback presence detects another live tab and ignores stale or own entries', () => {
  const now = 10_000;
  assert.equal(hasFreshPricePresence([
    ['toolbox_price_tab_self', '9000'],
    ['toolbox_price_tab_other', '8000'],
  ], 'toolbox_price_tab_self', now), true);
  assert.equal(hasFreshPricePresence([
    ['toolbox_price_tab_self', '9000'],
    ['toolbox_price_tab_stale', '1000'],
  ], 'toolbox_price_tab_self', now), false);
  assert.equal(hasFreshPricePresence([
    ['toolbox_price_tab_future', '11000'],
  ], 'toolbox_price_tab_self', now), false);
});

test('editing rejects any storage revision change since editing began', () => {
  assert.equal(hasEditConflict(4, 4), false);
  assert.equal(hasEditConflict(4, 5), true);
  assert.equal(hasEditConflict(null, 0), true);
});

test('group deletion rejects a target changed after confirmation', () => {
  const confirmed = { id: 'group-1', name: '食品', items: [] };
  assert.equal(hasGroupSnapshotConflict(confirmed, { ...confirmed }), false);
  assert.equal(hasGroupSnapshotConflict(confirmed, {
    ...confirmed,
    items: [{ id: 'item-1' }],
  }), true);
  assert.equal(hasGroupSnapshotConflict(confirmed, null), true);
});

test('forms ignore re-entrant submissions and restore their pending state', async () => {
  let finishFirst;
  let calls = 0;
  const submitButton = { disabled: false };
  const attributes = new Map();
  const form = {
    querySelectorAll: () => [submitButton],
    setAttribute: (name, value) => attributes.set(name, value),
    removeAttribute: name => attributes.delete(name),
  };
  const first = runFormSubmissionOnce(form, () => new Promise(resolve => {
    calls += 1;
    finishFirst = resolve;
  }));
  const second = await runFormSubmissionOnce(form, async () => {
    calls += 1;
    return true;
  });

  assert.equal(second, false);
  assert.equal(calls, 1);
  assert.equal(submitButton.disabled, true);
  assert.equal(attributes.get('aria-busy'), 'true');

  finishFirst('saved');
  assert.equal(await first, 'saved');
  assert.equal(submitButton.disabled, false);
  assert.equal(attributes.has('aria-busy'), false);
});

test('stored price data is normalized and malformed records are dropped', () => {
  const decoded = decodeStoredGroups(JSON.stringify({
    v: 1,
    revision: 7,
    groups: [{
      id: 'group-1',
      name: '食品',
      items: [
        { id: 'item-1', name: 'A', unitWeight: 100, packSize: 2, packCount: 1, totalPrice: 10 },
        { id: 'item-2', name: '坏数据', unitWeight: 100, packSize: -2, packCount: 1, totalPrice: 10 },
      ],
    }, {}],
  }));

  assert.equal(decoded.revision, 7);
  assert.equal(decoded.groups.length, 1);
  assert.equal(decoded.groups[0].items.length, 1);
  assert.equal(decoded.hadInvalidData, true);
});

test('legacy valid data remains readable with revision zero', () => {
  const decoded = decodeStoredGroups(JSON.stringify({ v: 1, groups: [] }));
  assert.deepEqual(decoded.groups, []);
  assert.equal(decoded.revision, 0);
  assert.equal(decoded.hadInvalidData, false);
});

test('malformed storage never escapes into the rendering model', () => {
  assert.deepEqual(decodeStoredGroups('{').groups, []);
  assert.deepEqual(decodeStoredGroups(JSON.stringify({ v: 1, groups: [{}] })).groups, []);
  assert.deepEqual(decodeStoredGroups(JSON.stringify({ v: 99, groups: [] })).groups, []);
});

test('cheapest detection preserves ties', () => {
  assert.deepEqual(findCheapestInGroup([
    { id: 'a', up: 0.1 },
    { id: 'b', up: 0.1 },
    { id: 'c', up: 0.2 },
  ]), ['a', 'b']);
});
