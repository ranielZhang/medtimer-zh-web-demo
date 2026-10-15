(function () {
  'use strict';

  var STORAGE_KEY = 'medtimer-zh-demo-v1';
  var tones = ['green', 'orange', 'blue', 'purple'];
  var symbols = ['✦', '✳', '●', '◆'];
  var toastTimer;
  var confirmAction = null;
  var state = loadState();

  function localDay() {
    var now = new Date();
    return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
  }

  function seedState() {
    return {
      medicines: [
        { id: 'm1', name: '示例药品 A', dose: '1 片', time: '08:00', stock: 18, unit: '片', note: '早餐后', tone: 'green' },
        { id: 'm2', name: '示例药品 B', dose: '1 粒', time: '12:30', stock: 8, unit: '粒', note: '午餐后', tone: 'orange' },
        { id: 'm3', name: '示例药品 C', dose: '1 片', time: '20:00', stock: 24, unit: '片', note: '按已有计划服用', tone: 'blue' }
      ],
      daily: {},
      history: []
    };
  }

  function loadState() {
    try {
      var saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved && Array.isArray(saved.medicines) && saved.daily && Array.isArray(saved.history)) return saved;
    } catch (error) { /* Damaged local data falls back to the sample. */ }
    return seedState();
  }

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch (error) { toast('浏览器未能保存数据，请检查存储权限。'); }
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (char) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
    });
  }

  function prettyDate(date) {
    return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }).format(date);
  }

  function formatStamp(stamp) {
    return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(stamp));
  }

  function todayEntries() {
    var day = localDay();
    return state.medicines.slice().sort(function (a, b) { return a.time.localeCompare(b.time); }).map(function (medicine) {
      var key = day + ':' + medicine.id;
      return { medicine: medicine, key: key, entry: state.daily[key] || { status: 'pending' } };
    });
  }

  function statusLabel(status) {
    return { pending: '待确认', taken: '已服用', skipped: '已跳过', snoozed: '稍后提醒' }[status] || '待确认';
  }

  function iconFor(medicine) {
    var index = tones.indexOf(medicine.tone);
    return '<div class="drug-icon ' + escapeHtml(medicine.tone) + '" aria-hidden="true">' + symbols[Math.max(index, 0)] + '</div>';
  }

  function nextEntry(entries) {
    var candidates = entries.filter(function (item) { return item.entry.status === 'pending' || item.entry.status === 'snoozed'; });
    return candidates[0] || null;
  }

  function renderToday() {
    var entries = todayEntries();
    document.getElementById('today-date').textContent = prettyDate(new Date());
    var done = entries.filter(function (item) { return item.entry.status === 'taken'; }).length;
    var next = nextEntry(entries);
    document.getElementById('progress-done').textContent = String(done);
    document.getElementById('progress-total').textContent = '/ ' + entries.length + ' 次';
    document.getElementById('progress-fill').style.width = (entries.length ? done / entries.length * 100 : 0) + '%';
    document.getElementById('progress-caption').textContent = entries.length ? '今天还有 ' + entries.filter(function (item) { return item.entry.status === 'pending' || item.entry.status === 'snoozed'; }).length + ' 次待处理的提醒' : '添加第一种药品，开始制定计划';

    var hero = document.getElementById('next-dose');
    if (!next) {
      hero.innerHTML = '<div class="hero-empty">' + (entries.length ? '今天的计划已处理完毕' : '今天还没有用药计划') + '</div><div class="hero-meta">' + (entries.length ? '您可以在服药记录中回顾操作。' : '添加药品后，这里会显示下一次提醒。') + '</div>';
    } else {
      var medicine = next.medicine;
      var time = next.entry.status === 'snoozed' && next.entry.until ? next.entry.until : medicine.time;
      hero.innerHTML = '<div class="hero-time">' + escapeHtml(time) + '</div><div class="hero-drug">' + escapeHtml(medicine.name) + '</div><div class="hero-meta">' + escapeHtml(medicine.dose) + ' · ' + escapeHtml(medicine.note || '按已有用药计划') + '</div><div class="hero-actions"><button type="button" data-action="taken" data-id="' + escapeHtml(medicine.id) + '">✓ 已服用</button><button class="secondary" type="button" data-action="snooze" data-id="' + escapeHtml(medicine.id) + '">◷ 10 分钟后查看</button></div>';
    }

    var list = document.getElementById('schedule-list');
    if (!entries.length) {
      list.innerHTML = '<div class="empty-state"><span>▤</span>还没有药品。添加药品后，今日计划会显示在这里。</div>';
    } else {
      list.innerHTML = entries.map(function (item) {
        var medicine = item.medicine;
        var status = item.entry.status;
        var actions = status === 'pending' || status === 'snoozed'
          ? '<button type="button" data-action="taken" data-id="' + escapeHtml(medicine.id) + '">已服用</button><button class="subtle" type="button" data-action="skip" data-id="' + escapeHtml(medicine.id) + '">跳过</button>'
          : '<button class="subtle" type="button" data-action="undo" data-id="' + escapeHtml(medicine.id) + '">撤销记录</button>';
        return '<div class="schedule-item"><div class="schedule-time">' + escapeHtml(medicine.time) + '</div><div class="schedule-center">' + iconFor(medicine) + '<div><div class="schedule-name">' + escapeHtml(medicine.name) + '</div><div class="schedule-detail">' + escapeHtml(medicine.dose) + ' · ' + escapeHtml(medicine.note || '按已有用药计划') + '</div></div></div><div class="schedule-actions"><span class="status ' + escapeHtml(status) + '">● ' + statusLabel(status) + '</span>' + actions + '</div></div>';
      }).join('');
    }
    var low = state.medicines.filter(function (medicine) { return medicine.stock <= 5; });
    document.getElementById('stock-insight').textContent = low.length ? low.map(function (medicine) { return medicine.name; }).join('、') + ' 库存较少，请按实际需要检查。' : '当前示例药品库存充足。库存随“已服用”记录更新。';
  }

  function renderMedicines() {
    document.getElementById('medicine-count').textContent = state.medicines.length + ' 种';
    var list = document.getElementById('medicine-list');
    if (!state.medicines.length) {
      list.innerHTML = '<div class="empty-state"><span>＋</span>药品清单为空。点击“添加药品”开始。</div>';
      return;
    }
    list.innerHTML = state.medicines.map(function (medicine) {
      var low = medicine.stock <= 5;
      return '<article class="medicine-card"><div class="medicine-card-top">' + iconFor(medicine) + '<div><div class="medicine-card-name">' + escapeHtml(medicine.name) + '</div><div class="medicine-card-note">' + escapeHtml(medicine.note || '按已有用药计划') + '</div></div></div><div class="medicine-card-body"><div><small>提醒时间</small><strong>' + escapeHtml(medicine.time) + '</strong></div><div><small>单次用量</small><strong>' + escapeHtml(medicine.dose) + '</strong></div></div><div class="medicine-card-foot"><span class="' + (low ? 'stock-low' : '') + '">● 库存 ' + escapeHtml(medicine.stock) + ' ' + escapeHtml(medicine.unit) + (low ? ' · 请检查' : '') + '</span><button type="button" data-action="delete" data-id="' + escapeHtml(medicine.id) + '">删除药品</button></div></article>';
    }).join('');
  }

  function renderHistory() {
    var items = state.history.slice().sort(function (a, b) { return b.at - a.at; });
    document.getElementById('history-count').textContent = '共 ' + items.length + ' 条';
    document.getElementById('history-list').innerHTML = items.length ? items.map(function (entry) {
      var mark = entry.status === 'taken' ? '✓' : entry.status === 'skipped' ? '–' : '◷';
      return '<div class="history-item"><span class="history-dot ' + escapeHtml(entry.status) + '">' + mark + '</span><div><strong>' + escapeHtml(entry.name) + ' · ' + statusLabel(entry.status) + '</strong><small>' + escapeHtml(entry.dose) + (entry.status === 'taken' ? ' · 手动确认' : '') + '</small></div><span class="history-time">' + escapeHtml(formatStamp(entry.at)) + '</span></div>';
    }).join('') : '<div class="empty-state"><span>◷</span>目前没有操作记录。您可以从今日计划开始。</div>';
  }

  function render() { renderToday(); renderMedicines(); renderHistory(); }

  function toast(message) {
    var element = document.getElementById('toast');
    element.textContent = message;
    element.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { element.classList.remove('show'); }, 3300);
  }

  function showView(view) {
    ['today', 'medicines', 'history'].forEach(function (name) {
      document.getElementById('view-' + name).classList.toggle('hidden', name !== view);
    });
    document.querySelectorAll('[data-view]').forEach(function (button) { button.classList.toggle('active', button.dataset.view === view); });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function confirmDialog(title, message, actionText, action) {
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-message').textContent = message;
    document.getElementById('accept-confirm').textContent = actionText || '确认';
    confirmAction = action;
    document.getElementById('confirm-dialog').showModal();
  }

  function addHistory(medicine, status) {
    state.history.push({ id: String(Date.now()) + ':' + Math.random().toString(36).slice(2), medicineId: medicine.id, name: medicine.name, dose: medicine.dose, status: status, at: Date.now(), day: localDay() });
  }

  function actOnMedicine(action, id) {
    var medicine = state.medicines.find(function (item) { return item.id === id; });
    if (!medicine) return;
    var key = localDay() + ':' + medicine.id;
    var current = state.daily[key] || { status: 'pending' };
    if (action === 'taken' || action === 'skip') {
      if (current.status === 'taken' || current.status === 'skipped') return;
      var nextStatus = action === 'taken' ? 'taken' : 'skipped';
      if (nextStatus === 'taken' && medicine.stock <= 0) {
        confirmDialog('库存显示为 0', '请先核对实际药品情况。若确实已经服用，仍可记录这次服药。', '仍记为已服用', function () { completeDose(medicine, key, nextStatus); });
        return;
      }
      completeDose(medicine, key, nextStatus);
    } else if (action === 'snooze') {
      var due = new Date(Date.now() + 10 * 60 * 1000);
      state.daily[key] = { status: 'snoozed', until: String(due.getHours()).padStart(2, '0') + ':' + String(due.getMinutes()).padStart(2, '0') };
      addHistory(medicine, 'snoozed');
      save(); render(); toast('已设置为 10 分钟后再次查看（仅演示页内状态）。');
    } else if (action === 'undo') {
      if (current.status === 'taken') medicine.stock += current.deducted || 0;
      delete state.daily[key];
      var index = state.history.findIndex(function (entry) { return entry.medicineId === id && entry.day === localDay() && entry.status === current.status; });
      if (index >= 0) state.history.splice(index, 1);
      save(); render(); toast('已撤销本次记录。');
    } else if (action === 'delete') {
      confirmDialog('删除药品？', '将从清单与今日计划移除“' + medicine.name + '”。已有服药历史会保留。', '删除药品', function () {
        state.medicines = state.medicines.filter(function (item) { return item.id !== id; });
        delete state.daily[key];
        save(); render(); toast('药品已删除。');
      });
    }
  }

  function doseQuantity(dose, unit) {
    var normalized = String(dose).replace(/\s/g, '');
    var match = normalized.match(/^(\d+(?:\.\d+)?)\s*(.*)$/);
    return match && match[2] === unit ? Number(match[1]) : 0;
  }

  function completeDose(medicine, key, status) {
    var deducted = status === 'taken' ? Math.min(medicine.stock, doseQuantity(medicine.dose, medicine.unit)) : 0;
    state.daily[key] = { status: status, deducted: deducted };
    medicine.stock -= deducted;
    addHistory(medicine, status);
    save(); render(); toast(status === 'taken' ? '已记录您确认服用：' + medicine.name : '已记录本次跳过：' + medicine.name);
  }

  function openAdd() {
    document.getElementById('add-form').reset();
    document.getElementById('medicine-time').value = '08:00';
    document.getElementById('medicine-stock').value = '30';
    document.getElementById('medicine-unit').value = '片';
    document.getElementById('form-error').textContent = '';
    document.getElementById('add-dialog').showModal();
    document.getElementById('medicine-name').focus();
  }

  document.querySelectorAll('[data-view]').forEach(function (button) { button.addEventListener('click', function () { showView(button.dataset.view); }); });
  document.getElementById('open-add-today').addEventListener('click', openAdd);
  document.getElementById('open-add-medicines').addEventListener('click', openAdd);
  document.getElementById('close-add').addEventListener('click', function () { document.getElementById('add-dialog').close(); });
  document.getElementById('cancel-add').addEventListener('click', function () { document.getElementById('add-dialog').close(); });
  document.getElementById('close-confirm').addEventListener('click', function () { document.getElementById('confirm-dialog').close(); });
  document.getElementById('cancel-confirm').addEventListener('click', function () { document.getElementById('confirm-dialog').close(); });
  document.getElementById('accept-confirm').addEventListener('click', function () {
    document.getElementById('confirm-dialog').close();
    if (confirmAction) confirmAction();
    confirmAction = null;
  });
  document.body.addEventListener('click', function (event) {
    var button = event.target.closest('[data-action]');
    if (button) actOnMedicine(button.dataset.action, button.dataset.id);
  });
  document.getElementById('add-form').addEventListener('submit', function (event) {
    event.preventDefault();
    var name = document.getElementById('medicine-name').value.trim();
    var dose = document.getElementById('medicine-dose').value.trim();
    var time = document.getElementById('medicine-time').value;
    var stock = Number(document.getElementById('medicine-stock').value);
    var unit = document.getElementById('medicine-unit').value.trim();
    var note = document.getElementById('medicine-note').value.trim();
    var error = document.getElementById('form-error');
    if (!name || !dose || !time || !unit || !Number.isFinite(stock) || stock < 0 || stock > 9999) { error.textContent = '请填写药品名称、单次用量、提醒时间和有效库存。'; return; }
    if (state.medicines.some(function (item) { return item.name === name && item.time === time; })) { error.textContent = '相同药品在这个时间已有提醒。'; return; }
    state.medicines.push({ id: 'm' + Date.now(), name: name, dose: dose, time: time, stock: stock, unit: unit, note: note, tone: tones[state.medicines.length % tones.length] });
    save(); render(); document.getElementById('add-dialog').close(); showView('medicines'); toast('药品已添加到今日计划。');
  });
  document.getElementById('simulate-reminder').addEventListener('click', function () {
    var next = nextEntry(todayEntries());
    if (!next) { toast('当前没有待处理的提醒。'); return; }
    confirmDialog('模拟到点提醒', next.medicine.name + ' · ' + next.medicine.dose + '。请按实际服药情况决定是否确认。', '已服用', function () { actOnMedicine('taken', next.medicine.id); });
  });
  document.getElementById('reset-demo').addEventListener('click', function () {
    confirmDialog('重置演示数据？', '当前浏览器中的药品与操作记录将恢复为初始示例。', '重置数据', function () { state = seedState(); save(); render(); showView('today'); toast('演示数据已重置。'); });
  });
  document.getElementById('export-history').addEventListener('click', function () {
    var blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), history: state.history }, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a'); link.href = url; link.download = '安心服药-服药记录.json'; link.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    toast('记录已导出为 JSON 文件。');
  });

  render();
}());
