const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('../lib/model');

test('one medicine can generate several reminder events on an active day', () => {
  const state = model.seed();
  assert.equal(model.scheduled(state, '2026-10-15').filter(row => row.medicine.id === 'm2').length, 2);
  assert.equal(model.scheduled(state, '2026-10-17').filter(row => row.medicine.id === 'm3').length, 0);
});

test('cyclic reminder repeats active and pause days, but never before cycle start', () => {
  const state = model.seed();
  state.medicines[0].reminders[0] = { id: 'r1', type: 'cycle', time: '07:00', amount: 1, active: true, cycleStart: '2026-10-15', activeDays: 2, pauseDays: 1 };
  assert.equal(model.scheduled(state, '2026-10-15').length > 0, true);
  assert.equal(model.scheduled(state, '2026-10-17').some(row => row.reminder.id === 'r1'), false);
  assert.equal(model.scheduled(state, '2026-10-18').some(row => row.reminder.id === 'r1'), true);
  assert.equal(model.scheduled(state, '2026-10-14').some(row => row.reminder.id === 'r1'), false);
  assert.equal(model.scheduled(state, '2026-10-12').some(row => row.reminder.id === 'r1'), false);
});

test('snooze preserves the same event and re-raises it when due', () => {
  const state = model.seed(), now = new Date('2026-10-15T08:00:00');
  const key = '2026-10-15:r1';
  assert.equal(model.raise(state, key, now), true);
  assert.equal(model.snooze(state, key, 10, now), true);
  assert.equal(Object.keys(state.events).length, 1);
  model.reconcile(state, new Date('2026-10-15T08:09:00'));
  assert.equal(state.events[key].status, 'snoozed');
  assert.equal(model.reconcile(state, new Date('2026-10-15T08:10:00')), true);
  assert.equal(state.events[key].status, 'raised');
});

test('taken, skipped, and correction adjust stock exactly once', () => {
  const state = model.seed(), key = '2026-10-15:r1';
  assert.equal(model.outcome(state, key, 'taken'), true);
  assert.equal(state.medicines[0].stock, 48.5);
  assert.equal(model.outcome(state, key, 'taken'), false);
  assert.equal(state.medicines[0].stock, 48.5);
  assert.equal(model.outcome(state, key, 'skipped'), true);
  assert.equal(state.medicines[0].stock, 50.5);
  assert.equal(model.outcome(state, key, 'taken'), true);
  assert.equal(state.medicines[0].stock, 48.5);
});

test('manual dose creates a separate taken event and appears in analysis', () => {
  const state = model.seed(), now = new Date('2026-10-15T14:30:00');
  const event = model.manualDose(state, 'm1', 1, now);
  assert.equal(event.manual, true);
  assert.equal(state.medicines[0].stock, 49.5);
  assert.equal(model.history(state).length, 1);
  assert.equal(model.stats(state, '2026-10-15', 7).at(-1).taken, 1);
});
