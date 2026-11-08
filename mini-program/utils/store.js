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

/**
 * 以「计划 + 训练日」为粒度 upsert 打卡记录：
 * 同一计划同一训练日重复提交视为「更新打卡」，不产生重复记录；
 * 计划重算后（plan_id 变化）旧计划的打卡历史不会被覆盖，便于历史对账。
 */
function upsertCheckin(record) {
  if (!record || !record.session_id) return addCheckin(record);
  const list = getCheckins().filter(function (item) {
    const samePlan = !record.plan_id || item.plan_id === record.plan_id;
    return !(item.session_id === record.session_id && samePlan);
  });
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
  const plan = getPlan();
  return (
    getCheckins().filter(function (item) {
      if (item.date !== todayKey) return false;
      // 计划重算后旧计划的今日打卡不再作为「今日已打卡」依据
      return !plan || !item.plan_id || item.plan_id === plan.plan_id;
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

function getFeedbackByWeek(weekNo, planId) {
  return (
    getFeedbacks().filter(function (item) {
      if (Number(item.week_no) !== Number(weekNo)) return false;
      if (planId && item.plan_id !== planId) return false;
      return true;
    })[0] || null
  );
}

/** 按周移除反馈记录（更新反馈时先清理旧记录，保持同一周唯一）
 * 传入 planId 时只清理该计划的记录，避免误删旧计划反馈。
 */
function removeFeedbackByWeek(weekNo, planId) {
  const list = getFeedbacks().filter(function (item) {
    if (Number(item.week_no) !== Number(weekNo)) return true;
    if (planId && item.plan_id !== planId) return true;
    return false;
  });
  write(KEYS.feedbacks, list);
  return list;
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
  upsertCheckin: upsertCheckin,
  getTodayCheckin: getTodayCheckin,
  getFeedbacks: getFeedbacks,
  addFeedback: addFeedback,
  getFeedbackByWeek: getFeedbackByWeek,
  removeFeedbackByWeek: removeFeedbackByWeek,
  getReminderSettings: getReminderSettings,
  saveReminderSettings: saveReminderSettings,
  getSubscription: getSubscription,
  saveSubscription: saveSubscription,
  consumeSubscription: consumeSubscription,
  getMeta: getMeta,
  saveMeta: saveMeta,
  clearAll: clearAll
};
