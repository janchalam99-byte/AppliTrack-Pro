/**
 * Automated Verification & Stress Test Suite
 * Tests:
 * 1. Quick Options: deletion, localStorage tracking, resurrection prevention
 * 2. Concurrency & Anti-Double-Submit: rapid parallel submit suppression
 * 3. Realtime Debounce: burst event aggregation (50 events -> 1 invalidation)
 * 4. Validation Guarding: ensuring invalid forms don't lock future submissions
 */

import assert from 'assert';

console.log('====================================================');
console.log('🚀 Starting AppliTrack Pro Quality & Bug Test Suite');
console.log('====================================================\n');

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`✅ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`❌ [FAIL] ${name}:`, err.message);
  }
}

async function runAsyncTest(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`✅ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`❌ [FAIL] ${name}:`, err.message);
  }
}

// ----------------------------------------------------
// TEST SUITE 1: Quick Options Deletion & Sync Logic
// ----------------------------------------------------
console.log('--- Suite 1: Quick Options Deletion & Protection ---');

const mockLocalStorage = {
  store: {},
  getItem(k) { return this.store[k] || null; },
  setItem(k, v) { this.store[k] = String(v); },
  removeItem(k) { delete this.store[k]; },
  clear() { this.store = {}; }
};

const DELETED_STORAGE_KEY = 'applitrack_deleted_quick_options_v1';
const COMMON_STAFF = [
  "CHONLAKAN", "PETCH", "SAIFA", "TEERAPONG", "CHINNAWAT",
  "PHONLAWAT", "OPAD", "CHANACHOK", "SORNARIN", "PASSAKORN",
  "KLA", "THEPPRASIT"
];

function getDeletedOptions() {
  try {
    const raw = mockLocalStorage.getItem(DELETED_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        staff: Array.isArray(parsed?.staff) ? parsed.staff : [],
        remark: Array.isArray(parsed?.remark) ? parsed.remark : [],
      };
    }
  } catch {}
  return { staff: [], remark: [] };
}

function saveDeletedOption(category, value) {
  const current = getDeletedOptions();
  if (!current[category].includes(value)) {
    current[category].push(value);
    mockLocalStorage.setItem(DELETED_STORAGE_KEY, JSON.stringify(current));
  }
}

function unmarkDeletedOption(category, value) {
  const current = getDeletedOptions();
  current[category] = current[category].filter(v => v !== value);
  mockLocalStorage.setItem(DELETED_STORAGE_KEY, JSON.stringify(current));
}

function computeStaffOptions(dbRows) {
  const deleted = getDeletedOptions();
  const staffList = [];
  dbRows?.forEach(r => {
    if (r.category === 'staff' && !staffList.includes(r.value)) staffList.push(r.value);
  });

  const finalStaff = staffList.length > 0 ? staffList : COMMON_STAFF;
  return finalStaff.filter(name => !deleted.staff.includes(name));
}

runTest('1.1 Initial load without deletions returns active staff', () => {
  mockLocalStorage.clear();
  const dbRows = [
    { category: 'staff', value: 'CHONLAKAN' },
    { category: 'staff', value: 'PETCH' },
    { category: 'staff', value: 'ชัตชัย' }
  ];
  const staff = computeStaffOptions(dbRows);
  assert.deepStrictEqual(staff, ['CHONLAKAN', 'PETCH', 'ชัตชัย']);
});

runTest('1.2 Deleting a name permanently filters it out', () => {
  saveDeletedOption('staff', 'PETCH');
  const dbRows = [
    { category: 'staff', value: 'CHONLAKAN' },
    { category: 'staff', value: 'PETCH' },
    { category: 'staff', value: 'ชัตชัย' }
  ];
  const staff = computeStaffOptions(dbRows);
  assert.ok(!staff.includes('PETCH'), 'PETCH should not be in staff list');
  assert.deepStrictEqual(staff, ['CHONLAKAN', 'ชัตชัย']);
});

runTest('1.3 Deleting default COMMON_STAFF member is not resurrected on fallback', () => {
  mockLocalStorage.clear();
  saveDeletedOption('staff', 'CHONLAKAN');
  saveDeletedOption('staff', 'THEPPRASIT');
  const emptyDbRows = [];
  const staff = computeStaffOptions(emptyDbRows);
  assert.ok(!staff.includes('CHONLAKAN'), 'CHONLAKAN must not be resurrected');
  assert.ok(!staff.includes('THEPPRASIT'), 'THEPPRASIT must not be resurrected');
  assert.ok(staff.includes('PETCH'), 'PETCH should still be present');
});

runTest('1.4 Re-adding a previously deleted name unmarks it and shows up', () => {
  unmarkDeletedOption('staff', 'CHONLAKAN');
  const emptyDbRows = [];
  const staff = computeStaffOptions(emptyDbRows);
  assert.ok(staff.includes('CHONLAKAN'), 'CHONLAKAN should be available again');
});

// ----------------------------------------------------
// TEST SUITE 2: Concurrency & Anti-Double-Submit Protection
// ----------------------------------------------------
console.log('\n--- Suite 2: Anti-Double-Submit & Rapid Click Suppression ---');

await runAsyncTest('2.1 Rapid fire 10 concurrent submits: strictly only 1 execution succeeds', async () => {
  const isSubmittingRef = { current: false };
  let executionCount = 0;
  let rejectedCount = 0;

  async function mockSubmit(data) {
    if (isSubmittingRef.current) {
      rejectedCount++;
      return { success: false, reason: 'BLOCKED_DUPLICATE' };
    }
    isSubmittingRef.current = true;
    try {
      // Simulate network latency (50ms)
      await new Promise(r => setTimeout(r, 50));
      executionCount++;
      return { success: true };
    } finally {
      isSubmittingRef.current = false;
    }
  }

  // Fire 10 submits simultaneously at the same millisecond
  const promises = Array.from({ length: 10 }, (_, i) => mockSubmit({ item: `item-${i}` }));
  const results = await Promise.all(promises);

  const successful = results.filter(r => r.success);
  assert.strictEqual(successful.length, 1, 'Only exactly 1 submit must succeed');
  assert.strictEqual(executionCount, 1, 'Execution count must be exactly 1');
  assert.strictEqual(rejectedCount, 9, '9 submits must be blocked');
});

await runAsyncTest('2.2 Consecutive submits after completion work normally', async () => {
  const isSubmittingRef = { current: false };
  let executionCount = 0;

  async function mockSubmit() {
    if (isSubmittingRef.current) return false;
    isSubmittingRef.current = true;
    try {
      await new Promise(r => setTimeout(r, 10));
      executionCount++;
      return true;
    } finally {
      isSubmittingRef.current = false;
    }
  }

  const first = await mockSubmit();
  assert.strictEqual(first, true, 'First submit succeeds');
  const second = await mockSubmit();
  assert.strictEqual(second, true, 'Second submit after completion succeeds');
  assert.strictEqual(executionCount, 2);
});

runTest('2.3 Validation failure does NOT lock the submission ref', () => {
  const isSubmittingRef = { current: false };

  function validateAndSubmit(items) {
    // Validate first before lock
    for (let i = 0; i < items.length; i++) {
      if (!items[i].name) {
        return { error: 'Validation failed' };
      }
    }
    isSubmittingRef.current = true;
    return { ok: true };
  }

  // Attempt with invalid items
  const res1 = validateAndSubmit([{ name: '' }]);
  assert.strictEqual(res1.error, 'Validation failed');
  assert.strictEqual(isSubmittingRef.current, false, 'isSubmittingRef must NOT be true on validation failure');

  // Next attempt with valid items
  const res2 = validateAndSubmit([{ name: 'App TW-123' }]);
  assert.strictEqual(res2.ok, true);
  assert.strictEqual(isSubmittingRef.current, true, 'isSubmittingRef locks when valid');
});

// ----------------------------------------------------
// TEST SUITE 3: Realtime Event Debouncing (UI Freeze Prevention)
// ----------------------------------------------------
console.log('\n--- Suite 3: Realtime Debouncing & Freeze Prevention ---');

await runAsyncTest('3.1 Burst of 50 realtime events in 100ms triggers only 1 query invalidation', async () => {
  let invalidationCount = 0;
  let timer = null;

  function onRealtimeEvent(payload) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      invalidationCount++;
    }, 40); // 40ms debounce window
  }

  // Send 50 events rapid fire every 2ms (total 100ms)
  for (let i = 0; i < 50; i++) {
    onRealtimeEvent({ eventType: 'INSERT', table: 'transfer_request_items', id: i });
    await new Promise(r => setTimeout(r, 2));
  }

  // Wait for debounce window to settle
  await new Promise(r => setTimeout(r, 80));

  assert.strictEqual(invalidationCount, 1, `Invalidation count should be 1, but got ${invalidationCount}`);
});

// ----------------------------------------------------
// TEST SUITE 4: Centralized Safety Utilities & Data Sanitization
// ----------------------------------------------------
console.log('\n--- Suite 4: Safety Utilities & Data Sanitization ---');

function withTimeout(promise, ms = 50, timeoutMessage = 'Timeout error') {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(timeoutMessage)), ms);
    promise
      .then(res => { clearTimeout(timer); resolve(res); })
      .catch(err => { clearTimeout(timer); reject(err); });
  });
}

function sanitizeString(val, maxLength = 255) {
  if (typeof val !== 'string') return '';
  const clean = val.replace(/[\x00-\x09\x0B-\x1F\x7F]/g, '').trim();
  return clean.slice(0, maxLength);
}

function safeJsonParse(jsonString, fallback) {
  if (!jsonString) return fallback;
  try {
    const parsed = JSON.parse(jsonString);
    return parsed !== null && parsed !== undefined ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function generateUniqueRequestNumber(prefix, datePart, seq, retryCount = 0) {
  const baseSeq = String(seq).padStart(3, '0');
  if (retryCount === 0) {
    return `${prefix}-${datePart}-${baseSeq}`;
  }
  const salt = Math.random().toString(36).substring(2, 5).toUpperCase();
  const microTime = Date.now().toString().slice(-4);
  return `${prefix}-${datePart}-${baseSeq}-${microTime}${salt}`;
}

function createDebounce(fn, waitMs) {
  let timer = null;
  const debounced = (...args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, waitMs);
  };
  debounced.cancel = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };
  return debounced;
}

await runAsyncTest('4.1 withTimeout resolves when operation finishes before timeout', async () => {
  const fastOp = new Promise(resolve => setTimeout(() => resolve('SUCCESS'), 20));
  const res = await withTimeout(fastOp, 100);
  assert.strictEqual(res, 'SUCCESS');
});

await runAsyncTest('4.2 withTimeout rejects with custom message when operation hangs', async () => {
  const slowOp = new Promise(resolve => setTimeout(() => resolve('NEVER'), 150));
  let errorCaught = null;
  try {
    await withTimeout(slowOp, 40, 'Upload timed out');
  } catch (err) {
    errorCaught = err.message;
  }
  assert.strictEqual(errorCaught, 'Upload timed out');
});

runTest('4.3 sanitizeString strips control characters and trims/bounds string', () => {
  const dirty = '\x00\x08 Hello World \x1F\x7F';
  assert.strictEqual(sanitizeString(dirty), 'Hello World');

  const longStr = 'A'.repeat(300);
  assert.strictEqual(sanitizeString(longStr, 10).length, 10);

  // Non-strings should safely return empty string
  assert.strictEqual(sanitizeString(null), '');
  assert.strictEqual(sanitizeString(undefined), '');
  assert.strictEqual(sanitizeString(12345), '');
});

runTest('4.4 safeJsonParse gracefully recovers from corrupt JSON', () => {
  const valid = safeJsonParse('{"staff":["CHONLAKAN"]}', { staff: [] });
  assert.deepStrictEqual(valid, { staff: ['CHONLAKAN'] });

  const broken = safeJsonParse('{"staff": incomplete json...', { staff: ['fallback'] });
  assert.deepStrictEqual(broken, { staff: ['fallback'] });

  const nullStr = safeJsonParse(null, []);
  assert.deepStrictEqual(nullStr, []);
});

runTest('4.5 generateUniqueRequestNumber creates standard and collision-breaking IDs', () => {
  const standard = generateUniqueRequestNumber('TR', '20261014', 1, 0);
  assert.strictEqual(standard, 'TR-20261014-001');

  const retry1 = generateUniqueRequestNumber('TR', '20261014', 1, 1);
  assert.ok(retry1.startsWith('TR-20261014-001-'), `Must start with base prefix: ${retry1}`);
  assert.ok(retry1.length >= 20, `Must include entropy salt: ${retry1}`);

  const retry2 = generateUniqueRequestNumber('TR', '20261014', 1, 2);
  assert.notStrictEqual(retry1, retry2, 'Subsequent retries must produce unique salts');
});

await runAsyncTest('4.6 createDebounce coalesces bursts and allows cancellation', async () => {
  let callCount = 0;
  let lastArg = null;
  const debounced = createDebounce((arg) => {
    callCount++;
    lastArg = arg;
  }, 30);

  debounced('a');
  debounced('b');
  debounced('c');

  await new Promise(r => setTimeout(r, 60));
  assert.strictEqual(callCount, 1);
  assert.strictEqual(lastArg, 'c');

  // Test cancellation
  debounced('d');
  debounced.cancel();
  await new Promise(r => setTimeout(r, 50));
  assert.strictEqual(callCount, 1, 'Cancelled call must not execute');
});

// ----------------------------------------------------
// TEST SUITE 5: Photo Upload Timeout Resilience Simulation
// ----------------------------------------------------
console.log('\n--- Suite 5: Photo Upload Timeout Resilience Simulation ---');

await runAsyncTest('5.1 Hanging photo upload rejects safely and clears upload state', async () => {
  let isUploading = true;

  // Mock upload with timeout guard
  async function mockPhotoUpload() {
    return withTimeout(
      new Promise((_, reject) => {
        // Simulating upload network stall
      }),
      40,
      'อัปโหลดภาพใช้เวลานานเกินไป กรุณาตรวจสอบสัญญาณอินเทอร์เน็ต'
    );
  }

  try {
    await mockPhotoUpload();
  } catch (err) {
    assert.strictEqual(err.message, 'อัปโหลดภาพใช้เวลานานเกินไป กรุณาตรวจสอบสัญญาณอินเทอร์เน็ต');
  } finally {
    isUploading = false;
  }

  assert.strictEqual(isUploading, false, 'Upload state must reset to false after timeout');
});

// ----------------------------------------------------
// TEST SUITE 6: Database Unique Constraint Collision Recovery
// ----------------------------------------------------
console.log('\n--- Suite 6: Database Request Number Collision-Breaker Simulation ---');

await runAsyncTest('6.1 Database conflict (23505) triggers auto-retry with entropy suffix', async () => {
  const existingNumbers = new Set(['TR-20261014-001']);
  let attempts = 0;
  let finalSavedNumber = null;

  async function mockInsertRequest(datePart, seq) {
    const MAX_RETRIES = 3;
    for (let retry = 0; retry < MAX_RETRIES; retry++) {
      attempts++;
      const reqNumber = generateUniqueRequestNumber('TR', datePart, seq, retry);

      if (existingNumbers.has(reqNumber)) {
        // Simulating Postgres unique violation error 23505
        continue;
      }

      existingNumbers.add(reqNumber);
      finalSavedNumber = reqNumber;
      return { success: true, reqNumber };
    }
    throw new Error('All retries failed');
  }

  const result = await mockInsertRequest('20261014', 1);
  assert.strictEqual(result.success, true);
  assert.strictEqual(attempts, 2, 'Should succeed on attempt 2 after collision');
  assert.ok(finalSavedNumber.startsWith('TR-20261014-001-'), 'Saved number must have collision salt');
});

// ----------------------------------------------------
// Final Results
// ----------------------------------------------------
console.log('\n====================================================');
console.log(`📊 Test Results: ${passedTests}/${totalTests} Passed (${Math.round((passedTests/totalTests)*100)}%)`);
console.log('====================================================\n');

if (passedTests !== totalTests) {
  process.exit(1);
}

