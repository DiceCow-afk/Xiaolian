/**
 * 状态与本地缓存
 *  - globalData + 本地缓存：用户、画像、诊断、计划、打卡、周反馈、提醒设置
 *  - 所有业务模块只通过本模块读写缓存，避免各页面散落 wx.getStorageSync
 *  - 约束变更时用 profileDirty 标记「是否需要重算计划」
 */
const PREFIX = 'xl_';

const KEYS = {
  user: PREFIX + 'user',
  profile: PREFIX + 'profile',
  diagnosis: PREFIX + 'diagnosis',
  plan: PREFIX + 'plan',
  checkins: PREFIX + 'checkins',
  feedbacks: PREFIX + 'feedbacks',
  reminder: PREFIX + 'reminder',
  subscription: PREFIX + 'subscription',
  profileDirty: PREFIX + 'profile_dirty',
  meta: PREFIX + 'meta'
};

function read(key, defaultValue) {
  try {
    const value = wx.getStorageSync(key);
    if (value === '' || value === null || value === undefined) return defaultValue;
    return value;
  } catch (e) {
    console.warn('[store] read fail', key, e);
    return defaultValue;
  }
}

function write(key, value) {
  try {
    wx.setStorageSync(key, value);
    return true;
  } catch (e) {
    console.warn('[store] write fail', key, e);
    return false;
  }
}

function remove(key) {
  try {
    wx.removeStorageSync(key);
  } catch (e) {
    console.warn('[store] remove fail', key, e);
  }
}

/* ================= 用户 ================= */

function getUser() {
  return read(KEYS.user, null);
}

function createUser() {
  const now = Date.now();
  const user = {
    user_id: 'u_' + now.toString(36) + Math.random().toString(36).slice(2, 6),
    nick_name: '校园跑者',
    avatar_emoji: '🏃',
    created_at: new Date(now).toISOString()
  };
  write(KEYS.user, user);
  return user;
}

function ensureUser() {
  return getUser() || createUser();
}

/* ================= 用户画像 ================= */

function getProfile() {
  return read(KEYS.profile, null);
}

function saveProfile(profile) {
  const user = ensureUser();
  const next = Object.assign({}, profile, {
    user_id: user.user_id,
    updated_at: new Date().toISOString()
  });
  write(KEYS.profile, next);
  return next;
}

/* ================= 弱项诊断 ================= */

function getDiagnosis() {
  return read(KEYS.diagnosis, null);
}

function saveDiagnosis(diagnosis) {
  write(KEYS.diagnosis, diagnosis);
  return diagnosis;
}

/* ================= 训练计划 ================= */

function getPlan() {
  return read(KEYS.plan, null);
}

function savePlan(plan) {
  write(KEYS.plan, plan);
  return plan;
}

/* ================= 约束变更标记 ================= */

function markProfileDirty() {
  write(KEYS.profileDirty, true);
}

function clearProfileDirty() {
  write(KEYS.profileDirty, false);
}

function isProfileDirty() {
  return read(KEYS.profileDirty, false) === true;
}

/* ================= 打卡 ================= */

function getCheckins() {
  return read(KEYS.checkins, []);
}

function addCheckin(record) {
  const list = getCheckins();
  list.unshift(record);
  write(KEYS.checkins, list.slice(0, 200));
  return record;
}

function getTodayCheckin() {
  const today = new Date();
  const y = today.getFullYear();
  const m = today.getMonth() + 1;
  const d = today.getDate();
  const todayKey = y + '-' + (m < 10 ? '0' + m : m) + '-' + (d < 10 ? '0' + d : d);
  return (
    getCheckins().filter(function (item) {
      return item.date === todayKey;
    })[0] || null
  );
}

/* ================= 周反馈 ================= */

function getFeedbacks() {
  return read(KEYS.feedbacks, []);
}

function addFeedback(record) {
  const list = getFeedbacks();
  list.unshift(record);
  write(KEYS.feedbacks, list.slice(0, 50));
  return record;
}

function getFeedbackByWeek(weekNo) {
  return (
    getFeedbacks().filter(function (item) {
      return Number(item.week_no) === Number(weekNo);
    })[0] || null
  );
}

/* ================= 提醒设置 ================= */

function getReminderSettings() {
  return read(KEYS.reminder, {
    enabled: true,
    time: '19:30',
    channel: 'in_app', // in_app | subscribe
    updated_at: ''
  });
}

function saveReminderSettings(settings) {
  const next = Object.assign({}, getReminderSettings(), settings, {
    updated_at: new Date().toISOString()
  });
  write(KEYS.reminder, next);
  return next;
}

function getSubscription() {
  return read(KEYS.subscription, { quota: 0, last_auth_at: '', total_auth: 0 });
}

function saveSubscription(subscription) {
  write(KEYS.subscription, subscription);
  return subscription;
}

/** 消耗一次订阅消息额度（服务端推送成功后调用；mock 中用于演示额度变化） */
function consumeSubscription(count) {
  const sub = getSubscription();
  const n = Number(count) || 1;
  sub.quota = Math.max(0, (Number(sub.quota) || 0) - n);
  write(KEYS.subscription, sub);
  return sub;
}

/* ================= 元信息 ================= */

function getMeta() {
  return read(KEYS.meta, {});
}

function saveMeta(extra) {
  const next = Object.assign({}, getMeta(), extra, { updated_at: new Date().toISOString() });
  write(KEYS.meta, next);
  return next;
}

/* ================= 全量清理（演示/测试用） ================= */

function clearAll() {
  Object.keys(KEYS).forEach(function (k) {
    remove(KEYS[k]);
  });
}

module.exports = {
  KEYS: KEYS,
  getUser: getUser,
  createUser: createUser,
  ensureUser: ensureUser,
  getProfile: getProfile,
  saveProfile: saveProfile,
  getDiagnosis: getDiagnosis,
  saveDiagnosis: saveDiagnosis,
  getPlan: getPlan,
  savePlan: savePlan,
  markProfileDirty: markProfileDirty,
  clearProfileDirty: clearProfileDirty,
  isProfileDirty: isProfileDirty,
  getCheckins: getCheckins,
  addCheckin: addCheckin,
  getTodayCheckin: getTodayCheckin,
  getFeedbacks: getFeedbacks,
  addFeedback: addFeedback,
  getFeedbackByWeek: getFeedbackByWeek,
  getReminderSettings: getReminderSettings,
  saveReminderSettings: saveReminderSettings,
  getSubscription: getSubscription,
  saveSubscription: saveSubscription,
  consumeSubscription: consumeSubscription,
  getMeta: getMeta,
  saveMeta: saveMeta,
  clearAll: clearAll
};
