const model = require('../../lib/model');
const app = getApp();
const STATUS = { scheduled: ['待触发', '▣'], raised: ['待处理', '♧'], snoozed: ['已延后', '◷'], taken: ['已服用', '✓'], skipped: ['已跳过', '×'] };
const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function toast(title) { wx.showToast({ title, icon: 'none' }); }
function dateTitle(day) { const d = model.dateOf(day); return (d.getMonth() + 1) + '月 ' + d.getFullYear(); }
function timeLabel(timestamp) { const d = new Date(timestamp); return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }

Page({
  data: {
    statusBarHeight: 24, tab: 'overview', screen: 'main', selectedDay: '', monthTitle: '', weekDates: [],
    filters: [{ value: 'all', label: '全部' }, { value: 'scheduled', label: '待触发' }, { value: 'raised', label: '待处理' }, { value: 'taken', label: '已服用' }, { value: 'skipped', label: '已跳过' }],
    filter: 'all', displayRows: [], medicineCards: [], analysisMode: 'chart', rangeOptions: ['7 天', '30 天'], rangeIndex: 0,
    chartBars: [], takenCount: 0, skippedCount: 0, takenRate: 0, totalEvents: 0, rangeDays: 7, concentrationSeries: [], concentrationLabels: [],
    historyRows: [], weekdayLabels: ['日', '一', '二', '三', '四', '五', '六'], calendarTitle: '', calendarCells: [], calendarEventRows: [],
    medicineNames: [], manualMedicineIndex: 0, manualAmount: '1', editingId: '', editingReminderId: '',
    familyGroup: null, familyCodeInput: '',
    formMedicine: {}, editorReminders: [], reminderTypes: ['每周固定时间', '周期疗程'], reminderTypeIndex: 0,
    formReminder: {}, reminderWeekdays: []
  },
  onLoad() {
    const info = wx.getSystemInfoSync();
    let familyGroup = null;
    try { familyGroup = wx.getStorageSync('medtimer-family-group-demo-v1') || null; } catch (_) {}
    this.setData({ statusBarHeight: info.statusBarHeight || 24, selectedDay: model.dayKey(new Date()), familyGroup });
  },
  onShow() { this.refresh(); this.timer = setInterval(() => { if (model.reconcile(app.globalData.state, new Date())) { app.persist(); this.refresh(); } }, 15000); },
  onHide() { if (this.timer) clearInterval(this.timer); },
  onUnload() { if (this.timer) clearInterval(this.timer); },
  refresh() {
    const state = app.globalData.state;
    if (!state) return;
    model.reconcile(state, new Date()); app.persist();
    const day = this.data.selectedDay || model.dayKey(new Date());
    const weekDates = model.week(day).map(value => ({ day: value, label: WEEK[model.dateOf(value).getDay()], number: +value.slice(8), selected: value === day }));
    const all = model.scheduled(state, day).map(row => this.formatRow(row));
    Object.values(state.events).filter(event => event.manual && event.day === day).forEach(event => {
      const medicine = state.medicines.find(item => item.id === event.medicineId);
      all.push({ key: event.key, medicineId: event.medicineId, name: event.name, amount: event.amount, unit: event.unit, time: event.time,
        color: medicine ? medicine.color : '#8a91aa', medicineIcon: medicine ? medicine.icon : '▣',
        status: event.status, statusText: STATUS[event.status][0] + ' · 补记', icon: STATUS[event.status][1], snoozeText: '' });
    });
    all.sort((a, b) => a.time.localeCompare(b.time));
    const selected = all.filter(row => this.data.filter === 'all' || row.status === this.data.filter || (this.data.filter === 'raised' && row.status === 'snoozed'));
    const medicineCards = state.medicines.map(medicine => ({ ...medicine, low: medicine.stock <= medicine.threshold,
      needsConcentration: !model.hasConcentrationParams(medicine), reminderCount: medicine.reminders.length,
      times: medicine.reminders.filter(rule => rule.active).map(rule => rule.time).join('、') || '已停用' }));
    const items = model.history(state);
    const rangeDays = this.data.rangeIndex ? 30 : 7;
    const rangeItems = items.filter(item => item.day >= model.plusDays(model.dayKey(new Date()), 1 - rangeDays));
    const takenCount = rangeItems.filter(item => item.status === 'taken').length;
    const skippedCount = rangeItems.filter(item => item.status === 'skipped').length;
    const bars = model.stats(state, model.dayKey(new Date()), rangeDays);
    const max = Math.max(1, ...bars.map(item => item.taken + item.skipped));
    const chartBars = bars.map((item, index) => ({ ...item,
      chartLabel: rangeDays === 7 || index % 5 === 0 || index === bars.length - 1 ? item.label : '',
      takenHeight: Math.round(item.taken / max * 100), skippedHeight: Math.round(item.skipped / max * 100) }));
    const concentrationSeries = model.concentrationSeries(state, model.dayKey(new Date()), rangeDays);
    const rangeStart = model.plusDays(model.dayKey(new Date()), 1 - rangeDays);
    const concentrationLabels = Array.from({ length: 5 }, (_, index) => model.plusDays(rangeStart, Math.floor((rangeDays - 1) * index / 4)).slice(5).replace('-', '/'));
    const historyRows = items.map(item => ({ key: item.key, timeLabel: timeLabel(item.processedAt), name: item.name,
      statusText: STATUS[item.status][0], amount: item.amount, unit: item.unit }));
    const calendar = this.buildCalendar(day, state);
    this.setData({ selectedDay: day, monthTitle: dateTitle(day), weekDates, displayRows: selected, medicineCards,
      chartBars, rangeDays, takenCount, skippedCount, takenRate: takenCount + skippedCount ? Math.round(takenCount * 100 / (takenCount + skippedCount)) : 0,
      totalEvents: items.length, historyRows, calendarTitle: calendar.title, calendarCells: calendar.cells,
      calendarEventRows: all, medicineNames: state.medicines.map(item => item.name), concentrationSeries, concentrationLabels,
      concentrationHasData: concentrationSeries.some(series => series.points.some(point => point.value > 0)) }, () => this.drawConcentration());
  },
  drawConcentration() {
    if (this.data.analysisMode !== 'concentration' || !this.data.concentrationSeries.length) return;
    wx.createSelectorQuery().in(this).select('.concentration-canvas').boundingClientRect(rect => {
      if (!rect) return;
      const context = wx.createCanvasContext('concentrationChart', this);
      const width = rect.width, height = rect.height, left = 27, right = 8, top = 12, bottom = 27;
      const plotWidth = width - left - right, plotHeight = height - top - bottom;
      context.setStrokeStyle('#c4c7d2'); context.setLineWidth(1);
      [0, 0.5, 1].forEach(ratio => { const y = top + plotHeight * ratio; context.beginPath(); context.moveTo(left, y); context.lineTo(width - right, y); context.stroke(); });
      this.data.concentrationSeries.forEach(series => {
        context.beginPath(); context.setStrokeStyle(series.color); context.setLineWidth(2);
        series.points.forEach((point, index) => {
          const x = left + point.x * plotWidth, y = top + plotHeight * (1 - point.value / 100);
          if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
        });
        context.stroke();
      });
      context.setFillStyle('#6b6f7c'); context.setFontSize(10); context.setTextAlign('center');
      this.data.concentrationLabels.forEach((label, index) => context.fillText(label, left + plotWidth * index / 4, height - 5));
      context.draw();
    }).exec();
  },
  formatRow(row) {
    return { key: row.key, medicineId: row.medicine.id, name: row.medicine.name, color: row.medicine.color,
      medicineIcon: row.medicine.icon, amount: row.reminder.amount, unit: row.medicine.unit,
      time: row.reminder.time, status: row.status, statusText: STATUS[row.status][0], icon: STATUS[row.status][1],
      snoozeText: row.status === 'snoozed' ? ' → ' + timeLabel(row.dueAt).split(' ')[1] : '' };
  },
  buildCalendar(day, state) {
    const date = model.dateOf(day), first = new Date(date.getFullYear(), date.getMonth(), 1);
    const firstDay = model.dayKey(first), start = model.plusDays(firstDay, -first.getDay());
    const cells = Array.from({ length: 42 }, (_, index) => {
      const value = model.plusDays(start, index); const dateValue = model.dateOf(value);
      return { day: value, number: dateValue.getDate(), current: dateValue.getMonth() === date.getMonth(), selected: value === day,
        hasEvent: model.scheduled(state, value).length > 0 };
    });
    return { title: dateTitle(day), cells };
  },
  switchTab(event) { this.setData({ tab: event.currentTarget.dataset.tab, screen: 'main' }); this.refresh(); },
  selectDay(event) { this.setData({ selectedDay: event.currentTarget.dataset.day }); this.refresh(); },
  previousWeek() { this.setData({ selectedDay: model.plusDays(this.data.selectedDay, -7) }); this.refresh(); },
  nextWeek() { this.setData({ selectedDay: model.plusDays(this.data.selectedDay, 7) }); this.refresh(); },
  selectFilter(event) { this.setData({ filter: event.currentTarget.dataset.filter }); this.refresh(); },
  tapStatus(event) {
    const key = event.currentTarget.dataset.key, state = app.globalData.state;
    if (key.includes(':manual-')) { toast('补记事件已保存'); return; }
    const row = model.findRow(state, key); if (!row) return;
    const actions = row.status === 'taken' ? ['改为已跳过'] : row.status === 'skipped' ? ['改为已服用'] :
      row.status === 'raised' ? ['已服用', '跳过本次', '延后 10 分钟'] : ['已服用', '跳过本次', '模拟触发提醒'];
    wx.showActionSheet({ itemList: actions, success: result => {
      const action = actions[result.tapIndex];
      if (action === '改为已跳过' || action === '跳过本次') model.outcome(state, key, 'skipped');
      else if (action === '改为已服用' || action === '已服用') model.outcome(state, key, 'taken');
      else if (action === '延后 10 分钟') model.snooze(state, key, 10);
      else model.raise(state, key);
      app.persist(); this.refresh();
    } });
  },
  openMenu() {
    const actions = ['家庭组', '模拟触发下一条提醒', '重置虚构演示数据', '关于本演示'];
    wx.showActionSheet({ itemList: actions, success: result => {
      if (result.tapIndex === 0) this.setData({ screen: 'family', familyCodeInput: '' });
      if (result.tapIndex === 1) this.simulateNext();
      if (result.tapIndex === 2) wx.showModal({ title: '重置演示数据？', content: '药品与记录将恢复为虚构示例。', success: response => {
        if (response.confirm) { app.globalData.state = model.demoSeed(); app.persist(); this.refresh(); }
      } });
      if (result.tapIndex === 3) wx.showModal({ title: 'MedTimer 小程序演示', content: '界面与核心提醒事件流程参考开源 Android 项目 MedTimer。数据只保存在本机；没有后台推送或医疗建议。', showCancel: false });
    } });
  },
  persistFamilyGroup(group) {
    try { if (group) wx.setStorageSync('medtimer-family-group-demo-v1', group); else wx.removeStorageSync('medtimer-family-group-demo-v1'); }
    catch (_) { toast('家庭组信息保存失败'); }
    this.setData({ familyGroup: group });
  },
  createFamilyGroup() { const group = model.createFamilyGroup(); this.persistFamilyGroup(group); toast('家庭组已创建'); },
  familyCodeInput(event) { this.setData({ familyCodeInput: String(event.detail.value || '').replace(/\D/g, '').slice(0, 6) }); },
  joinFamilyGroup() {
    const group = model.joinFamilyGroup(this.data.familyCodeInput);
    if (!group) { toast('请输入 6 位数字邀请码'); return; }
    this.persistFamilyGroup(group); toast('已加入家庭组（本地演示）');
  },
  copyFamilyCode() {
    const code = this.data.familyGroup && this.data.familyGroup.code;
    if (!code) return;
    wx.setClipboardData({ data: code, success: () => toast('邀请码已复制') });
  },
  leaveFamilyGroup() {
    wx.showModal({ title: '退出家庭组？', content: '退出后，本机将清除这个演示家庭组。', success: result => {
      if (result.confirm) { this.persistFamilyGroup(null); this.setData({ familyCodeInput: '' }); }
    } });
  },
  simulateNext() {
    const state = app.globalData.state;
    const row = model.scheduled(state, model.dayKey(new Date())).find(item => ['scheduled', 'snoozed'].includes(item.status));
    if (!row) { toast('今天没有待触发提醒'); return; }
    model.raise(state, row.key); app.persist(); this.refresh();
    wx.showModal({ title: '用药提醒', content: row.medicine.name + ' · ' + row.reminder.amount + ' ' + row.medicine.unit + '\n点状态图标可选择服用、跳过或延后。', showCancel: false });
  },
  openMedicine(event) { this.editMedicine(event.currentTarget.dataset.id); },
  addMedicine() { this.editMedicine(null); },
  editMedicine(medicineId) {
    const medicine = app.globalData.state.medicines.find(item => item.id === medicineId);
    const form = medicine ? clone(medicine) : { id: model.id('m'), name: '', color: '#5b6e9a', icon: '▣', stock: 0, unit: '片', threshold: 5, notes: '', tags: [], halfLifeHours: '', peakTimeHours: '', reminders: [] };
    form.tagText = form.tags.join(',');
    this.setData({ screen: 'editor', editingId: medicine ? medicine.id : '', formMedicine: form,
      editorReminders: this.formatReminders(form.reminders) });
  },
  formatReminders(reminders) { return reminders.map(rule => ({ ...rule, summary: rule.type === 'cycle' ? rule.activeDays + ' 天服用 / ' + rule.pauseDays + ' 天暂停' : (rule.days.length === 7 ? '每天' : '每周 ' + rule.days.map(day => WEEK[day]).join('、')) + (rule.active ? '' : ' · 已停用') })); },
  medicineInput(event) { const form = { ...this.data.formMedicine }; form[event.currentTarget.dataset.field] = event.detail.value; this.setData({ formMedicine: form }); },
  focusEditorField() { wx.showToast({ title: '可在下方修改库存', icon: 'none' }); },
  saveMedicine() {
    const form = this.data.formMedicine, state = app.globalData.state;
    const stock = Number(form.stock), threshold = Number(form.threshold);
    if (!form.name.trim() || !form.unit.trim() || !Number.isFinite(stock) || stock < 0 || !Number.isFinite(threshold) || threshold < 0) { toast('请填写有效的药品名称与库存'); return; }
    const halfLifeHours = form.halfLifeHours === '' || form.halfLifeHours == null ? null : Number(form.halfLifeHours);
    const peakTimeHours = form.peakTimeHours === '' || form.peakTimeHours == null ? null : Number(form.peakTimeHours);
    if ((halfLifeHours == null) !== (peakTimeHours == null) || (halfLifeHours != null && (!Number.isFinite(halfLifeHours) || halfLifeHours <= 0 || !Number.isFinite(peakTimeHours) || peakTimeHours <= 0))) { toast('半衰期和达峰时间需同时填写，且都大于 0'); return; }
    const value = { ...form, name: form.name.trim(), unit: form.unit.trim(), stock, threshold, halfLifeHours, peakTimeHours,
      tags: form.tagText.split(/[,，]/).map(tag => tag.trim()).filter(Boolean) };
    delete value.tagText;
    const index = state.medicines.findIndex(item => item.id === value.id);
    if (index < 0) { value.reminders = [{ id: model.id('r'), type: 'weekly', time: '08:00', amount: 1, days: model.ALL_DAYS.slice(), active: true }]; state.medicines.push(value); }
    else state.medicines[index] = value;
    app.persist(); this.setData({ tab: 'medicines', screen: 'main' }); this.refresh(); toast('药品已保存');
  },
  deleteMedicine() {
    const id = this.data.editingId; wx.showModal({ title: '删除药品？', content: '提醒规则将删除，已完成的事件记录保留。', success: response => {
      if (!response.confirm) return;
      app.globalData.state.medicines = app.globalData.state.medicines.filter(item => item.id !== id);
      app.persist(); this.setData({ tab: 'medicines', screen: 'main' }); this.refresh();
    } });
  },
  addReminder() { if (!this.data.editingId) { toast('请先保存药品'); return; } this.editReminder(null); },
  openReminder(event) { this.editReminder(event.currentTarget.dataset.id); },
  editReminder(reminderId) {
    const medicine = app.globalData.state.medicines.find(item => item.id === this.data.editingId);
    const rule = medicine.reminders.find(item => item.id === reminderId);
    const form = rule ? clone(rule) : { id: model.id('r'), type: 'weekly', time: '08:00', amount: 1, days: model.ALL_DAYS.slice(), active: true,
      cycleStart: model.dayKey(new Date()), activeDays: 21, pauseDays: 7 };
    form.cycleStart = form.cycleStart || model.dayKey(new Date());
    form.activeDays = form.activeDays == null ? 21 : form.activeDays;
    form.pauseDays = form.pauseDays == null ? 7 : form.pauseDays;
    form.days = form.days || model.ALL_DAYS.slice();
    this.setData({ screen: 'reminder', editingReminderId: rule ? rule.id : '', formReminder: form,
      reminderTypeIndex: form.type === 'cycle' ? 1 : 0,
      reminderWeekdays: [1, 2, 3, 4, 5, 6, 0].map(day => ({ value: day, label: WEEK[day], selected: form.days.includes(day) })) });
  },
  changeReminderType(event) { const index = Number(event.detail.value), form = { ...this.data.formReminder, type: index ? 'cycle' : 'weekly' }; this.setData({ reminderTypeIndex: index, formReminder: form }); },
  changeReminderTime(event) { this.setData({ 'formReminder.time': event.detail.value }); },
  changeCycleStart(event) { this.setData({ 'formReminder.cycleStart': event.detail.value }); },
  reminderInput(event) { const form = { ...this.data.formReminder }; form[event.currentTarget.dataset.field] = event.detail.value; this.setData({ formReminder: form }); },
  toggleWeekday(event) { const day = Number(event.currentTarget.dataset.day), form = { ...this.data.formReminder }; form.days = form.days.includes(day) ? form.days.filter(item => item !== day) : form.days.concat(day); this.setData({ formReminder: form, reminderWeekdays: this.data.reminderWeekdays.map(item => ({ ...item, selected: form.days.includes(item.value) })) }); },
  toggleReminderActive() { this.setData({ 'formReminder.active': !this.data.formReminder.active }); },
  saveReminder() {
    const state = app.globalData.state, medicine = state.medicines.find(item => item.id === this.data.editingId), form = this.data.formReminder;
    const amount = Number(form.amount), activeDays = Number(form.activeDays), pauseDays = Number(form.pauseDays);
    if (!form.time || !model.validDoseAmount(amount) || (form.type === 'weekly' && !form.days.length) ||
      (form.type === 'cycle' && (!form.cycleStart || !Number.isInteger(activeDays) || activeDays < 1 || !Number.isInteger(pauseDays) || pauseDays < 1))) { toast('请检查时间、用量（按 0.5 为单位）与重复规则'); return; }
    const value = { ...form, amount, activeDays, pauseDays };
    const index = medicine.reminders.findIndex(item => item.id === value.id);
    if (index < 0) medicine.reminders.push(value); else medicine.reminders[index] = value;
    app.persist(); this.editMedicine(medicine.id); this.refresh(); toast('提醒已保存');
  },
  deleteReminder() {
    const medicine = app.globalData.state.medicines.find(item => item.id === this.data.editingId);
    wx.showModal({ title: '删除提醒？', content: '已有事件记录仍会保留。', success: response => {
      if (!response.confirm) return;
      medicine.reminders = medicine.reminders.filter(item => item.id !== this.data.editingReminderId);
      app.persist(); this.editMedicine(medicine.id); this.refresh();
    } });
  },
  backToMain() { if (this.data.screen === 'reminder') this.editMedicine(this.data.editingId); else this.setData({ screen: 'main' }); this.refresh(); },
  openManual() { this.setData({ screen: 'manual', manualMedicineIndex: 0, manualAmount: '1' }); },
  manualSelectMedicine(event) { this.setData({ manualMedicineIndex: Number(event.detail.value) }); },
  manualAmountInput(event) { this.setData({ manualAmount: event.detail.value }); },
  saveManualDose() {
    const medicine = app.globalData.state.medicines[this.data.manualMedicineIndex];
    if (!medicine || !model.manualDose(app.globalData.state, medicine.id, Number(this.data.manualAmount))) { toast('用量需大于 0，并按 0.5 为单位填写'); return; }
    app.persist(); this.setData({ screen: 'main', tab: 'overview' }); this.refresh(); toast('已补记服药');
  },
  switchAnalysis(event) { this.setData({ analysisMode: event.currentTarget.dataset.mode }); this.refresh(); },
  changeRange(event) { const rangeIndex = Number(event.detail.value); this.setData({ rangeIndex }, () => this.refresh()); },
  previousMonth() { const date = model.dateOf(this.data.selectedDay); date.setMonth(date.getMonth() - 1, 1); this.setData({ selectedDay: model.dayKey(date) }); this.refresh(); },
  nextMonth() { const date = model.dateOf(this.data.selectedDay); date.setMonth(date.getMonth() + 1, 1); this.setData({ selectedDay: model.dayKey(date) }); this.refresh(); },
  selectCalendarDay(event) { this.setData({ selectedDay: event.currentTarget.dataset.day }); this.refresh(); }
});
