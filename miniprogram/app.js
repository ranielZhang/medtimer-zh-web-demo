const model = require('./lib/model');
App({
  onLaunch() {
    let saved;
    try { saved = wx.getStorageSync('medtimer-wechat-demo-v1'); } catch (_) { saved = null; }
    this.globalData.state = model.valid(saved) ? saved : model.demoSeed();
    model.reconcile(this.globalData.state, new Date());
    this.persist();
  },
  globalData: { state: null },
  persist() {
    try { wx.setStorageSync('medtimer-wechat-demo-v1', this.globalData.state); }
    catch (_) { wx.showToast({ title: '本机保存失败', icon: 'none' }); }
  }
});
