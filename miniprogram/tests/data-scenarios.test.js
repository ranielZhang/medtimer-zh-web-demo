const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('../lib/model');

function scenario() {
  return {
    version: 1,
    medicines: [
      { id: 'daily', name: '每日药', color: '#123456', icon: '▣', stock: 4.5, unit: '片', threshold: 2,
        notes: '', tags: ['每日'], reminders: [{ id: 'daily-am', type: 'weekly', time: '07:00', amount: 1.5, days: model.ALL_DAYS.slice(), active: true }] },
      { id: 'weekdays', name: '工作日药', color: '#654321', icon: '⬡', stock: 20, unit: '粒', threshold: 5,
        notes: '', tags: [], reminders: [{ id: 'mon-wed-fri', type: 'weekly', time: '08:30', amount: 1, days: [1, 3, 5], active: true }] },
      { id: 'cycle', name: '周期药', color: '#abcdef', icon: '✣', stock: 30, unit: '片', threshold: 5,
        notes: '', tags: [], reminders: [{ id: 'cycle-rule', type: 'cycle', time: '21:00', amount: 2, cycleStart: '2026-12-29', activeDays: 2, pauseDays: 2, active: true }] },
      { id: 'paused', name: '停用药', color: '#aaaaaa', icon: '□', stock: 5, unit: '片', threshold: 1,
        notes: '', tags: [], reminders: [{ id: 'paused-rule', type: 'weekly', time: '12:00', amount: 1, days: model.ALL_DAYS.slice(), active: false }] }
    ],
    events: {},
    audit: []
  };
}

test('fixture is a complete, valid dataset with unique medicine and reminder IDs', () => {
  const state = scenario();
  assert.equal(model.valid(state), true);
  assert.equal(new Set(state.medicines.map(item => item.id)).size, state.medicines.length);
  const reminderIds = state.medicines.flatMap(item => item.reminders.map(rule => rule.id));
  assert.equal(new Set(reminderIds).size, reminderIds.length);
  for (const medicine of state.medicines) {
    assert.ok(medicine.name && medicine.unit);
    assert.ok(Number.isFinite(medicine.stock) && medicine.stock >= 0);
    assert.ok(medicine.reminders.length > 0);
  }
});

test('demo dataset fills the 7-day and 30-day analysis views with mixed outcomes', () => {
  const now = new Date(2026, 9, 15, 17, 2), state = model.demoSeed(now);
  const history = model.history(state), sevenDays = model.stats(state, model.dayKey(now), 7);
  const thirtyDays = model.stats(state, model.dayKey(now), 30);
  assert.equal(model.valid(state), true);
  assert.ok(history.length > 60);
  assert.ok(history.some(item => item.status === 'taken'));
  assert.ok(history.some(item => item.status === 'skipped'));
  assert.ok(sevenDays.filter(item => item.taken + item.skipped > 0).length >= 6);
  assert.ok(thirtyDays.every(item => item.taken + item.skipped > 0));
  assert.equal(thirtyDays.reduce((sum, item) => sum + item.taken + item.skipped, 0), history.length);
  assert.equal(history.some(item => item.day > model.dayKey(now)), false);
});

test('dose amounts use half-unit increments only', () => {
  for (const amount of [0.5, 1, 1.5, 2, 2.5]) assert.equal(model.validDoseAmount(amount), true);
  for (const amount of [0, 0.1, 0.25, 1.2, 1.75, -0.5, NaN, Infinity]) assert.equal(model.validDoseAmount(amount), false);
});

test('concentration trend uses configured medicine parameters and taken dose history', () => {
  const state = scenario(), medicine = state.medicines[0];
  medicine.halfLifeHours = 4;
  medicine.peakTimeHours = 1;
  state.medicines[1].halfLifeHours = 6;
  state.medicines[1].peakTimeHours = 1;
  const key = '2026-10-12:daily-am';
  model.outcome(state, key, 'taken', new Date('2026-10-12T08:00:00'));
  model.outcome(state, '2026-10-12:mon-wed-fri', 'skipped', new Date('2026-10-12T08:30:00'));
  const series = model.concentrationSeries(state, '2026-10-12', 7);
  assert.equal(series.length, 2);
  assert.equal(series[0].medicineId, 'daily');
  assert.equal(series[0].points.length, 169);
  const dayOffset = 6 * 24;
  assert.equal(series[0].points[dayOffset + 9].value, 100); // reaches peak one hour after dose
  assert.equal(series[0].points[dayOffset + 13].value, 50); // halves four hours after peak
  assert.equal(series[1].points.every(point => point.value === 0), true); // skipped doses do not contribute
  assert.equal(model.concentrationSeries(state, '2026-10-12', 30)[0].points.length, 361);
  medicine.peakTimeHours = null;
  const remaining = model.concentrationSeries(state, '2026-10-12', 7);
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].medicineId, 'weekdays');
});

test('weekly, disabled, and cycle rules cover weekday boundaries and year rollover', () => {
  const state = scenario();
  assert.deepEqual(model.scheduled(state, '2026-10-12').map(row => row.reminder.id), ['daily-am', 'mon-wed-fri']); // Monday
  assert.deepEqual(model.scheduled(state, '2026-10-13').map(row => row.reminder.id), ['daily-am']); // Tuesday
  assert.deepEqual(model.scheduled(state, '2026-10-18').map(row => row.reminder.id), ['daily-am']); // Sunday
  assert.deepEqual(model.scheduled(state, '2026-12-28').map(row => row.reminder.id), ['daily-am', 'mon-wed-fri']); // Monday, before cycle
  assert.deepEqual(model.scheduled(state, '2026-12-29').map(row => row.reminder.id), ['daily-am', 'cycle-rule']);
  assert.deepEqual(model.scheduled(state, '2026-12-30').map(row => row.reminder.id), ['daily-am', 'mon-wed-fri', 'cycle-rule']); // Wednesday
  assert.deepEqual(model.scheduled(state, '2026-12-31').map(row => row.reminder.id), ['daily-am']); // pause day
  assert.deepEqual(model.scheduled(state, '2027-01-02').map(row => row.reminder.id), ['daily-am', 'cycle-rule']);
  state.medicines[0].reminders[0].active = false;
  assert.equal(model.scheduled(state, '2026-10-12').some(row => row.reminder.id === 'daily-am'), false);
});

test('end-to-end event lifecycle keeps one event through trigger, snooze, and final outcome', () => {
  const state = scenario(), key = '2026-10-12:daily-am';
  const due = new Date('2026-10-12T07:00:00');
  assert.equal(model.reconcile(state, new Date('2026-10-12T06:59:59')), false);
  assert.equal(model.reconcile(state, due), true);
  assert.equal(state.events[key].status, 'raised');
  assert.equal(model.snooze(state, key, 10, due), true);
  assert.equal(state.events[key].status, 'snoozed');
  assert.equal(model.reconcile(state, new Date('2026-10-12T07:09:59')), false);
  assert.equal(model.reconcile(state, new Date('2026-10-12T07:10:00')), true);
  assert.equal(state.events[key].status, 'raised');
  assert.equal(model.outcome(state, key, 'taken', new Date('2026-10-12T07:11:00')), true);
  assert.equal(Object.keys(state.events).length, 1);
  assert.equal(state.events[key].status, 'taken');
  assert.equal(state.medicines[0].stock, 3);
  assert.deepEqual(state.audit.map(entry => entry.action), ['提醒触发', '延后提醒', '提醒触发', '确认服用']);
});

test('skipping does not consume stock, and correcting either result reconciles stock once', () => {
  const state = scenario(), key = '2026-10-12:daily-am', medicine = state.medicines[0];
  assert.equal(model.outcome(state, key, 'skipped'), true);
  assert.equal(medicine.stock, 4.5);
  assert.equal(model.outcome(state, key, 'skipped'), false);
  assert.equal(model.outcome(state, key, 'taken'), true);
  assert.equal(medicine.stock, 3);
  assert.equal(model.outcome(state, key, 'skipped'), true);
  assert.equal(medicine.stock, 4.5);
  assert.equal(model.outcome(state, key, 'taken'), true);
  assert.equal(medicine.stock, 3);
});

test('stock cannot go below zero and fractional doses remain exact after correction', () => {
  const state = scenario(), medicine = state.medicines[0], key = '2026-10-12:daily-am';
  medicine.stock = 0.5;
  assert.equal(model.outcome(state, key, 'taken'), true);
  assert.equal(medicine.stock, 0);
  assert.equal(state.events[key].deducted, 0.5);
  assert.equal(model.outcome(state, key, 'skipped'), true);
  assert.equal(medicine.stock, 0.5);
});

test('manual doses reject invalid input and create independent, analyzable history', () => {
  const state = scenario(), now = new Date('2026-10-12T15:05:00');
  for (const amount of [0, -1, 0.25, 1.2, 1.75, NaN, Infinity]) assert.equal(model.manualDose(state, 'daily', amount, now), null);
  assert.equal(model.manualDose(state, 'missing', 1, now), null);
  const event = model.manualDose(state, 'daily', 1.5, now);
  assert.equal(event.manual, true);
  assert.equal(event.status, 'taken');
  assert.equal(event.time, '15:05');
  assert.equal(state.medicines[0].stock, 3);
  assert.equal(model.history(state).length, 1);
  assert.equal(model.stats(state, '2026-10-12', 7).at(-1).taken, 1);
});

test('analysis provides zero-filled calendar dates, date ordering, and exact taken/skipped totals', () => {
  const state = scenario();
  model.outcome(state, '2026-10-12:daily-am', 'taken', new Date('2026-10-12T07:01:00'));
  model.outcome(state, '2026-10-12:mon-wed-fri', 'skipped', new Date('2026-10-12T08:31:00'));
  model.outcome(state, '2026-10-14:daily-am', 'taken', new Date('2026-10-14T07:01:00'));
  const week = model.stats(state, '2026-10-14', 7);
  assert.equal(week.length, 7);
  assert.equal(week[0].day, '2026-10-08');
  assert.equal(week.at(-1).day, '2026-10-14');
  assert.deepEqual(week.filter(item => item.taken || item.skipped).map(({ day, taken, skipped }) => ({ day, taken, skipped })), [
    { day: '2026-10-12', taken: 1, skipped: 1 },
    { day: '2026-10-14', taken: 1, skipped: 0 }
  ]);
  assert.deepEqual(model.history(state).map(item => item.day), ['2026-10-14', '2026-10-12', '2026-10-12']);
});

test('processed event snapshots remain available after its medicine is removed', () => {
  const state = scenario(), key = '2026-10-12:daily-am';
  model.outcome(state, key, 'taken', new Date('2026-10-12T07:01:00'));
  state.medicines = state.medicines.filter(item => item.id !== 'daily');
  assert.equal(model.history(state)[0].name, '每日药');
  assert.equal(model.stats(state, '2026-10-12', 1)[0].taken, 1);
});
