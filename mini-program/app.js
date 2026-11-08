/**
 * 「校练」小程序入口
 * 全局只保存轻量运行时状态；业务数据统一走 utils/store.js（globalData + 本地缓存）。
 */
const store = require('./utils/store');
const reminder = require('./utils/reminder');

App({
  globalData: {
    appName: '校练',
    version: '1.0.0',
    user: null,
    profile: null,
    diagnosis: null,
    plan: null,
    statusBarHeight: 20,
    systemInfo: null
  },

  onLaunch() {
    this.initSystemInfo();
    this.initUser();
    this.refreshGlobal();
    // 首次启动生成一份匿名用户编号（不使用手机号，符合数据最小化要求）
    console.log('[校练] launch, user:', this.globalData.user && this.globalData.user.user_id);
  },

  onShow() {
    // 应用内提醒兜底：刷新「打卡」tab 红点/角标（订阅消息不可用时不阻断使用）
    reminder.refreshBadge();
  },

  onHide() {},

  /** 读取窗口信息（新 API 优先，兼容旧基础库） */
  initSystemInfo() {
    let info = null;
    try {
      if (wx.getWindowInfo) {
        info = wx.getWindowInfo();
      } else {
        info = wx.getSystemInfoSync();
      }
    } catch (e) {
      info = null;
    }
    this.globalData.systemInfo = info || {};
    this.globalData.statusBarHeight = (info && info.statusBarHeight) || 20;
  },

  /** 匿名用户编号：首次启动生成并持久化，不采集与训练无关的个人信息 */
  initUser() {
    let user = store.getUser();
    if (!user || !user.user_id) {
      user = store.createUser();
    }
    this.globalData.user = user;
  },

  /** 页面在关键数据变更后调用，保持 globalData 与缓存一致 */
  refreshGlobal() {
    this.globalData.profile = store.getProfile();
    this.globalData.plan = store.getPlan();
    this.globalData.diagnosis = store.getDiagnosis();
    return this.globalData;
  }
});
