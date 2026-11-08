/**
 * 接口层：页面只依赖本文件，不直接拼接 URL / 不直接 require mock
 * 路径与《接口契约》docs/02-接口/接口契约.md 一致，后端就绪后只需关闭 config.useMock。
 */
const request = require('./request');

const get = request.get;
const post = request.post;

/* ================= 用户画像 ================= */

/** 提交 / 更新用户画像 */
function submitProfile(profile) {
  return post('/profile', { profile: profile });
}

/** 获取当前用户画像 */
function getProfile() {
  return get('/profile');
}

/**
 * 自然语言 -> 结构化约束（LLM 调用点 1）
 * 失败时 reject code=3001，页面降级为表单填写
 */
function parseNaturalLanguage(text) {
  return post('/profile/parse', { text: text }, { silent: true, loading: false });
}

/* ================= 诊断与计划 ================= */

/** 弱项诊断与分数贡献分析 */
function getDiagnosis(profile) {
  return post('/diagnosis', { profile: profile });
}

/** 生成 / 重算 4 周计划 */
function generatePlan(payload) {
  return post('/plan/generate', payload || {}, { loading: true, loadingText: '正在生成计划' });
}

/** 获取当前计划 */
function getCurrentPlan() {
  return get('/plan/current');
}

/** 按 id 获取计划详情 */
function getPlan(planId) {
  return get('/plan/' + planId);
}

/** 计划解释（LLM 调用点 2，只读，不增删改计划） */
function explainPlan(planId) {
  return post('/plan/explain', { plan_id: planId }, { silent: true });
}

/* ================= 动作库 ================= */

/** 动作详情与示范资源 */
function getAction(actionId) {
  return get('/actions/' + actionId);
}

/* ================= 打卡 ================= */

/** 提交打卡 */
function checkin(payload) {
  return post('/checkin', payload, { loading: true, loadingText: '正在记录打卡' });
}

/** 打卡记录与统计 */
function getCheckins(params) {
  return get('/checkin', params || {});
}

/* ================= 周反馈 ================= */

/** 周反馈数据（已有反馈 + 本周统计） */
function getWeeklyFeedback(params) {
  return get('/feedback/weekly', params || {});
}

/** 提交周反馈并触发下周调整 */
function submitWeeklyFeedback(payload) {
  return post('/feedback/weekly', payload, { loading: true, loadingText: '正在生成调整方案' });
}

/* ================= 饮食提示（拓展） ================= */

/** 轻量饮食提示 */
function getDietTips(params) {
  return get('/diet/tips', params || {});
}

/* ================= 安全拦截日志 ================= */

/** 安全拦截日志（管理 / 演示用） */
function getInterceptLogs() {
  return get('/logs/intercepts');
}

module.exports = {
  submitProfile: submitProfile,
  getProfile: getProfile,
  parseNaturalLanguage: parseNaturalLanguage,
  getDiagnosis: getDiagnosis,
  generatePlan: generatePlan,
  getCurrentPlan: getCurrentPlan,
  getPlan: getPlan,
  explainPlan: explainPlan,
  getAction: getAction,
  checkin: checkin,
  getCheckins: getCheckins,
  getWeeklyFeedback: getWeeklyFeedback,
  submitWeeklyFeedback: submitWeeklyFeedback,
  getDietTips: getDietTips,
  getInterceptLogs: getInterceptLogs
};
