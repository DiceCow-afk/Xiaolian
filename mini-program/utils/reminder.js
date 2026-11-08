/**
 * 提醒与订阅消息
 *  - 微信订阅消息：体育类 / 个人主体基本只能拿到「一次性订阅」，模板 ID 需审核后填入 config
 *  - 应用内提醒兜底：训练日未打卡时在「打卡」tab 显示角标 + 页面提醒卡，保证不阻断使用
 *  - 服务端定时推送由后端 FastAPI 的 cron/APScheduler 完成，本项目前端只负责授权与展示
 */
const config = require('./config');
const store = require('./store');
const util = require('./util');
const rules = require('../data/rules');

/** 在计划中找今天（或指定日期）的训练日 */
function findSessionByDate(plan, dateStr) {
  if (!plan || !plan.weeks) return null;
  const date = dateStr || util.todayStr();
  for (let i = 0; i < plan.weeks.length; i++) {
    const sessions = plan.weeks[i].sessions || [];
    for (let j = 0; j < sessions.length; j++) {
      if (sessions[j].date === date) {
        return {
          week: plan.weeks[i],
          session: sessions[j]
        };
      }
    }
  }
  return null;
}

/** 今天是否有训练 */
function getTodayTraining() {
  const plan = store.getPlan();
  if (!plan) return null;
  return findSessionByDate(plan, util.todayStr());
}

/** 下一个训练日（含今天） */
function getNextTraining() {
  const plan = store.getPlan();
  if (!plan || !plan.weeks) return null;
  const today = util.todayStr();
  const candidates = [];
  plan.weeks.forEach(function (week) {
    (week.sessions || []).forEach(function (session) {
      if (session.date >= today) {
        candidates.push({ week: week, session: session });
      }
    });
  });
  candidates.sort(function (a, b) {
    return a.session.date < b.session.date ? -1 : 1;
  });
  return candidates[0] || null;
}

/** 刷新「打卡」tab 角标（应用内提醒兜底） */
function refreshBadge() {
  try {
    if (!rules.REMINDER_TABLE.in_app_badge) return;
    const training = getTodayTraining();
    if (!training) {
      wx.removeTabBarBadge({ index: 1, fail: function () {} });
      return;
    }
    const settings = store.getReminderSettings();
    if (!settings.enabled) {
      wx.removeTabBarBadge({ index: 1, fail: function () {} });
      return;
    }
    const checkin = store.getTodayCheckin();
    const finished = checkin && checkin.status && checkin.status !== 'skipped';
    if (finished) {
      wx.removeTabBarBadge({ index: 1, fail: function () {} });
    } else {
      wx.setTabBarBadge({ index: 1, text: '今日', fail: function () {} });
    }
  } catch (e) {
    console.warn('[reminder] refreshBadge fail', e);
  }
}

/**
 * 请求一次性订阅消息授权（在自然节点调用：查看计划 / 打卡成功）
 * @returns {Promise<{available:boolean, mode:string, quota:number, message:string}>}
 */
function requestSubscribe() {
  return new Promise(function (resolve) {
    const tmplIds = config.subscribeTmplIds || [];
    if (!tmplIds.length || !wx.requestSubscribeMessage) {
      // 模板未配置 / 基础库不支持：降级为应用内提醒，不阻断主流程
      store.saveReminderSettings({ channel: 'in_app' });
      resolve({
        available: false,
        mode: 'in_app',
        quota: store.getSubscription().quota || 0,
        message: '订阅消息模板尚未配置，已为你启用「应用内提醒」兜底（训练日会在「打卡」tab 显示角标）'
      });
      return;
    }
    wx.requestSubscribeMessage({
      tmplIds: tmplIds,
      success: function (res) {
        const accepted = tmplIds.filter(function (id) {
          return res[id] === 'accept';
        });
        const sub = store.getSubscription();
        if (accepted.length > 0) {
          sub.quota = (Number(sub.quota) || 0) + accepted.length * rules.REMINDER_TABLE.quota_per_auth;
          sub.total_auth = (Number(sub.total_auth) || 0) + 1;
          sub.last_auth_at = new Date().toISOString();
          store.saveSubscription(sub);
          store.saveReminderSettings({ channel: 'subscribe' });
          resolve({
            available: true,
            mode: 'subscribe',
            quota: sub.quota,
            message: '订阅成功：服务端将在训练日按你的提醒时间推送 1 条提醒'
          });
        } else {
          store.saveReminderSettings({ channel: 'in_app' });
          resolve({
            available: false,
            mode: 'in_app',
            quota: sub.quota || 0,
            message: '你暂未授权订阅消息，已保留应用内提醒兜底'
          });
        }
      },
      fail: function (err) {
        console.warn('[reminder] requestSubscribeMessage fail', err);
        store.saveReminderSettings({ channel: 'in_app' });
        resolve({
          available: false,
          mode: 'in_app',
          quota: store.getSubscription().quota || 0,
          message: '订阅消息暂不可用（模板审核中/开发者工具限制），已启用应用内提醒兜底'
        });
      }
    });
  });
}

/** 提醒状态汇总（打卡页展示） */
function getReminderStatus() {
  const settings = store.getReminderSettings();
  const subscription = store.getSubscription();
  const todayTraining = getTodayTraining();
  const todayCheckin = store.getTodayCheckin();
  const nextTraining = getNextTraining();
  return {
    settings: settings,
    subscription: subscription,
    template_ready: (config.subscribeTmplIds || []).length > 0,
    today_session: todayTraining ? todayTraining.session : null,
    today_week_no: todayTraining ? todayTraining.week.week_no : null,
    today_checked: !!(todayCheckin && todayCheckin.status && todayCheckin.status !== 'skipped'),
    next_training: nextTraining ? nextTraining.session : null,
    server_cron: rules.REMINDER_TABLE.server_cron,
    quota_per_auth: rules.REMINDER_TABLE.quota_per_auth
  };
}

module.exports = {
  findSessionByDate: findSessionByDate,
  getTodayTraining: getTodayTraining,
  getNextTraining: getNextTraining,
  refreshBadge: refreshBadge,
  requestSubscribe: requestSubscribe,
  getReminderStatus: getReminderStatus
};
