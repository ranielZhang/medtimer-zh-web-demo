const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const STATUSES = ['scheduled', 'raised', 'snoozed', 'taken', 'skipped'];
function id(prefix) { return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function dayKey(date) { return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-'); }
function dateOf(day) { return new Date(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10)); }
function plusDays(day, offset) { const date = dateOf(day); date.setDate(date.getDate() + offset); return dayKey(date); }
function at(day, time) { return dateOf(day).getTime() + (+time.slice(0, 2) * 60 + +time.slice(3, 5)) * 60000; }
function validDoseAmount(amount) { return Number.isFinite(amount) && amount > 0 && Math.abs(amount * 2 - Math.round(amount * 2)) < 1e-9; }
function valid(state) { return !!(state && state.version === 1 && Array.isArray(state.medicines) && state.events && Array.isArray(state.audit)); }
function seed() {
  return { version: 1, medicines: [
    { id: 'm1', name: '维生素 B12（500μg）', color: '#a23b50', icon: '▣', stock: 50.5, unit: '片', threshold: 12, notes: '', tags: ['维生素', '日常'], reminders: [
      { id: 'r1', type: 'weekly', time: '07:00', amount: 2, days: ALL_DAYS.slice(), active: true }
    ] },
    { id: 'm2', name: 'Omega 3（EPA/DHA 500mg）', color: '#596b98', icon: '⬡', stock: 10, unit: '粒', threshold: 12, notes: '餐后', tags: ['营养补充'], reminders: [
      { id: 'r2', type: 'weekly', time: '08:00', amount: 1, days: ALL_DAYS.slice(), active: true },
      { id: 'r3', type: 'weekly', time: '09:00', amount: 1, days: ALL_DAYS.slice(), active: true }
    ] },
    { id: 'm3', name: '示例药品 C', color: '#7aab87', icon: '✣', stock: 18, unit: '片', threshold: 5, notes: '按已有方案', tags: [], reminders: [
      { id: 'r4', type: 'weekly', time: '16:00', amount: 1, days: [1, 2, 3, 4, 5], active: true }
    ] }
  ], events: {}, audit: [] };
}
function activeOn(reminder, day) {
  if (!reminder.active) return false;
  if (reminder.type === 'cycle') {
    if (!reminder.cycleStart || !reminder.activeDays || !reminder.pauseDays) return false;
    const elapsed = Math.round((dateOf(day) - dateOf(reminder.cycleStart)) / 86400000);
    const period = Number(reminder.activeDays) + Number(reminder.pauseDays);
    return elapsed >= 0 && period > 0 && elapsed % period < reminder.activeDays;
  }
  return (reminder.days || ALL_DAYS).includes(dateOf(day).getDay());
}
function scheduled(state, day) {
  const rows = [];
  state.medicines.forEach(medicine => medicine.reminders.forEach(reminder => {
    const key = day + ':' + reminder.id;
    const event = state.events[key];
    if (!activeOn(reminder, day) && !event) return;
    rows.push({ key, day, medicine, reminder, event, status: event ? event.status : 'scheduled',
      dueAt: event && event.status === 'snoozed' ? event.snoozeUntil : at(day, reminder.time) });
  }));
  return rows.sort((a, b) => a.dueAt - b.dueAt || a.medicine.name.localeCompare(b.medicine.name));
}
function snapshot(row) { return { key: row.key, day: row.day, medicineId: row.medicine.id, reminderId: row.reminder.id,
  name: row.medicine.name, amount: row.reminder.amount, unit: row.medicine.unit, time: row.reminder.time,
  status: 'scheduled', dueAt: at(row.day, row.reminder.time), raisedAt: null, processedAt: null, snoozeUntil: null, deducted: 0, manual: false }; }
function findRow(state, key) { return scheduled(state, key.slice(0, 10)).find(row => row.key === key); }
function log(state, action, event, now) { state.audit.push({ at: now.getTime(), action, key: event.key, name: event.name }); }
function raise(state, key, now = new Date()) {
  const row = findRow(state, key); if (!row || row.status === 'taken' || row.status === 'skipped') return false;
  const event = row.event || snapshot(row); event.status = 'raised'; event.raisedAt = now.getTime(); event.snoozeUntil = null;
  state.events[key] = event; log(state, '提醒触发', event, now); return true;
}
function reconcile(state, now = new Date()) {
  let changed = false;
  scheduled(state, dayKey(now)).forEach(row => { if (['scheduled', 'snoozed'].includes(row.status) && row.dueAt <= now.getTime()) changed = raise(state, row.key, now) || changed; });
  return changed;
}
function snooze(state, key, minutes = 10, now = new Date()) {
  const row = findRow(state, key); if (!row || !['raised', 'snoozed'].includes(row.status)) return false;
  const event = row.event; event.status = 'snoozed'; event.snoozeUntil = now.getTime() + minutes * 60000;
  log(state, '延后提醒', event, now); return true;
}
function outcome(state, key, status, now = new Date()) {
  if (!['taken', 'skipped'].includes(status)) return false;
  const row = findRow(state, key); if (!row) return false;
  const event = row.event || snapshot(row); if (event.status === status) return false;
  const medicine = row.medicine;
  if (event.status === 'taken') medicine.stock = +(medicine.stock + event.deducted).toFixed(2);
  event.deducted = 0;
  if (status === 'taken') { event.deducted = Math.min(medicine.stock, event.amount); medicine.stock = +(medicine.stock - event.deducted).toFixed(2); }
  event.status = status; event.processedAt = now.getTime(); event.snoozeUntil = null;
  state.events[key] = event; log(state, status === 'taken' ? '确认服用' : '跳过本次', event, now); return true;
}
function manualDose(state, medicineId, amount, now = new Date()) {
  const medicine = state.medicines.find(item => item.id === medicineId);
  if (!medicine || !validDoseAmount(amount)) return null;
  const key = dayKey(now) + ':manual-' + id('e');
  const deducted = Math.min(medicine.stock, amount); medicine.stock = +(medicine.stock - deducted).toFixed(2);
  const event = { key, day: dayKey(now), medicineId, reminderId: null, name: medicine.name, amount, unit: medicine.unit,
    time: [now.getHours(), now.getMinutes()].map(value => String(value).padStart(2, '0')).join(':'), status: 'taken',
    dueAt: now.getTime(), raisedAt: null, processedAt: now.getTime(), snoozeUntil: null, deducted, manual: true };
  state.events[key] = event; log(state, '补记服药', event, now); return event;
}
function history(state) { return Object.values(state.events).filter(event => ['taken', 'skipped'].includes(event.status)).sort((a, b) => b.processedAt - a.processedAt); }
function stats(state, endDay, count) {
  const result = [];
  for (let i = count - 1; i >= 0; i--) {
    const day = plusDays(endDay, -i);
    const items = history(state).filter(event => event.day === day);
    result.push({ day, label: day.slice(5).replace('-', '/'), taken: items.filter(item => item.status === 'taken').length, skipped: items.filter(item => item.status === 'skipped').length });
  }
  return result;
}
function week(day) { const offset = dateOf(day).getDay(); const monday = plusDays(day, -((offset + 6) % 7)); return Array.from({ length: 7 }, (_, index) => plusDays(monday, index)); }
const api = { ALL_DAYS, STATUSES, id, dayKey, dateOf, plusDays, at, valid, validDoseAmount, seed, activeOn, scheduled, findRow, raise, reconcile, snooze, outcome, manualDose, history, stats, week };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else if (typeof window !== 'undefined') window.MedTimerModel = api;
