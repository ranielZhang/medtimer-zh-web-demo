(function () {
  'use strict';
  const M = window.MedTimerModel;
  const query = new URLSearchParams(window.location.search);
  const fullDemo = query.get('demo') === 'full';
  const showConcentration = fullDemo && query.get('view') === 'concentration';
  const showAnalysis = fullDemo && (showConcentration || query.get('view') === 'chart');
  const STORE = fullDemo ? 'medtimer-wechat-preview-full-demo-v2' : 'medtimer-wechat-preview-v1';
  const STATUS = { scheduled: ['待触发', '▣'], raised: ['待处理', '♧'], snoozed: ['已延后', '◷'], taken: ['已服用', '✓'], skipped: ['已跳过', '×'] };
  const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
  const app = document.getElementById('app');
  let state;
  try { state = JSON.parse(localStorage.getItem(STORE)); } catch (_) { state = null; }
  function createDemoSeed() {
    return fullDemo ? M.fullDemoSeed() : M.demoSeed();
  }
  if (!M.valid(state)) state = createDemoSeed();
  const ui = { tab: showAnalysis ? 'analysis' : 'overview', screen: 'main', day: M.dayKey(new Date()), filter: 'all', analysis: showConcentration ? 'concentration' : 'chart', range: fullDemo && query.get('range') === '30' ? 30 : 7, editingId: '', reminderId: '', form: null, rule: null, manualId: '', manualAmount: 1, sheetKey: '', menu: false };
  function esc(value) { return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])); }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function save() { try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (_) { alert('当前浏览器无法保存本地数据。'); } }
  function title(day) { const date = M.dateOf(day); return (date.getMonth() + 1) + '月 ' + date.getFullYear(); }
  function timeText(value) { const date = new Date(value); return (date.getMonth() + 1) + '/' + date.getDate() + ' ' + String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0'); }
  function med(id) { return state.medicines.find(item => item.id === id); }
  function reminderText(rule) { return rule.type === 'cycle' ? rule.activeDays + ' 天服用 / ' + rule.pauseDays + ' 天暂停' : (rule.days.length === 7 ? '每天' : '每周 ' + rule.days.map(day => WEEK[day]).join('、')) + (rule.active ? '' : ' · 已停用'); }
  function renderTop() {
    const heading = ui.screen === 'editor' ? (ui.editingId ? ui.form.name : '添加药品') : ui.screen === 'reminder' ? (ui.reminderId ? '编辑提醒' : '添加提醒') : ui.screen === 'manual' ? '补记服药' : ui.tab === 'overview' ? '主页 · ' + title(ui.day) : ui.tab === 'medicines' ? '药品' : '分析';
    return '<header class="topbar">' + (ui.screen !== 'main' ? '<button class="back" data-action="back" aria-label="返回">‹</button>' : '') + '<h1>' + esc(heading) + '</h1><button class="capsule" aria-label="微信小程序菜单">···　◯</button><button class="more" data-action="menu" aria-label="更多">⋮</button></header>';
  }
  function displayRows(day) {
    const rows = M.scheduled(state, day).map(row => ({ key: row.key, medId: row.medicine.id, name: row.medicine.name, color: row.medicine.color, icon: row.medicine.icon, amount: row.reminder.amount, unit: row.medicine.unit, time: row.reminder.time, status: row.status, due: row.dueAt }));
    Object.values(state.events).filter(event => event.manual && event.day === day).forEach(event => { const medicine = med(event.medicineId); rows.push({ key: event.key, medId: event.medicineId, name: event.name, color: medicine?.color || '#8891aa', icon: medicine?.icon || '▣', amount: event.amount, unit: event.unit, time: event.time, status: event.status, manual: true }); });
    return rows.sort((a, b) => a.time.localeCompare(b.time));
  }
  function renderOverview() {
    const week = M.week(ui.day).map(day => '<button class="week-day ' + (day === ui.day ? 'selected' : '') + '" data-action="day" data-day="' + day + '"><small>' + WEEK[M.dateOf(day).getDay()] + '</small><strong>' + +day.slice(8) + '</strong></button>').join('');
    const filters = [['all', '全部'], ['scheduled', '待触发'], ['raised', '待处理'], ['taken', '已服用'], ['skipped', '已跳过']].map(item => '<button class="' + (ui.filter === item[0] ? 'active' : '') + '" data-action="filter" data-filter="' + item[0] + '">' + item[1] + '</button>').join('');
    const rows = displayRows(ui.day).filter(row => ui.filter === 'all' || row.status === ui.filter || (ui.filter === 'raised' && row.status === 'snoozed'));
    const events = rows.map(row => '<div class="event-row"><div class="rail"><button class="status-circle ' + row.status + '" data-action="event" data-key="' + esc(row.key) + '" aria-label="处理 ' + esc(row.name) + '">' + STATUS[row.status][1] + '</button><i class="rail-line"></i></div><button class="event-card" data-action="open-med" data-id="' + esc(row.medId) + '"><span class="event-copy"><span class="event-time">▣ ' + esc(row.time) + (row.status === 'snoozed' ? ' → ' + esc(timeText(row.due).split(' ')[1]) : '') + '</span><span class="event-name">' + esc(row.name) + '</span><span class="event-dose">' + esc(row.amount + ' ' + row.unit) + ' · ' + STATUS[row.status][0] + (row.manual ? ' · 补记' : '') + '</span></span><span class="swatch" style="background:' + esc(row.color) + '">' + esc(row.icon) + '</span></button></div>').join('');
    return '<div class="week-strip"><button data-action="week-prev" aria-label="上一周">‹</button><div class="week-days">' + week + '</div><button data-action="week-next" aria-label="下一周">›</button></div><div class="filter-row">' + filters + '</div><div class="selection-actions" title="长按状态在原版可批量操作"><span>☑</span><span>⊗</span><span>♧</span><span>◷</span></div><div class="timeline">' + (events || '<div class="empty">这一天没有符合规则的提醒</div>') + '</div><p class="hint">点左侧状态图标处理提醒；点药品卡片查看药品与规则。</p>';
  }
  function renderMedicines() {
    return state.medicines.map(medicine => '<button class="medicine-card" data-action="open-med" data-id="' + esc(medicine.id) + '"><span class="medicine-top"><span class="swatch" style="background:' + esc(medicine.color) + '">' + esc(medicine.icon) + '</span><span class="medicine-text"><strong>' + esc(medicine.name) + '</strong><small>库存 ' + esc(medicine.stock + ' ' + medicine.unit) + (medicine.stock <= medicine.threshold ? '　⚠' : '') + '</small><small>' + medicine.reminders.length + ' 条提醒 · ' + esc(medicine.reminders.filter(rule => rule.active).map(rule => rule.time).join('、') || '已停用') + '</small></span><span class="drag">⠿</span></span><span class="tags">' + medicine.tags.map(tag => '<span>' + esc(tag) + '</span>').join('') + '</span></button>').join('') || '<div class="empty">还没有药品，点下方添加</div>';
  }
  function renderAnalysis() {
    const options = '<div class="analysis-switch"><button class="' + (ui.analysis === 'chart' ? 'active' : '') + '" data-action="analysis" data-mode="chart" aria-label="图表">▥</button><button class="' + (ui.analysis === 'table' ? 'active' : '') + '" data-action="analysis" data-mode="table" aria-label="表格">▦</button><button class="' + (ui.analysis === 'calendar' ? 'active' : '') + '" data-action="analysis" data-mode="calendar" aria-label="日历">▣</button><button class="' + (ui.analysis === 'concentration' ? 'active' : '') + '" data-action="analysis" data-mode="concentration" aria-label="浓度趋势">↗</button>' + (['chart', 'concentration'].includes(ui.analysis) ? '<select data-field="range" aria-label="分析时间范围"><option value="7"' + (ui.range === 7 ? ' selected' : '') + '>7 天</option><option value="30"' + (ui.range === 30 ? ' selected' : '') + '>30 天</option></select>' : '') + '</div>';
    const history = M.history(state), since = M.plusDays(M.dayKey(new Date()), 1 - ui.range);
    const period = history.filter(item => item.day >= since);
    const taken = period.filter(item => item.status === 'taken').length, skipped = period.filter(item => item.status === 'skipped').length;
    if (ui.analysis === 'chart') {
      const all = M.stats(state, M.dayKey(new Date()), ui.range); const max = Math.max(1, ...all.map(item => item.taken + item.skipped));
      const bars = all.map((item, index) => {
        const label = ui.range === 7 || index % 5 === 0 || index === all.length - 1 ? item.label : '';
        const description = item.day + '：已服用 ' + item.taken + '，已跳过 ' + item.skipped;
        return '<div class="bar-col" title="' + esc(description) + '" aria-label="' + esc(description) + '"><span class="bar-stack"><span class="bar-skipped" style="height:' + item.skipped / max * 100 + '%"></span><span class="bar-taken" style="height:' + item.taken / max * 100 + '%"></span></span></div>';
      }).join('');
      const axis = all.map((item, index) => '<span>' + esc(ui.range === 7 || index % 5 === 0 || index === all.length - 1 ? item.label : '') + '</span>').join('');
      return options + '<div class="chart-card"><div class="chart-bars ' + (ui.range === 30 ? 'range-30' : '') + '">' + bars + '</div><div class="chart-axis ' + (ui.range === 30 ? 'range-30' : '') + '">' + axis + '</div><div class="legend"><span>● 已服用</span><span>● 已跳过</span></div></div><div class="summaries"><div class="summary"><strong>最近 ' + ui.range + ' 天</strong><b>' + (taken + skipped ? Math.round(taken * 100 / (taken + skipped)) : 0) + '%</b><span>已服用 ' + taken + ' · 已跳过 ' + skipped + '</span></div><div class="summary"><strong>总记录</strong><b>' + history.length + '</b><span>每条来自用药事件</span></div></div>';
    }
    if (ui.analysis === 'concentration') {
      const series = M.concentrationSeries(state, M.dayKey(new Date()), ui.range);
      const labels = Array.from({ length: 5 }, (_, index) => { const day = M.plusDays(M.plusDays(M.dayKey(new Date()), 1 - ui.range), Math.floor((ui.range - 1) * index / 4)); return day.slice(5).replace('-', '/'); });
      const paths = series.map(item => '<polyline fill="none" stroke="' + esc(item.color) + '" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" points="' + item.points.map(point => (point.x * 1000).toFixed(1) + ',' + (220 - point.value * 1.9).toFixed(1)).join(' ') + '"></polyline>').join('');
      const graph = series.length ? '<div class="concentration-scale">相对峰值水平（每种药物按自身峰值归一）</div><svg class="concentration-svg" viewBox="0 0 1000 270" role="img" aria-label="最近 ' + ui.range + ' 天用药相对浓度趋势"><line x1="0" y1="220" x2="1000" y2="220"/><line x1="0" y1="125" x2="1000" y2="125"/><line x1="0" y1="30" x2="1000" y2="30"/>' + paths + '</svg><div class="concentration-axis">' + labels.map(label => '<span>' + label + '</span>').join('') + '</div><div class="concentration-legend">' + series.map(item => '<span><i style="background:' + esc(item.color) + '"></i>' + esc(item.name) + '（半衰期 ' + item.halfLifeHours + ' 小时，达峰 ' + item.peakTimeHours + ' 小时）</span>').join('') + '</div>' : '<div class="concentration-empty"><strong>还没有可绘制的药品</strong><p>在药品设置中填写半衰期和达峰时间，再记录服用剂量，即可查看估算趋势。</p>' + (state.medicines.length ? '<button data-action="open-med" data-id="' + esc(state.medicines[0].id) + '">去设置药品参数</button>' : '<button data-action="add-med">先添加药品</button>') + '</div>';
      const demoNote = state.demoConcentrationParams ? '<p class="concentration-note">当前测试曲线使用虚构参数（半衰期与达峰时间），只用于展示图表交互，不代表这些药品的真实药代数据。</p>' : '';
      return options + '<div class="concentration-card">' + graph + '</div>' + demoNote + '<p class="concentration-note">基于已记录的服用剂量和简化模型估算相对趋势；仅供记录参考，不代表真实血药浓度，也不构成医疗建议。</p>';
    }
    if (ui.analysis === 'table') return options + '<div class="table-card"><div class="table-row head"><span>处理时间</span><span>药品</span><span>状态</span></div>' + (history.map(item => '<div class="table-row"><span>' + esc(timeText(item.processedAt)) + '</span><span>' + esc(item.name) + '</span><span>' + STATUS[item.status][0] + '</span></div>').join('') || '<div class="empty">尚无记录</div>') + '</div>';
    const date = M.dateOf(ui.day), first = new Date(date.getFullYear(), date.getMonth(), 1), firstDay = M.dayKey(first), start = M.plusDays(firstDay, -first.getDay());
    const labels = WEEK.map(label => '<div class="calendar-cell day-label">' + label + '</div>').join('');
    const cells = Array.from({ length: 42 }, (_, i) => { const day = M.plusDays(start, i), d = M.dateOf(day), classes = ['calendar-cell', d.getMonth() !== date.getMonth() ? 'outside' : '', day === ui.day ? 'selected' : '', M.scheduled(state, day).length ? 'has-event' : ''].join(' '); return '<button class="' + classes + '" data-action="calendar-day" data-day="' + day + '">' + d.getDate() + '</button>'; }).join('');
    const daily = displayRows(ui.day).map(row => '<div>' + STATUS[row.status][1] + '　' + esc(row.time + '　' + row.name) + ' · ' + STATUS[row.status][0] + '</div>').join('') || '当天没有提醒事件';
    return options + '<div class="calendar-card"><div class="calendar-head"><button data-action="month-prev">‹</button><span>' + esc(title(ui.day)) + '⌄</span><button data-action="month-next">›</button></div><div class="calendar-grid">' + labels + cells + '</div><div class="calendar-list"><strong>' + esc(ui.day) + '</strong>' + daily + '</div></div>';
  }
  function renderEditor() {
    const m = ui.form;
    const rules = m.reminders.map(rule => '<button class="reminder-card" data-action="open-rule" data-id="' + esc(rule.id) + '"><strong>▣　' + esc(rule.time) + '</strong><small>' + esc(rule.amount + ' ' + m.unit) + ' · ' + esc(reminderText(rule)) + '</small><span class="advanced-pill">⚙　高级设置　›</span></button>').join('');
    return '<div class="editor-card"><div class="editor-head"><div class="swatch" style="background:' + esc(m.color) + '">' + esc(m.icon) + '</div><label class="field" style="flex:1;margin:0">药品名称<input data-field="name" value="' + esc(m.name) + '" placeholder="填写药品名称" maxlength="50"></label></div><div class="editor-tools"><span>⚙</span><span>▤</span><span>◇</span><span>□</span><span>▦</span></div></div><h2 class="subhead">药品信息</h2><div class="editor-card"><label class="field">备注<input data-field="notes" value="' + esc(m.notes) + '" placeholder="按已有方案填写"></label><label class="field">标签（逗号分隔）<input data-field="tags" value="' + esc(m.tags.join(',')) + '"></label><div class="field-row"><label class="field">库存<input type="number" min="0" step="0.1" data-field="stock" value="' + esc(m.stock) + '"></label><label class="field">单位<input data-field="unit" value="' + esc(m.unit) + '"></label></div><label class="field">低库存提醒阈值<input type="number" min="0" step="0.1" data-field="threshold" value="' + esc(m.threshold) + '"></label><div class="field-row"><label class="field">半衰期（小时，可选）<input type="number" min="0.1" step="0.1" data-field="halfLifeHours" value="' + esc(m.halfLifeHours ?? '') + '" placeholder="例如 8"></label><label class="field">达峰时间（小时，可选）<input type="number" min="0.1" step="0.1" data-field="peakTimeHours" value="' + esc(m.peakTimeHours ?? '') + '" placeholder="例如 1"></label></div><p class="notice">填写这两项后，可在分析页查看基于已服用记录的相对趋势估算。</p></div><h2 class="subhead">提醒</h2>' + rules + '<button class="add-rule" data-action="add-rule">⊕　添加提醒</button><div class="editor-actions"><button data-action="save-med">保存药品</button>' + (ui.editingId ? '<button class="danger" data-action="delete-med">删除药品</button>' : '') + '</div>';
  }
  function renderReminder() {
    const r = ui.rule;
    const weekdays = [1, 2, 3, 4, 5, 6, 0].map(day => '<button type="button" class="' + (r.days.includes(day) ? 'selected' : '') + '" data-action="weekday" data-day="' + day + '">' + WEEK[day] + '</button>').join('');
    return '<div class="editor-card"><label class="field">提醒类型<select data-field="type"><option value="weekly"' + (r.type === 'weekly' ? ' selected' : '') + '>每周固定时间</option><option value="cycle"' + (r.type === 'cycle' ? ' selected' : '') + '>周期疗程</option></select></label><label class="field">提醒时间<input type="time" data-field="time" value="' + esc(r.time) + '"></label><label class="field">单次用量（' + esc(ui.form.unit) + '）<input type="number" min="0.5" step="0.5" data-field="amount" value="' + esc(r.amount) + '"></label>' + (r.type === 'weekly' ? '<div class="field">每周提醒日</div><div class="weekday-choices">' + weekdays + '</div>' : '<label class="field">周期起始日<input type="date" data-field="cycleStart" value="' + esc(r.cycleStart) + '"></label><div class="field-row"><label class="field">连续服用天数<input type="number" min="1" data-field="activeDays" value="' + esc(r.activeDays) + '"></label><label class="field">暂停天数<input type="number" min="1" data-field="pauseDays" value="' + esc(r.pauseDays) + '"></label></div>') + '<label class="check-row"><input type="checkbox" data-field="active"' + (r.active ? ' checked' : '') + '>启用提醒</label></div><p class="notice">单次用量按 0.5 为单位设置。演示只在小程序打开期间计算到点状态。</p><div class="editor-actions"><button data-action="save-rule">保存提醒</button>' + (ui.reminderId ? '<button class="danger" data-action="delete-rule">删除提醒</button>' : '') + '</div>';
  }
  function renderManual() { return '<div class="editor-card"><label class="field">药品<select data-field="manualId">' + state.medicines.map(m => '<option value="' + esc(m.id) + '"' + (ui.manualId === m.id ? ' selected' : '') + '>' + esc(m.name) + '</option>').join('') + '</select></label><label class="field">实际服用数量<input type="number" min="0.5" step="0.5" data-field="manualAmount" value="' + esc(ui.manualAmount) + '"></label><p class="notice">数量按 0.5 为单位填写；补记会创建独立的已服用事件，并扣减相应库存。</p></div><div class="editor-actions"><button data-action="save-manual">记录这次服药</button></div>'; }
  function renderSheet() {
    if (!ui.sheetKey) return '';
    const row = M.findRow(state, ui.sheetKey), event = state.events[ui.sheetKey];
    if (!row && !event) return '';
    const status = row ? row.status : event.status;
    const actions = status === 'taken' ? [['skipped', '改为已跳过']] : status === 'skipped' ? [['taken', '改为已服用']] : status === 'raised' ? [['taken', '已服用'], ['skipped', '跳过本次'], ['snooze', '延后 10 分钟']] : [['taken', '已服用'], ['skipped', '跳过本次'], ['raise', '模拟触发提醒']];
    return '<div class="overlay" data-action="close-sheet"><div class="sheet" role="dialog" aria-label="处理提醒"><h2>' + esc(row ? row.medicine.name : event.name) + ' · ' + esc(row ? row.reminder.time : event.time) + '</h2>' + actions.map(item => '<button data-action="event-op" data-op="' + item[0] + '">' + item[1] + '</button>').join('') + '<button data-action="close-sheet">取消</button></div></div>';
  }
  function render() {
    const body = ui.screen === 'main' ? (ui.tab === 'overview' ? renderOverview() : ui.tab === 'medicines' ? renderMedicines() : renderAnalysis()) : ui.screen === 'editor' ? renderEditor() : ui.screen === 'reminder' ? renderReminder() : renderManual();
    const tabbar = ui.screen === 'main' ? '<nav class="tabbar" aria-label="主导航">' + [['overview', '▣', '主页'], ['medicines', '◕', '药品'], ['analysis', '▥', '分析']].map(item => '<button class="' + (ui.tab === item[0] ? 'current' : '') + '" data-action="tab" data-tab="' + item[0] + '"><b>' + item[1] + '</b><span>' + item[2] + '</span></button>').join('') + '</nav>' : '';
    const fab = ui.screen === 'main' && ui.tab !== 'analysis' ? '<button class="fab" data-action="' + (ui.tab === 'overview' ? 'manual' : 'add-med') + '">' + (ui.tab === 'overview' ? '▰　补记服药' : '⊕　添加药品') + '</button>' : '';
    app.innerHTML = renderTop() + '<main class="scroll">' + body + '</main>' + tabbar + fab + (ui.menu ? '<div class="menu-pop"><button data-action="simulate">模拟触发下一条提醒</button><button data-action="reset">重置虚构数据</button><button data-action="about">关于与限制</button></div>' : '') + renderSheet();
  }
  function openMedicine(id) {
    const medicine = med(id);
    ui.editingId = medicine ? medicine.id : '';
    ui.form = medicine ? clone(medicine) : { id: M.id('m'), name: '', color: '#5b6e9a', icon: '▣', stock: 0, unit: '片', threshold: 5, notes: '', tags: [], halfLifeHours: '', peakTimeHours: '', reminders: [] };
    ui.screen = 'editor'; render();
  }
  function saveMedicine() {
    const form = ui.form, stock = Number(form.stock), threshold = Number(form.threshold);
    if (!form.name.trim() || !form.unit.trim() || !Number.isFinite(stock) || stock < 0 || !Number.isFinite(threshold) || threshold < 0) return alert('请填写有效的药品名称、单位和库存。');
    const halfLife = form.halfLifeHours === '' || form.halfLifeHours == null ? null : Number(form.halfLifeHours);
    const peakTime = form.peakTimeHours === '' || form.peakTimeHours == null ? null : Number(form.peakTimeHours);
    if ((halfLife == null) !== (peakTime == null) || (halfLife != null && (!Number.isFinite(halfLife) || halfLife <= 0 || !Number.isFinite(peakTime) || peakTime <= 0))) return alert('半衰期和达峰时间需同时填写，且都必须大于 0。');
    form.name = form.name.trim(); form.unit = form.unit.trim(); form.stock = stock; form.threshold = threshold; form.halfLifeHours = halfLife; form.peakTimeHours = peakTime;
    const index = state.medicines.findIndex(item => item.id === form.id);
    if (index < 0) { form.reminders = [{ id: M.id('r'), type: 'weekly', time: '08:00', amount: 1, days: M.ALL_DAYS.slice(), active: true }]; state.medicines.push(clone(form)); }
    else state.medicines[index] = clone(form);
    save(); ui.screen = 'main'; ui.tab = 'medicines'; render();
  }
  function openRule(id) {
    const medicine = med(ui.editingId), rule = medicine.reminders.find(item => item.id === id);
    ui.reminderId = rule ? rule.id : '';
    ui.rule = rule ? clone(rule) : { id: M.id('r'), type: 'weekly', time: '08:00', amount: 1, days: M.ALL_DAYS.slice(), active: true, cycleStart: M.dayKey(new Date()), activeDays: 21, pauseDays: 7 };
    ui.rule.cycleStart ||= M.dayKey(new Date());
    ui.rule.activeDays ??= 21;
    ui.rule.pauseDays ??= 7;
    ui.rule.days ||= M.ALL_DAYS.slice();
    ui.screen = 'reminder'; render();
  }
  function saveRule() {
    const r = ui.rule, amount = Number(r.amount), activeDays = Number(r.activeDays), pauseDays = Number(r.pauseDays);
    if (!r.time || !M.validDoseAmount(amount) || (r.type === 'weekly' && !r.days.length) || (r.type === 'cycle' && (!r.cycleStart || !Number.isInteger(activeDays) || activeDays < 1 || !Number.isInteger(pauseDays) || pauseDays < 1))) return alert('请检查时间、用量（按 0.5 为单位）和重复规则。');
    r.amount = amount; r.activeDays = activeDays; r.pauseDays = pauseDays;
    const medicine = med(ui.editingId), index = medicine.reminders.findIndex(item => item.id === r.id);
    if (index < 0) medicine.reminders.push(clone(r)); else medicine.reminders[index] = clone(r);
    save(); openMedicine(medicine.id);
  }
  function simulate() {
    ui.menu = false;
    const row = M.scheduled(state, M.dayKey(new Date())).find(item => ['scheduled', 'snoozed'].includes(item.status));
    if (!row) { render(); return alert('今天没有待触发的提醒。'); }
    M.raise(state, row.key); save(); ui.tab = 'overview'; ui.day = M.dayKey(new Date()); ui.screen = 'main'; ui.sheetKey = row.key; render();
  }
  app.addEventListener('click', event => {
    const control = event.target.closest('[data-action]'); if (!control) return;
    const action = control.dataset.action;
    if (action === 'close-sheet' && event.target.closest('.sheet') && event.target !== control) return;
    if (action === 'tab') { ui.tab = control.dataset.tab; ui.screen = 'main'; }
    else if (action === 'day' || action === 'calendar-day') ui.day = control.dataset.day;
    else if (action === 'week-prev' || action === 'week-next') ui.day = M.plusDays(ui.day, action === 'week-prev' ? -7 : 7);
    else if (action === 'filter') ui.filter = control.dataset.filter;
    else if (action === 'analysis') ui.analysis = control.dataset.mode;
    else if (action === 'month-prev' || action === 'month-next') { const d = M.dateOf(ui.day); d.setMonth(d.getMonth() + (action === 'month-prev' ? -1 : 1), 1); ui.day = M.dayKey(d); }
    else if (action === 'menu') ui.menu = !ui.menu;
    else if (action === 'simulate') return simulate();
    else if (action === 'reset') { ui.menu = false; if (confirm('恢复为虚构示例？当前预览数据会被重置。')) { state = createDemoSeed(); save(); ui.day = M.dayKey(new Date()); ui.screen = 'main'; ui.tab = 'overview'; } }
    else if (action === 'about') { ui.menu = false; alert('本项目参考开源 Android 应用 MedTimer 的界面与事件流程。数据仅保存在本机；网页预览和小程序原型均没有后台推送或医疗建议。'); }
    else if (action === 'event') { if (control.dataset.key.includes(':manual-')) return alert('这是一条补记记录。'); ui.sheetKey = control.dataset.key; }
    else if (action === 'close-sheet') ui.sheetKey = '';
    else if (action === 'event-op') { const key = ui.sheetKey, op = control.dataset.op; if (op === 'raise') M.raise(state, key); else if (op === 'snooze') M.snooze(state, key, 10); else M.outcome(state, key, op); ui.sheetKey = ''; save(); }
    else if (action === 'open-med') { if (med(control.dataset.id)) return openMedicine(control.dataset.id); }
    else if (action === 'add-med') return openMedicine(null);
    else if (action === 'save-med') return saveMedicine();
    else if (action === 'delete-med') { if (confirm('删除药品及提醒规则？已完成的历史事件会保留。')) { state.medicines = state.medicines.filter(item => item.id !== ui.editingId); save(); ui.screen = 'main'; ui.tab = 'medicines'; } }
    else if (action === 'add-rule') { if (!ui.editingId) return alert('请先保存药品，再添加提醒。'); return openRule(null); }
    else if (action === 'open-rule') return openRule(control.dataset.id);
    else if (action === 'weekday') { const day = Number(control.dataset.day); ui.rule.days = ui.rule.days.includes(day) ? ui.rule.days.filter(item => item !== day) : ui.rule.days.concat(day); }
    else if (action === 'save-rule') return saveRule();
    else if (action === 'delete-rule') { if (confirm('删除这条提醒？')) { const medicine = med(ui.editingId); medicine.reminders = medicine.reminders.filter(item => item.id !== ui.reminderId); save(); return openMedicine(medicine.id); } }
    else if (action === 'manual') { ui.manualId = state.medicines[0]?.id || ''; ui.manualAmount = 1; ui.screen = 'manual'; }
    else if (action === 'save-manual') { if (!M.manualDose(state, ui.manualId, Number(ui.manualAmount))) return alert('请选择药品并填写有效用量。'); save(); ui.screen = 'main'; ui.tab = 'overview'; ui.day = M.dayKey(new Date()); }
    else if (action === 'back') { if (ui.screen === 'reminder') return openMedicine(ui.editingId); ui.screen = 'main'; }
    render();
  });
  app.addEventListener('input', event => {
    const field = event.target.dataset.field; if (!field) return;
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    if (ui.screen === 'editor') { if (field === 'tags') ui.form.tags = value.split(/[,，]/).map(item => item.trim()).filter(Boolean); else ui.form[field] = value; }
    else if (ui.screen === 'reminder') ui.rule[field] = value;
    else if (ui.screen === 'manual') ui[field] = value;
  });
  app.addEventListener('change', event => { if (event.target.dataset.field === 'range') { ui.range = Number(event.target.value); render(); } else if (ui.screen === 'reminder' && event.target.dataset.field === 'type') { ui.rule.type = event.target.value; render(); } });
  M.reconcile(state, new Date()); save(); render();
  setInterval(() => { if (M.reconcile(state, new Date())) { save(); render(); } }, 15000);
  document.getElementById('clock').textContent = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
}());
