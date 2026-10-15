(function () {
  'use strict';
  var KEY = 'medtimer-zh-demo-v2';
  var daysAll = [0, 1, 2, 3, 4, 5, 6];
  var tones = ['green', 'orange', 'blue', 'purple'];
  var state = load();
  var selectedDay = dayKey(new Date());
  var filter = 'all', editingMedicineId, editingReminderId, stockMedicineId, notificationKey, confirmAction, toastTimer;
  function dayKey(date) { return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-'); }
  function dateOf(day) { return new Date(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10)); }
  function at(day, time) { return dateOf(day).getTime() + (+time.slice(0, 2) * 60 + +time.slice(3, 5)) * 60000; }
  function id(prefix) { return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function med(idValue) { return state.medicines.find(function (m) { return m.id === idValue; }); }
  function esc(value) { return String(value).replace(/[&<>"']/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]; }); }
  function label(status) { return { scheduled: '待触发', raised: '待处理', snoozed: '已延后', taken: '已服用', skipped: '已跳过' }[status]; }
  function dateText(day) { return new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }).format(dateOf(day)); }
  function stamp(value) { return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value)); }
  function weekText(days) { return days.length === 7 ? '每天' : '周' + [1, 2, 3, 4, 5, 6, 0].filter(function (day) { return days.includes(day); }).map(function (day) { return '一二三四五六日'[day === 0 ? 6 : day - 1]; }).join('、'); }
  function seed() { return { version: 2, medicines: [
    { id: 'm1', name: '示例药品 A', stock: 18, unit: '片', note: '早餐后', tone: 'green', reminders: [{ id: 'r1', time: '08:00', amount: 1, days: daysAll.slice(), active: true }, { id: 'r2', time: '20:00', amount: 1, days: daysAll.slice(), active: true }] },
    { id: 'm2', name: '示例药品 B', stock: 8, unit: '粒', note: '午餐后', tone: 'orange', reminders: [{ id: 'r3', time: '12:30', amount: 1, days: [1, 2, 3, 4, 5], active: true }] },
    { id: 'm3', name: '示例药品 C', stock: 24, unit: '片', note: '按已有计划服用', tone: 'blue', reminders: [{ id: 'r4', time: '21:00', amount: 1, days: daysAll.slice(), active: true }] }
  ], events: {}, audit: [] }; }
  function load() {
    try {
      var saved = JSON.parse(localStorage.getItem(KEY));
      if (saved && saved.version === 2 && Array.isArray(saved.medicines) && saved.events) return saved;
      var old = JSON.parse(localStorage.getItem('medtimer-zh-demo-v1'));
      if (old && Array.isArray(old.medicines)) {
        var migrated = { version: 2, medicines: [], events: {}, audit: [] };
        old.medicines.forEach(function (m, index) {
          var amount = parseFloat(String(m.dose || '').match(/\d+(?:\.\d+)?/)?.[0]) || 1;
          var rid = 'old-' + m.id;
          migrated.medicines.push({ id: m.id, name: m.name, stock: Number(m.stock) || 0, unit: m.unit || '片', note: m.note || '', tone: m.tone || tones[index % 4], reminders: [{ id: rid, time: m.time || '08:00', amount: amount, days: daysAll.slice(), active: true }] });
          Object.keys(old.daily || {}).forEach(function (key) {
            if (!key.endsWith(':' + m.id)) return;
            var entry = old.daily[key], day = key.slice(0, 10);
            if (entry.status === 'pending') return;
            migrated.events[day + ':' + rid] = { day: day, medicineId: m.id, reminderId: rid, name: m.name, unit: m.unit || '片', amount: amount, time: m.time || '08:00', status: entry.status, deducted: Number(entry.deducted) || 0, snoozeUntil: entry.until ? at(day, entry.until) : null, processedAt: Date.now() };
          });
        });
        return migrated;
      }
    } catch (error) { /* Invalid local data falls back to synthetic examples. */ }
    return seed();
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (error) { toast('浏览器未能保存数据。'); } }
  function rows(day) {
    var result = [];
    state.medicines.forEach(function (m) { m.reminders.forEach(function (r) {
      var key = day + ':' + r.id, event = state.events[key];
      if ((!r.active || !r.days.includes(dateOf(day).getDay())) && !event) return;
      result.push({ key: key, day: day, med: m, rule: r, event: event, status: event ? event.status : 'scheduled', due: event && event.status === 'snoozed' ? event.snoozeUntil : at(day, r.time) });
    }); });
    return result.sort(function (a, b) { return a.due - b.due || a.med.name.localeCompare(b.med.name); });
  }
  function rowFor(key) { return rows(key.slice(0, 10)).find(function (row) { return row.key === key; }); }
  function snapshot(row) { return { day: row.day, medicineId: row.med.id, reminderId: row.rule.id, name: row.med.name, amount: row.rule.amount, unit: row.med.unit, time: row.rule.time, status: 'scheduled', scheduledAt: at(row.day, row.rule.time), raisedAt: null, processedAt: null, snoozeUntil: null, deducted: 0 }; }
  function audit(action, event) { state.audit.push({ at: Date.now(), action: action, name: event.name, key: event.day + ':' + event.reminderId }); }
  function raise(row) {
    var event = row.event || snapshot(row);
    if (event.status === 'taken' || event.status === 'skipped') return false;
    event.status = 'raised'; event.raisedAt = Date.now(); event.snoozeUntil = null;
    state.events[row.key] = event; audit('提醒触发', event); save(); return true;
  }
  function reconcile() {
    var changed = false, now = Date.now();
    rows(dayKey(new Date())).forEach(function (row) { if ((row.status === 'scheduled' || row.status === 'snoozed') && row.due <= now) changed = raise(row) || changed; });
    if (changed) render();
  }
  function outcome(row, status) {
    var event = row.event || snapshot(row), m = row.med;
    if (event.status === status) return;
    if (event.status === 'taken') m.stock = +(m.stock + event.deducted).toFixed(1);
    event.deducted = 0;
    if (status === 'taken') { event.deducted = Math.min(m.stock, event.amount); m.stock = +(m.stock - event.deducted).toFixed(1); }
    event.status = status; event.processedAt = Date.now(); event.snoozeUntil = null;
    state.events[row.key] = event; audit(status === 'taken' ? '确认服用' : '跳过本次', event);
    save(); render(); toast(status === 'taken' ? '已记录服用，库存减少 ' + event.deducted + ' ' + m.unit + '。' : '已跳过本次，库存不变。');
  }
  function snooze(row) {
    var event = row.event || snapshot(row);
    if (event.status !== 'raised' && event.status !== 'snoozed') { toast('请先触发提醒。'); return; }
    event.status = 'snoozed'; event.snoozeUntil = Date.now() + 10 * 60000;
    state.events[row.key] = event; audit('稍后提醒', event); save(); render(); toast('10 分钟后，同一条事件会重新变为待处理。');
  }
  function icon(m) { var tone = tones.includes(m.tone) ? m.tone : tones[0]; return '<div class="drug-icon ' + tone + '" aria-hidden="true">' + ['✦', '✳', '●', '◆'][tones.indexOf(tone)] + '</div>'; }
  function renderToday() {
    var today = dayKey(new Date()), current = rows(today), shown = rows(selectedDay);
    var completed = current.filter(function (r) { return r.status === 'taken' || r.status === 'skipped'; }).length;
    var taken = current.filter(function (r) { return r.status === 'taken'; }).length;
    document.getElementById('today-date').textContent = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }).format(new Date());
    document.getElementById('selected-day').textContent = dateText(selectedDay);
    document.getElementById('progress-done').textContent = completed;
    document.getElementById('progress-total').textContent = '/ ' + current.length + ' 次';
    document.getElementById('progress-fill').style.width = (current.length ? completed / current.length * 100 : 0) + '%';
    document.querySelector('.progress-card p').textContent = '已完成决策';
    document.getElementById('progress-caption').textContent = '已服用 ' + taken + ' 次，已跳过 ' + (completed - taken) + ' 次，待处理 ' + (current.length - completed) + ' 次';
    var next = current.find(function (r) { return r.status === 'raised'; }) || current.find(function (r) { return r.status === 'scheduled' || r.status === 'snoozed'; });
    document.getElementById('next-dose').innerHTML = next ? '<div class="hero-time">' + esc(next.status === 'snoozed' ? stamp(next.due).split(' ').pop() : next.rule.time) + '</div><div class="hero-drug">' + esc(next.med.name) + ' <span class="hero-status">' + label(next.status) + '</span></div><div class="hero-meta">' + esc(next.rule.amount + ' ' + next.med.unit + ' · ' + (next.med.note || '按已有计划')) + '</div><div class="hero-actions">' + (next.status === 'raised' ? '<button data-action="taken" data-key="' + esc(next.key) + '">确认已服用</button><button class="secondary" data-action="snooze" data-key="' + esc(next.key) + '">10 分钟后提醒</button>' : '<button data-action="raise" data-key="' + esc(next.key) + '">模拟触发提醒</button>') + '</div>' : '<div class="hero-empty">' + (current.length ? '今天的提醒均已处理' : '今天没有用药安排') + '</div><div class="hero-meta">可切换日期查看计划，或在药品页设置提醒规则。</div>';
    var visible = shown.filter(function (r) { return filter === 'all' || r.status === filter || (filter === 'raised' && r.status === 'snoozed'); });
    document.getElementById('schedule-list').innerHTML = visible.length ? visible.map(function (r) {
      var actions = r.status === 'taken' || r.status === 'skipped' ? '<button data-action="' + (r.status === 'taken' ? 'skip' : 'taken') + '" data-key="' + esc(r.key) + '">改为' + (r.status === 'taken' ? '跳过' : '已服用') + '</button>' : '<button data-action="taken" data-key="' + esc(r.key) + '">已服用</button><button class="subtle" data-action="skip" data-key="' + esc(r.key) + '">跳过</button>' + (r.status === 'raised' ? '<button class="subtle" data-action="snooze" data-key="' + esc(r.key) + '">稍后</button>' : '');
      return '<div class="schedule-item"><div class="schedule-time">' + esc(r.rule.time) + '</div><div class="schedule-center">' + icon(r.med) + '<div><div class="schedule-name">' + esc(r.med.name) + '</div><div class="schedule-detail">' + esc(r.rule.amount + ' ' + r.med.unit + ' · ' + (r.med.note || '按已有计划') + (r.status === 'snoozed' ? ' · 延后至 ' + stamp(r.due).split(' ').pop() : '')) + '</div></div></div><div class="schedule-actions"><span class="status ' + esc(r.status) + '">● ' + label(r.status) + '</span>' + actions + '</div></div>';
    }).join('') : '<div class="empty-state"><span>▤</span>' + (shown.length ? '这个筛选条件下没有事件。' : '这一天没有符合规则的提醒。') + '</div>';
    var low = state.medicines.filter(function (m) { return m.stock <= 5; });
    document.getElementById('stock-insight').textContent = low.length ? low.map(function (m) { return m.name; }).join('、') + ' 库存较少，请核对实际剩余。' : '当前示例库存充足；确认服用后才会扣减。';
    document.querySelectorAll('[data-filter]').forEach(function (button) { button.classList.toggle('active', button.dataset.filter === filter); });
  }
  function renderMedicines() {
    document.getElementById('medicine-count').textContent = state.medicines.length + ' 种';
    document.getElementById('medicine-list').innerHTML = state.medicines.length ? state.medicines.map(function (m) {
      var rules = m.reminders.map(function (r) { return '<div class="rule-row"><span><strong>' + esc(r.time) + '</strong> · ' + esc(r.amount) + ' ' + esc(m.unit) + ' · ' + esc(weekText(r.days)) + (r.active ? '' : ' · 已停用') + '</span><span><button data-action="edit-reminder" data-med="' + esc(m.id) + '" data-id="' + esc(r.id) + '">编辑</button><button data-action="toggle-reminder" data-med="' + esc(m.id) + '" data-id="' + esc(r.id) + '">' + (r.active ? '停用' : '启用') + '</button></span></div>'; }).join('');
      return '<article class="medicine-card"><div class="medicine-card-top">' + icon(m) + '<div><div class="medicine-card-name">' + esc(m.name) + '</div><div class="medicine-card-note">' + esc(m.note || '无备注') + '</div></div></div><div class="medicine-card-body"><div><small>当前库存</small><strong class="' + (m.stock <= 5 ? 'stock-low' : '') + '">' + esc(m.stock) + ' ' + esc(m.unit) + '</strong></div><div><small>提醒规则</small><strong>' + m.reminders.length + ' 条</strong></div></div><div class="rule-list">' + rules + '</div><div class="medicine-card-foot"><button data-action="add-reminder" data-id="' + esc(m.id) + '">＋ 添加提醒</button><button data-action="stock" data-id="' + esc(m.id) + '">修正库存</button><button data-action="delete-medicine" data-id="' + esc(m.id) + '">删除药品</button></div></article>';
    }).join('') : '<div class="empty-state"><span>＋</span>暂无药品，点击上方按钮开始。</div>';
  }
  function renderHistory() {
    var events = Object.values(state.events).filter(function (e) { return e.status === 'taken' || e.status === 'skipped'; }).sort(function (a, b) { return b.processedAt - a.processedAt; });
    document.getElementById('history-count').textContent = '共 ' + events.length + ' 条';
    document.getElementById('history-list').innerHTML = events.length ? events.map(function (e) { var m = med(e.medicineId), editable = m && m.reminders.some(function (r) { return r.id === e.reminderId; }); return '<div class="history-item"><span class="history-dot ' + esc(e.status) + '">' + (e.status === 'taken' ? '✓' : '–') + '</span><div><strong>' + esc(e.name) + ' · ' + label(e.status) + '</strong><small>计划 ' + esc(e.day + ' ' + e.time + ' · ' + e.amount + ' ' + e.unit) + (e.status === 'taken' ? ' · 库存 −' + esc(e.deducted) : '') + '</small>' + (editable ? '<button class="history-review" data-action="review-event" data-key="' + esc(e.day + ':' + e.reminderId) + '">查看并修正</button>' : '') + '</div><span class="history-time">' + esc(stamp(e.processedAt || e.scheduledAt || Date.now())) + '</span></div>'; }).join('') : '<div class="empty-state"><span>◷</span>暂无已处理的提醒事件。</div>';
  }
  function render() { renderToday(); renderMedicines(); renderHistory(); }
  function toast(message) { var el = document.getElementById('toast'); el.textContent = message; el.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(function () { el.classList.remove('show'); }, 3300); }
  function view(name) { ['today', 'medicines', 'history'].forEach(function (item) { document.getElementById('view-' + item).classList.toggle('hidden', item !== name); }); document.querySelectorAll('[data-view]').forEach(function (b) { b.classList.toggle('active', b.dataset.view === name); }); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  function confirmBox(title, message, actionText, action) { document.getElementById('confirm-title').textContent = title; document.getElementById('confirm-message').textContent = message; document.getElementById('accept-confirm').textContent = actionText; confirmAction = action; document.getElementById('confirm-dialog').showModal(); }
  function openNotification(row) { notificationKey = row.key; document.getElementById('notification-message').textContent = row.med.name + ' · ' + row.rule.amount + ' ' + row.med.unit + ' · 计划 ' + row.rule.time + '。请根据真实情况选择。'; document.getElementById('notification-dialog').showModal(); }
  function openAdd() { document.getElementById('add-form').reset(); document.getElementById('medicine-dose').value = 1; document.getElementById('medicine-stock').value = 30; document.getElementById('medicine-unit').value = '片'; document.getElementById('medicine-time').value = '08:00'; document.getElementById('form-error').textContent = ''; document.getElementById('add-dialog').showModal(); }
  function openReminder(m, rule) { editingMedicineId = m.id; editingReminderId = rule ? rule.id : null; document.getElementById('reminder-dialog-title').textContent = rule ? '编辑提醒' : '添加提醒'; document.getElementById('reminder-medicine-name').textContent = m.name + ' · 库存单位：' + m.unit; document.getElementById('reminder-time').value = rule ? rule.time : '08:00'; document.getElementById('reminder-dose').value = rule ? rule.amount : 1; document.querySelectorAll('#reminder-days input').forEach(function (input) { input.checked = rule ? rule.days.includes(+input.value) : true; }); document.getElementById('reminder-error').textContent = ''; document.getElementById('reminder-dialog').showModal(); }
  document.querySelectorAll('[data-view]').forEach(function (b) { b.addEventListener('click', function () { view(b.dataset.view); }); });
  document.querySelectorAll('[data-filter]').forEach(function (b) { b.addEventListener('click', function () { filter = b.dataset.filter; renderToday(); }); });
  document.getElementById('prev-day').onclick = function () { var d = dateOf(selectedDay); d.setDate(d.getDate() - 1); selectedDay = dayKey(d); renderToday(); };
  document.getElementById('next-day').onclick = function () { var d = dateOf(selectedDay); d.setDate(d.getDate() + 1); selectedDay = dayKey(d); renderToday(); };
  document.getElementById('jump-today').onclick = function () { selectedDay = dayKey(new Date()); renderToday(); };
  document.getElementById('open-add-today').onclick = openAdd; document.getElementById('open-add-medicines').onclick = openAdd;
  [['close-add', 'add-dialog'], ['cancel-add', 'add-dialog'], ['close-reminder', 'reminder-dialog'], ['cancel-reminder', 'reminder-dialog'], ['close-stock', 'stock-dialog'], ['cancel-stock', 'stock-dialog'], ['close-notification', 'notification-dialog'], ['close-confirm', 'confirm-dialog'], ['cancel-confirm', 'confirm-dialog']].forEach(function (pair) { document.getElementById(pair[0]).onclick = function () { document.getElementById(pair[1]).close(); }; });
  document.getElementById('accept-confirm').onclick = function () { document.getElementById('confirm-dialog').close(); if (confirmAction) confirmAction(); confirmAction = null; };
  document.body.addEventListener('click', function (click) {
    var b = click.target.closest('[data-action]'); if (!b) return;
    var action = b.dataset.action, m, rule, row;
    if (action === 'review-event') { selectedDay = b.dataset.key.slice(0, 10); filter = 'all'; renderToday(); view('today'); return; }
    if (action === 'add-reminder' || action === 'edit-reminder' || action === 'toggle-reminder') {
      m = med(b.dataset.med || b.dataset.id); rule = m.reminders.find(function (r) { return r.id === b.dataset.id; });
      if (action === 'toggle-reminder') { rule.active = !rule.active; save(); render(); toast(rule.active ? '提醒已启用。' : '提醒已停用，已有事件保留。'); }
      else openReminder(m, action === 'edit-reminder' ? rule : null); return;
    }
    if (action === 'stock') { m = med(b.dataset.id); stockMedicineId = m.id; document.getElementById('stock-medicine-name').textContent = m.name + ' · ' + m.unit; document.getElementById('stock-value').value = m.stock; document.getElementById('stock-error').textContent = ''; document.getElementById('stock-dialog').showModal(); return; }
    if (action === 'delete-medicine') { m = med(b.dataset.id); confirmBox('删除药品？', '将移除“' + m.name + '”及提醒规则，已完成的记录保留。', '删除药品', function () { state.medicines = state.medicines.filter(function (item) { return item.id !== m.id; }); save(); render(); toast('药品已删除。'); }); return; }
    row = rowFor(b.dataset.key); if (!row) return;
    if (action === 'raise') { raise(row); render(); openNotification(rowFor(row.key)); }
    else if (action === 'snooze') snooze(row);
    else if (action === 'taken' || action === 'skip') {
      if (action === 'taken' && row.med.stock < row.rule.amount && row.status !== 'taken') confirmBox('库存低于本次用量', '请核对真实药品。若确实已服用，仍可记录；库存不会低于 0。', '仍记为已服用', function () { outcome(rowFor(row.key), 'taken'); });
      else outcome(row, action === 'taken' ? 'taken' : 'skipped');
    }
  });
  document.querySelectorAll('[data-notification-action]').forEach(function (b) { b.onclick = function () { document.getElementById('notification-dialog').close(); var row = rowFor(notificationKey); if (!row) return; if (b.dataset.notificationAction === 'snooze') snooze(row); else outcome(row, b.dataset.notificationAction === 'taken' ? 'taken' : 'skipped'); }; });
  document.getElementById('add-form').onsubmit = function (event) {
    event.preventDefault(); var name = document.getElementById('medicine-name').value.trim(), amount = +document.getElementById('medicine-dose').value, time = document.getElementById('medicine-time').value, stock = +document.getElementById('medicine-stock').value, unit = document.getElementById('medicine-unit').value.trim(), error = document.getElementById('form-error');
    if (!name || !time || !unit || !Number.isFinite(amount) || amount <= 0 || amount > 9999 || !Number.isFinite(stock) || stock < 0 || stock > 9999) { error.textContent = '请填写有效的药品、时间、单次用量和库存。'; return; }
    if (state.medicines.some(function (item) { return item.name === name; })) { error.textContent = '药品已存在，请在其卡片中添加另一条提醒。'; return; }
    state.medicines.push({ id: id('m'), name: name, stock: stock, unit: unit, note: document.getElementById('medicine-note').value.trim(), tone: tones[state.medicines.length % 4], reminders: [{ id: id('r'), time: time, amount: amount, days: daysAll.slice(), active: true }] });
    save(); render(); document.getElementById('add-dialog').close(); view('medicines'); toast('药品及第一条每日提醒已添加。');
  };
  document.getElementById('reminder-form').onsubmit = function (event) {
    event.preventDefault(); var m = med(editingMedicineId), time = document.getElementById('reminder-time').value, amount = +document.getElementById('reminder-dose').value, days = Array.from(document.querySelectorAll('#reminder-days input:checked')).map(function (input) { return +input.value; }), error = document.getElementById('reminder-error');
    if (!time || !Number.isFinite(amount) || amount <= 0 || amount > 9999 || !days.length) { error.textContent = '请设置时间、有效用量和至少一个星期。'; return; }
    if (m.reminders.some(function (r) { return r.id !== editingReminderId && r.time === time && r.days.some(function (d) { return days.includes(d); }); })) { error.textContent = '同一药品在所选星期的这个时间已有提醒。'; return; }
    var rule = m.reminders.find(function (r) { return r.id === editingReminderId; });
    if (rule) { rule.time = time; rule.amount = amount; rule.days = days; } else m.reminders.push({ id: id('r'), time: time, amount: amount, days: days, active: true });
    save(); render(); document.getElementById('reminder-dialog').close(); toast('提醒规则已保存。');
  };
  document.getElementById('stock-form').onsubmit = function (event) { event.preventDefault(); var value = +document.getElementById('stock-value').value; if (!Number.isFinite(value) || value < 0 || value > 9999) { document.getElementById('stock-error').textContent = '请输入有效库存。'; return; } var m = med(stockMedicineId); m.stock = value; state.audit.push({ at: Date.now(), action: '修正库存', name: m.name, value: value }); save(); render(); document.getElementById('stock-dialog').close(); toast('库存已修正。'); };
  document.getElementById('simulate-reminder').onclick = function () { var all = rows(dayKey(new Date())), next = all.find(function (r) { return r.status === 'scheduled' || r.status === 'snoozed'; }) || all.find(function (r) { return r.status === 'raised'; }); if (!next) { toast('今天没有可触发的提醒。'); return; } if (next.status !== 'raised') raise(next); render(); openNotification(rowFor(next.key)); };
  document.getElementById('reset-demo').onclick = function () { confirmBox('重置演示数据？', '药品、提醒规则与记录会恢复为虚构示例。', '重置数据', function () { state = seed(); selectedDay = dayKey(new Date()); filter = 'all'; save(); reconcile(); render(); view('today'); toast('演示数据已重置。'); }); };
  document.getElementById('export-history').onclick = function () { var url = URL.createObjectURL(new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), medicines: state.medicines, events: state.events, audit: state.audit }, null, 2)], { type: 'application/json' })); var link = document.createElement('a'); link.href = url; link.download = '安心服药-演示数据.json'; link.click(); setTimeout(function () { URL.revokeObjectURL(url); }, 1000); toast('演示数据已导出。'); };
  reconcile(); render(); setInterval(reconcile, 15000);
}());
