(function () {
  'use strict';
  const M = window.MedTimerModel;
  const query = new URLSearchParams(window.location.search);
  const fullDemo = query.get('demo') === 'full';
  const familyPreview = ['caregiver', 'grandma'].includes(query.get('familyPreview')) ? query.get('familyPreview') : '';
  const showConcentration = fullDemo && query.get('view') === 'concentration';
  const showAnalysis = fullDemo && (showConcentration || query.get('view') === 'chart');
  const STORE = familyPreview ? 'medtimer-family-preview-' + familyPreview + '-v1' : fullDemo ? 'medtimer-wechat-preview-full-demo-v2' : 'medtimer-wechat-preview-v1';
  const FAMILY_PREVIEW_STATE = 'medtimer-family-preview-shared-state-v1';
  const FAMILY_PREVIEW_CODE = 'medtimer-family-preview-code-v1';
  const FAMILY_STORE = 'medtimer-family-group-demo-v1';
  const STATUS = { scheduled: ['待触发', '▣'], raised: ['待处理', '♧'], snoozed: ['已延后', '◷'], taken: ['已服用', '✓'], skipped: ['已跳过', '×'] };
  const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
  const app = document.getElementById('app');
  const familyChannel = familyPreview && typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('medtimer-family-preview-v1') : null;
  let state;
  try { state = JSON.parse(localStorage.getItem(familyPreview ? FAMILY_PREVIEW_STATE : STORE)); } catch (_) { state = null; }
  function createDemoSeed() {
    return fullDemo || familyPreview ? M.fullDemoSeed() : M.demoSeed();
  }
  if (!M.valid(state)) state = createDemoSeed();
  let familyGroup;
  try { familyGroup = JSON.parse(localStorage.getItem(FAMILY_STORE)); } catch (_) { familyGroup = null; }
  if (familyPreview) {
    let code = localStorage.getItem(FAMILY_PREVIEW_CODE);
    if (!/^\d{6}$/.test(code || '')) { code = M.createFamilyGroup().code; localStorage.setItem(FAMILY_PREVIEW_CODE, code); }
    familyGroup = { code, role: familyPreview === 'caregiver' ? 'owner' : 'member', members: [
      { id: 'caregiver', name: '周女士', relation: '女儿', role: '管理员' },
      { id: 'grandma', name: '奶奶', relation: '本人', role: '成员' }
    ] };
  }
  const ui = { tab: showAnalysis ? 'analysis' : familyPreview === 'grandma' && query.get('tab') === 'my' ? 'my' : 'overview', screen: 'main', day: M.dayKey(new Date()), filter: 'all', analysis: showConcentration ? 'concentration' : 'chart', range: fullDemo && query.get('range') === '30' ? 30 : 7, editingId: '', reminderId: '', form: null, rule: null, manualId: '', manualAmount: 1, familyInput: '', sheetKey: '', menu: false };
  function esc(value) { return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])); }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function save() {
    try {
      const serialized = JSON.stringify(state);
      localStorage.setItem(STORE, serialized);
      if (familyPreview) {
        localStorage.setItem(FAMILY_PREVIEW_STATE, serialized);
        if (familyChannel) familyChannel.postMessage({ state });
      }
    } catch (_) { alert('当前浏览器无法保存本地数据。'); }
  }
  function title(day) { const date = M.dateOf(day); return (date.getMonth() + 1) + '月 ' + date.getFullYear(); }
  function timeText(value) { const date = new Date(value); return (date.getMonth() + 1) + '/' + date.getDate() + ' ' + String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0'); }
  function med(id) { return state.medicines.find(item => item.id === id); }
  function reminderText(rule) { return rule.type === 'cycle' ? rule.activeDays + ' 天服用 / ' + rule.pauseDays + ' 天暂停' : (rule.days.length === 7 ? '每天' : '每周 ' + rule.days.map(day => WEEK[day]).join('、')) + (rule.active ? '' : ' · 已停用'); }
  function renderTop() {
    const heading = ui.screen === 'editor' ? (ui.editingId ? ui.form.name : '添加药品') : ui.screen === 'reminder' ? (ui.reminderId ? '编辑提醒' : '添加提醒') : ui.screen === 'manual' ? '补记服药' : ui.screen === 'family' ? '家庭组' : ui.screen === 'member-status' ? '奶奶的用药情况' : ui.tab === 'overview' && familyPreview === 'caregiver' ? '家庭照护' : ui.tab === 'overview' ? '主页 · ' + title(ui.day) : ui.tab === 'medicines' ? familyPreview === 'caregiver' ? '奶奶用药设置' : '药品' : ui.tab === 'analysis' ? '分析' : '我的';
    return '<header class="topbar">' + (ui.screen !== 'main' ? '<button class="back" data-action="back" aria-label="返回">‹</button>' : '') + '<h1>' + esc(heading) + '</h1><button class="capsule" aria-label="微信小程序菜单">···　◯</button><button class="more" data-action="menu" aria-label="更多">⋮</button></header>';
  }
  function displayRows(day) {
    const rows = M.scheduled(state, day).map(row => ({ key: row.key, medId: row.medicine.id, name: row.medicine.name, color: row.medicine.color, icon: row.medicine.icon, amount: row.reminder.amount, unit: row.medicine.unit, time: row.reminder.time, status: row.status, due: row.dueAt }));
    Object.values(state.events).filter(event => event.manual && event.day === day).forEach(event => { const medicine = med(event.medicineId); rows.push({ key: event.key, medId: event.medicineId, name: event.name, color: medicine?.color || '#8891aa', icon: medicine?.icon || '▣', amount: event.amount, unit: event.unit, time: event.time, status: event.status, manual: true }); });
    return rows.sort((a, b) => a.time.localeCompare(b.time));
  }
  function memberStatusCounts() {
    const rows = displayRows(M.dayKey(new Date()));
    return { rows, taken: rows.filter(row => row.status === 'taken').length, skipped: rows.filter(row => row.status === 'skipped').length, pending: rows.filter(row => !['taken', 'skipped'].includes(row.status)).length };
  }
  function renderMemberStatus() {
    const today = M.dayKey(new Date()), counts = memberStatusCounts();
    const recent = M.history(state).filter(event => event.day >= M.plusDays(today, -6)).slice(0, 8);
    const schedule = counts.rows.map(row => '<div class="member-status-row"><span class="member-status-time">' + esc(row.time) + '</span><span class="member-status-med"><strong>' + esc(row.name) + '</strong><small>' + esc(row.amount + ' ' + row.unit) + '</small></span><span class="member-status-state ' + esc(row.status) + '">' + STATUS[row.status][0] + '</span></div>').join('') || '<p class="member-status-empty">今天没有用药安排</p>';
    const history = recent.map(event => '<div class="member-history-row"><span>' + esc(timeText(event.processedAt)) + '</span><strong>' + esc(event.name) + '</strong><em>' + STATUS[event.status][0] + '</em></div>').join('') || '<p class="member-status-empty">最近 7 天没有已处理记录</p>';
    return '<div class="member-status-profile"><span class="family-avatar">奶</span><span><strong>奶奶</strong><small>家庭组成员 · 用药情况</small></span></div><div class="member-status-stats"><div><strong>' + counts.taken + '</strong><small>今日已服用</small></div><div><strong>' + counts.pending + '</strong><small>今日待服用</small></div><div><strong>' + counts.skipped + '</strong><small>今日已跳过</small></div></div><section class="member-status-section"><h2>今日用药 <small>' + esc(today) + '</small></h2>' + schedule + '</section><section class="member-status-section"><h2>最近 7 天记录</h2>' + history + '</section><p class="notice">这里查看奶奶的用药情况；服药状态由奶奶端记录并同步更新。</p>';
  }
  function renderOverview() {
    if (familyPreview === 'caregiver') {
      const counts = memberStatusCounts();
      return '<button class="caregiver-status-card" data-action="member-status"><span><strong>奶奶今日用药</strong><small>已服用 ' + counts.taken + ' · 待服用 ' + counts.pending + ' · 已跳过 ' + counts.skipped + '</small></span><b>查看详情 ›</b></button><section class="caregiver-guide"><div class="caregiver-guide-icon">⌂</div><h2>为奶奶安排用药</h2><p>你在这里添加药品和提醒，设置会同步到奶奶端。</p><div class="caregiver-guide-flow"><span>家人设置用药计划</span><b>→</b><span>奶奶端显示服药提醒</span></div><button class="family-primary" data-action="tab" data-tab="medicines">管理奶奶的药品与提醒</button><small>奶奶在自己的主页查看提醒并记录服用。</small></section>';
    }
    const week = M.week(ui.day).map(day => '<button class="week-day ' + (day === ui.day ? 'selected' : '') + '" data-action="day" data-day="' + day + '"><small>' + WEEK[M.dateOf(day).getDay()] + '</small><strong>' + +day.slice(8) + '</strong></button>').join('');
    const filters = [['all', '全部'], ['scheduled', '待触发'], ['raised', '待处理'], ['taken', '已服用'], ['skipped', '已跳过']].map(item => '<button class="' + (ui.filter === item[0] ? 'active' : '') + '" data-action="filter" data-filter="' + item[0] + '">' + item[1] + '</button>').join('');
    const rows = displayRows(ui.day).filter(row => ui.filter === 'all' || row.status === ui.filter || (ui.filter === 'raised' && row.status === 'snoozed'));
    const events = rows.map(row => '<div class="event-row"><div class="rail"><button class="status-circle ' + row.status + '" data-action="event" data-key="' + esc(row.key) + '" aria-label="处理 ' + esc(row.name) + '">' + STATUS[row.status][1] + '</button><i class="rail-line"></i></div><button class="event-card" data-action="open-med" data-id="' + esc(row.medId) + '"><span class="event-copy"><span class="event-time">▣ ' + esc(row.time) + (row.status === 'snoozed' ? ' → ' + esc(timeText(row.due).split(' ')[1]) : '') + '</span><span class="event-name">' + esc(row.name) + '</span><span class="event-dose">' + esc(row.amount + ' ' + row.unit) + ' · ' + STATUS[row.status][0] + (row.manual ? ' · 补记' : '') + '</span></span><span class="swatch" style="background:' + esc(row.color) + '">' + esc(row.icon) + '</span></button></div>').join('');
    return '<div class="week-strip"><button data-action="week-prev" aria-label="上一周">‹</button><div class="week-days">' + week + '</div><button data-action="week-next" aria-label="下一周">›</button></div><div class="filter-row">' + filters + '</div><div class="selection-actions" title="长按状态在原版可批量操作"><span>☑</span><span>⊗</span><span>♧</span><span>◷</span></div><div class="timeline">' + (events || '<div class="empty">这一天没有符合规则的提醒</div>') + '</div><p class="hint">点左侧状态图标处理提醒；点药品卡片查看药品与规则。</p>';
  }
  function renderMedicines() {
    return state.medicines.map(medicine => '<button class="medicine-card" data-action="open-med" data-id="' + esc(medicine.id) + '"><span class="medicine-top"><span class="swatch" style="background:' + esc(medicine.color) + '">' + esc(medicine.icon) + '</span><span class="medicine-text"><strong>' + esc(medicine.name) + '</strong><small>库存 ' + esc(medicine.stock + ' ' + medicine.unit) + (medicine.stock <= medicine.threshold ? '　⚠' : '') + '</small><small>' + medicine.reminders.length + ' 条提醒 · ' + esc(medicine.reminders.filter(rule => rule.active).map(rule => rule.time).join('、') || '已停用') + '</small></span><span class="drag">⠿</span></span><span class="tags">' + medicine.tags.map(tag => '<span>' + esc(tag) + '</span>').join('') + '</span></button>').join('') || '<div class="empty">还没有药品，点下方添加</div>';
  }
  function renderMine() {
    const familySummary = familyGroup ? '邀请码 ' + familyGroup.code + ' · ' + (familyGroup.role === 'owner' ? '管理员' : '成员') : '邀请家人一起管理用药安排';
    const profile = familyPreview === 'caregiver' ? '周女士 · 家庭组创建者' : familyPreview === 'grandma' ? '奶奶 · 家庭组普通成员' : '本机演示账户';
    const storage = familyPreview ? '与另一部手机演示实时联动' : '数据保存在当前设备';
    return '<section class="mine-profile"><div class="mine-avatar">我</div><div><strong>' + profile + '</strong><small>' + storage + '</small></div><span class="mine-chevron">›</span></section><div class="mine-stats"><div><strong>' + state.medicines.length + '</strong><small>种药品</small></div><div><strong>' + M.history(state).length + '</strong><small>条用药记录</small></div></div>' + (familyPreview === 'caregiver' ? '<button class="mine-row" data-action="member-status"><span class="mine-row-icon">♡</span><span><strong>奶奶的用药情况</strong><small>查看今日状态和近期记录</small></span><b>›</b></button>' : '') + '<button class="mine-row" data-action="family"><span class="mine-row-icon">⌂</span><span><strong>家庭组</strong><small>' + esc(familySummary) + '</small></span><b>›</b></button><button class="mine-row" data-action="about"><span class="mine-row-icon">ⓘ</span><span><strong>关于 MedTimer</strong><small>功能说明与演示边界</small></span><b>›</b></button><p class="notice">家庭成员协作需要获得长辈授权。' + (familyPreview ? '当前双手机联动仅在同一浏览器中模拟。' : '当前演示尚未连接云端，成员关系和药品数据不会跨设备同步。') + '</p>';
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
  function renderFamily() {
    const demoNote = '<p class="notice">当前是本地演示：家庭组与邀请码只保存在本机，无法跨设备核验或同步药品数据。真实使用需要接入云端账号、成员权限和数据同步。</p>';
    if (!familyGroup) return '<section class="family-intro"><div class="family-icon">⌂</div><h2>家人一起，把用药安排好</h2><p>家人可以先创建家庭组，再把邀请码告诉长辈；长辈输入邀请码即可加入。</p></section><div class="family-card"><h3>创建家庭组</h3><p>由负责设置的家人发起，创建后获得 6 位随机邀请码。</p><button class="family-primary" data-action="create-family">创建家庭组并生成邀请码</button></div><div class="family-card"><h3>加入家庭组</h3><label class="field">输入家人分享的 6 位邀请码<input data-field="familyInput" inputmode="numeric" maxlength="6" placeholder="例如 582731" value="' + esc(ui.familyInput) + '"></label><button class="family-secondary" data-action="join-family">加入家庭组</button></div>' + demoNote;
    const members = (familyGroup.members || []).map(member => '<div class="family-member"><span class="family-avatar">' + (member.role === '管理员' ? '家' : '我') + '</span><span><strong>' + esc(member.name) + '</strong><small>' + esc(member.relation) + ' · ' + esc(member.role) + '</small></span>' + (member.role === '管理员' ? '<em>组长</em>' : '') + '</div>').join('');
    return '<div class="family-card family-code-card"><span class="family-eyebrow">家庭组邀请码</span><strong class="family-code">' + esc(familyGroup.code) + '</strong><p>把这串 6 位码告诉家人，对方即可在家庭组页面输入加入。</p><button class="family-primary" data-action="copy-family-code">复制邀请码</button></div><div class="family-card"><h3>家庭成员</h3>' + members + '</div><p class="notice">' + (familyGroup.role === 'owner' ? '你是家庭组管理员。真实版本接入云端同步并获得授权后，才可协助长辈设置用药计划。' : '你已加入家庭组演示。真实版本需在获得授权后才能查看或协助设置用药计划。') + '</p><button class="family-leave" data-action="leave-family">退出家庭组</button>' + demoNote;
  }
  function renderSheet() {
    if (!ui.sheetKey) return '';
    const row = M.findRow(state, ui.sheetKey), event = state.events[ui.sheetKey];
    if (!row && !event) return '';
    const status = row ? row.status : event.status;
    const actions = status === 'taken' ? [['skipped', '改为已跳过']] : status === 'skipped' ? [['taken', '改为已服用']] : status === 'raised' ? [['taken', '已服用'], ['skipped', '跳过本次'], ['snooze', '延后 10 分钟']] : [['taken', '已服用'], ['skipped', '跳过本次'], ['raise', '模拟触发提醒']];
    return '<div class="overlay" data-action="close-sheet"><div class="sheet" role="dialog" aria-label="处理提醒"><h2>' + esc(row ? row.medicine.name : event.name) + ' · ' + esc(row ? row.reminder.time : event.time) + '</h2>' + actions.map(item => '<button data-action="event-op" data-op="' + item[0] + '">' + item[1] + '</button>').join('') + '<button data-action="close-sheet">取消</button></div></div>';
  }
  function render() {
    const body = ui.screen === 'main' ? (ui.tab === 'overview' ? renderOverview() : ui.tab === 'medicines' ? renderMedicines() : ui.tab === 'analysis' ? renderAnalysis() : renderMine()) : ui.screen === 'editor' ? renderEditor() : ui.screen === 'reminder' ? renderReminder() : ui.screen === 'family' ? renderFamily() : ui.screen === 'member-status' ? renderMemberStatus() : renderManual();
    const tabbar = ui.screen === 'main' ? '<nav class="tabbar" aria-label="主导航">' + [['overview', '▣', familyPreview === 'caregiver' ? '照护' : '主页'], ['medicines', '◕', familyPreview === 'caregiver' ? '奶奶用药' : '药品'], ['analysis', '▥', '分析'], ['my', '♙', '我的']].map(item => '<button class="' + (ui.tab === item[0] ? 'current' : '') + '" data-action="tab" data-tab="' + item[0] + '"><b>' + item[1] + '</b><span>' + item[2] + '</span></button>').join('') + '</nav>' : '';
    const fab = ui.screen === 'main' && ['overview', 'medicines'].includes(ui.tab) ? '<button class="fab" data-action="' + (ui.tab === 'overview' && familyPreview !== 'caregiver' ? 'manual' : ui.tab === 'overview' ? 'tab' : 'add-med') + '"' + (ui.tab === 'overview' && familyPreview === 'caregiver' ? ' data-tab="medicines"' : '') + '>' + (ui.tab === 'overview' ? familyPreview === 'caregiver' ? '⊕　添加奶奶的用药提醒' : '▰　补记服药' : '⊕　添加药品') + '</button>' : '';
    app.innerHTML = renderTop() + '<main class="scroll">' + body + '</main>' + tabbar + fab + (ui.menu ? '<div class="menu-pop"><button data-action="family">⌂　家庭组</button>' + (familyPreview === 'caregiver' ? '' : '<button data-action="simulate">模拟触发下一条提醒</button>') + '<button data-action="reset">重置虚构数据</button><button data-action="about">关于与限制</button></div>' : '') + renderSheet();
  }
  function applyFamilyPreviewState(nextState) {
    if (!familyPreview || !M.valid(nextState)) return;
    state = clone(nextState);
    try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (_) {}
    render();
  }
  if (familyChannel) familyChannel.onmessage = event => applyFamilyPreviewState(event.data && event.data.state);
  if (familyPreview) window.addEventListener('storage', event => {
    if (event.key === FAMILY_PREVIEW_STATE && event.newValue) {
      try { applyFamilyPreviewState(JSON.parse(event.newValue)); } catch (_) {}
    }
  });
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
    else if (action === 'family') { ui.menu = false; ui.screen = 'family'; ui.familyInput = ''; }
    else if (action === 'member-status' && familyPreview === 'caregiver') { ui.menu = false; ui.screen = 'member-status'; }
    else if (action === 'create-family') { familyGroup = M.createFamilyGroup(); localStorage.setItem(FAMILY_STORE, JSON.stringify(familyGroup)); ui.screen = 'family'; }
    else if (action === 'join-family') { const group = M.joinFamilyGroup(ui.familyInput); if (!group) return alert('请输入 6 位数字邀请码。'); familyGroup = group; localStorage.setItem(FAMILY_STORE, JSON.stringify(familyGroup)); ui.screen = 'family'; alert('已加入家庭组（本地演示）。'); }
    else if (action === 'copy-family-code') { if (navigator.clipboard && familyGroup) navigator.clipboard.writeText(familyGroup.code).then(() => alert('邀请码已复制。')).catch(() => alert('邀请码：' + familyGroup.code)); else if (familyGroup) alert('邀请码：' + familyGroup.code); }
    else if (action === 'leave-family') { if (confirm('确定退出这个家庭组？')) { familyGroup = null; localStorage.removeItem(FAMILY_STORE); ui.familyInput = ''; } }
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
    else if (ui.screen === 'family') ui[field] = value.replace(/\D/g, '').slice(0, 6);
  });
  app.addEventListener('change', event => { if (event.target.dataset.field === 'range') { ui.range = Number(event.target.value); render(); } else if (ui.screen === 'reminder' && event.target.dataset.field === 'type') { ui.rule.type = event.target.value; render(); } });
  M.reconcile(state, new Date()); save(); render();
  setInterval(() => { if (M.reconcile(state, new Date())) { save(); render(); } }, 15000);
  document.getElementById('clock').textContent = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
}());
