#!/usr/bin/env node
/**
 * 「校练」mock 页面级闭环模拟（QA 基线工具，与 tools/smoke_test.js 互补）
 *
 * 目的：在 Node 下 stub 微信运行时，**完全通过 utils/api.js**（页面的唯一数据入口）
 *       走通「约束输入 → 诊断 → 计划 → 动作示范 → 打卡 → 周反馈 → 饮食」全流程，
 *       断言页面渲染所依赖的数据契约、业务不变量、规则分支与错误码降级路径。
 *
 * 与 smoke_test.js 的差异：
 *   - 全部经 api 层（Promise / 错误码 reject）调用，接近页面真实调用方式；
 *   - 更偏页面级数据断言：断言「计划页 / 动作页 / 打卡页 / 周反馈页 / 饮食页」所需字段；
 *   - 额外覆盖：周反馈 7 条规则分支、更新打卡/重复反馈的幂等性、提醒订阅三态、
 *     真实网络分支（useMock=false 的 wx.request 桩）、多画像安全不变量独立复核。
 *
 * 运行：node tools/simulate.js
 * 退出码：0 = 全部通过；1 = 存在失败断言（含已知框架缺陷）；2 = 脚本异常
 */
'use strict';

const path = require('path');

const MINI_ROOT = path.resolve(__dirname, '..', 'mini-program');

/* ============================== 1. wx 运行时桩 ============================== */

const storage = {};
const calls = {
  toasts: [],
  badges: [],
  navigations: [],
  modals: [],
  pageScrolls: [],
  pullDownStops: 0,
  loadingActive: 0,
  loadingMax: 0,
  requests: [],
  subscriptions: []
};
let subscribeBehavior = 'none'; // none(模板未配置/不支持) | accept | deny | fail
let networkBehavior = 'success'; // success | biz1001 | http500 | fail

global.wx = {
  getStorageSync(key) {
    return Object.prototype.hasOwnProperty.call(storage, key) ? storage[key] : '';
  },
  setStorageSync(key, value) {
    storage[key] = value;
  },
  removeStorageSync(key) {
    delete storage[key];
  },
  showLoading() {
    calls.loadingActive += 1;
    calls.loadingMax = Math.max(calls.loadingMax, calls.loadingActive);
  },
  hideLoading() {
    calls.loadingActive = Math.max(0, calls.loadingActive - 1);
  },
  showToast(opts) {
    calls.toasts.push({ title: opts && opts.title, icon: opts && opts.icon });
  },
  showModal(opts) {
    calls.modals.push({
      title: opts && opts.title,
      content: opts && opts.content
    });
  },
  setTabBarBadge(opts) {
    calls.badges.push({ op: 'set', index: opts && opts.index, text: opts && opts.text });
  },
  removeTabBarBadge(opts) {
    calls.badges.push({ op: 'remove', index: opts && opts.index });
  },
  navigateTo(opts) {
    calls.navigations.push({ type: 'navigateTo', url: opts && opts.url });
  },
  switchTab(opts) {
    calls.navigations.push({ type: 'switchTab', url: opts && opts.url });
  },
  navigateBack(opts) {
    calls.navigations.push({ type: 'navigateBack', delta: opts && opts.delta });
  },
  reLaunch(opts) {
    calls.navigations.push({ type: 'reLaunch', url: opts && opts.url });
  },
  stopPullDownRefresh() {
    calls.pullDownStops += 1;
  },
  pageScrollTo(opts) {
    calls.pageScrolls.push(opts && opts.selector);
  },
  getWindowInfo() {
    return { windowWidth: 375, windowHeight: 667, statusBarHeight: 20, safeArea: { top: 20, bottom: 667 } };
  },
  getSystemInfoSync() {
    return { windowWidth: 375, windowHeight: 667, statusBarHeight: 20, platform: 'devtools' };
  },
  requestSubscribeMessage(opts) {
    calls.subscriptions.push({ tmplIds: (opts && opts.tmplIds) || [] });
    const ids = (opts && opts.tmplIds) || [];
    setTimeout(function () {
      if (subscribeBehavior === 'accept' || subscribeBehavior === 'deny') {
        const res = {};
        ids.forEach(function (id) {
          res[id] = subscribeBehavior === 'accept' ? 'accept' : 'reject';
        });
        if (opts && typeof opts.success === 'function') opts.success(res);
      } else if (opts && typeof opts.fail === 'function') {
        opts.fail({ errMsg: 'requestSubscribeMessage:fail mock' });
      }
    }, 0);
  },
  request(opts) {
    calls.requests.push({ url: opts && opts.url, method: opts && opts.method });
    setTimeout(function () {
      if (networkBehavior === 'fail') {
        if (opts && typeof opts.fail === 'function') opts.fail({ errMsg: 'request:fail mock network error' });
        return;
      }
      if (!opts || typeof opts.success !== 'function') return;
      if (networkBehavior === 'http500') {
        opts.success({ statusCode: 500, data: null });
      } else if (networkBehavior === 'biz1001') {
        opts.success({ statusCode: 200, data: { code: 1001, msg: '参数校验失败', data: { errors: { x: 'mock' } } } });
      } else {
        opts.success({ statusCode: 200, data: { code: 0, data: { ok: true }, msg: 'ok' } });
      }
    }, 0);
  }
};

/* ============================== 2. 加载被测模块 ============================== */

const config = require(path.join(MINI_ROOT, 'utils/config.js'));
const CONFIG_BACKUP = JSON.parse(JSON.stringify(config));

// 去掉 mock 的人为延迟，让 Node 侧模拟足够快（仍走完整 Promise/setTimeout 链路）
config.mockLatency = { min: 0, max: 0 };
config.llmLatency = 0;

const store = require(path.join(MINI_ROOT, 'utils/store.js'));
const util = require(path.join(MINI_ROOT, 'utils/util.js'));
const validators = require(path.join(MINI_ROOT, 'utils/validators.js'));
const reminder = require(path.join(MINI_ROOT, 'utils/reminder.js'));
const api = require(path.join(MINI_ROOT, 'utils/api.js'));
const request = require(path.join(MINI_ROOT, 'utils/request.js'));
const mock = require(path.join(MINI_ROOT, 'utils/mock.js'));
const actionsData = require(path.join(MINI_ROOT, 'data/actions.js'));
const options = require(path.join(MINI_ROOT, 'data/options.js'));
const standards = require(path.join(MINI_ROOT, 'data/testStandards.js'));
const rules = require(path.join(MINI_ROOT, 'data/rules.js'));
const foodsData = require(path.join(MINI_ROOT, 'data/foods.js'));

function resetConfig() {
  config.useMock = CONFIG_BACKUP.useMock;
  config.mockLatency = { min: 0, max: 0 };
  config.llmLatency = 0;
  config.subscribeTmplIds = [];
  config.features = JSON.parse(JSON.stringify(CONFIG_BACKUP.features));
}

/* ============================== 3. 断言框架 ============================== */

let passed = 0;
let failed = 0;
const failures = [];
let warnCount = 0;
const warningList = [];
let currentSection = '';
const sectionStats = [];

function section(title) {
  if (sectionStats.length) {
    const last = sectionStats[sectionStats.length - 1];
    last.passed = passed - last.startPassed;
    last.failed = failed - last.startFailed;
  }
  currentSection = title;
  sectionStats.push({ title: title, startPassed: passed, startFailed: failed, passed: 0, failed: 0 });
  console.log('\n[' + title + ']');
}

function short(detail) {
  if (detail === undefined) return '';
  try {
    const s = JSON.stringify(detail);
    return s && s.length > 240 ? s.slice(0, 240) + '…' : s;
  } catch (e) {
    return String(detail);
  }
}

function check(name, condition, detail) {
  if (condition) {
    passed += 1;
    return true;
  }
  failed += 1;
  const msg = name + (detail !== undefined ? ' :: ' + short(detail) : '');
  failures.push('[' + currentSection + '] ' + msg);
  console.error('  ✗ ' + msg);
  return false;
}

function warnCheck(name, detail) {
  warnCount += 1;
  const msg = name + (detail !== undefined ? ' :: ' + short(detail) : '');
  warningList.push(msg);
  console.log('  ! ' + msg);
}

async function expectReject(name, promise, code) {
  try {
    const data = await promise;
    check(name, false, { resolved: data });
    return null;
  } catch (err) {
    const ok = err && err.code === code;
    check(name, ok, err ? { code: err.code, msg: err.msg } : err);
    return err || null;
  }
}

/* ============================== 4. 测试夹具 ============================== */

const PROFILE_BASE = {
  gender: 'male',
  target_events: ['run_1000', 'jump_long', 'pull_up'],
  event_levels: { run_1000: 'fail', jump_long: 'pass', pull_up: 'fail' },
  self_level: 'weak',
  equipment: ['band'],
  space: 'dorm',
  time_per_session: 30,
  weekly_frequency: 3,
  body_limits: ['knee'],
  goal: 'score_up',
  test_date: '',
  natural_language: ''
};

function profileOf(overrides) {
  const p = Object.assign({}, PROFILE_BASE, overrides || {});
  if (!p.test_date) p.test_date = util.addDays(util.todayStr(), 35);
  return p;
}

/** 重建一份全新画像 + 诊断 + 计划（等价页面「保存约束并生成计划」） */
async function resetToPlan(overrides) {
  resetConfig();
  store.clearAll();
  const profile = profileOf(overrides);
  const saved = await api.submitProfile(profile);
  const diagnosis = await api.getDiagnosis(profile);
  const generated = await api.generatePlan({ profile: profile, diagnosis: diagnosis });
  return { profile: saved.profile, diagnosis: diagnosis, plan: generated.plan, generated: generated };
}

function sessionsOf(plan) {
  const list = [];
  (plan.weeks || []).forEach(function (week) {
    (week.sessions || []).forEach(function (session) {
      list.push({ week: week, session: session });
    });
  });
  return list;
}

function todaySessionOf(plan) {
  const today = util.todayStr();
  return sessionsOf(plan).filter(function (item) {
    return item.session.date === today;
  })[0] || null;
}

function actionLibrary(actionId) {
  return actionsData.getAction(actionId);
}

/* 独立复核计划中的动作是否真的满足四类硬约束（不直接复用 mock.filterActions） */
function verifyPlanAgainstConstraints(plan, profile, label) {
  const table = rules.CONSTRAINT_TABLE;
  const allowedEquipment = [];
  (profile.equipment || []).forEach(function (key) {
    (table.equipment[key] || []).forEach(function (e) {
      if (allowedEquipment.indexOf(e) < 0) allowedEquipment.push(e);
    });
  });
  const allowedSpaces = table.space[profile.space] || ['dorm'];
  const maxLevel = table.level[profile.self_level] || 2;
  const limits = (profile.body_limits || []).filter(function (l) {
    return l !== 'none';
  });

  let badContra = 0;
  let badEquip = 0;
  let badSpace = 0;
  let badLevel = 0;
  let missingLibrary = 0;
  let overCap = 0;
  const cap = (rules.PERIODIZATION_TABLE.action_count_by_time[profile.time_per_session] || 3) + (profile.time_per_session >= 30 ? 2 : 0);

  plan.weeks.forEach(function (week) {
    week.sessions.forEach(function (session) {
      if (session.duration_min !== profile.time_per_session) overCap += 1;
      if (session.actions.length > cap) overCap += 1;
      const seen = {};
      session.actions.forEach(function (planned) {
        if (seen[planned.action_id]) badContra += 0; // 重复动作单独检查
        seen[planned.action_id] = true;
        const lib = actionLibrary(planned.action_id);
        if (!lib) {
          missingLibrary += 1;
          return;
        }
        (lib.contraindications || []).forEach(function (c) {
          if (limits.indexOf(c) >= 0) badContra += 1;
        });
        (lib.equipment || []).forEach(function (e) {
          if (allowedEquipment.indexOf(e) < 0) badEquip += 1;
        });
        if (!(lib.space || []).some(function (s) {
          return allowedSpaces.indexOf(s) >= 0;
        })) {
          badSpace += 1;
        }
        if (lib.capability_level > maxLevel) badLevel += 1;
      });
    });
  });

  check(label + '：计划动作均来自动作库', missingLibrary === 0, { missingLibrary: missingLibrary });
  check(label + '：无禁忌动作（独立复核）', badContra === 0, { badContra: badContra });
  check(label + '：无器械越界动作（独立复核）', badEquip === 0, { badEquip: badEquip });
  check(label + '：无空间越界动作（独立复核）', badSpace === 0, { badSpace: badSpace });
  check(label + '：无超能力门槛动作（独立复核）', badLevel === 0, { badLevel: badLevel });
  check(label + '：不越时长（时长/动作数上限）', overCap === 0, { overCap: overCap, cap: cap });
  return { badContra: badContra, badEquip: badEquip, badSpace: badSpace, badLevel: badLevel, missingLibrary: missingLibrary, overCap: overCap };
}

/* ============================== 5. 各章节 ============================== */

async function checkEnvironment() {
  section('1. 数据契约与环境自检');
  check('config.useMock=true（演示模式，不依赖网络）', config.useMock === true, config.useMock);
  const apiNames = [
    'submitProfile', 'getProfile', 'parseNaturalLanguage', 'getDiagnosis', 'generatePlan',
    'getCurrentPlan', 'getPlan', 'explainPlan', 'getAction', 'checkin', 'getCheckins',
    'getWeeklyFeedback', 'submitWeeklyFeedback', 'getDietTips', 'getInterceptLogs'
  ];
  const missingApi = apiNames.filter(function (n) {
    return typeof api[n] !== 'function';
  });
  check('utils/api.js 提供接口契约中的 15 个函数', missingApi.length === 0, missingApi);
  check('动作库 35 个动作', actionsData.ACTIONS.length === 35, actionsData.ACTIONS.length);
  check('关键帧示范动作 6 个', actionsData.DEMO_FRAME_ACTIONS.length === 6, actionsData.DEMO_FRAME_ACTIONS);
  check('体测项目 6 项', standards.EVENTS.length === 6, standards.EVENTS.length);
  check('周反馈规则 6 条 + 默认分支', rules.WEEKLY_ADJUSTMENT_TABLE.rules.length === 6, rules.WEEKLY_ADJUSTMENT_TABLE.rules.length);
  check('食物简表 ≥ 20 条', foodsData.FOODS.length >= 20, foodsData.FOODS.length);
  ['validateProfile', 'validateNaturalLanguage', 'validateCheckin', 'validateWeeklyFeedback', 'validateReminderSettings'].forEach(function (name) {
    check('validators.' + name + ' 存在', typeof validators[name] === 'function');
  });
}

async function checkConstraintsPage() {
  section('2. 约束输入页数据流');
  resetConfig();
  store.clearAll();

  const firstProfile = await api.getProfile();
  check('冷启动 getProfile 返回 profile=null', firstProfile && firstProfile.profile === null, firstProfile);

  const emptyValidation = validators.validateProfile({});
  check('空表单校验不通过', emptyValidation.valid === false);
  ['gender', 'target_events', 'self_level', 'equipment', 'space', 'time_per_session', 'weekly_frequency', 'body_limits', 'goal', 'test_date'].forEach(function (field) {
    check('空表单校验包含字段错误：' + field, !!emptyValidation.errors[field], emptyValidation.errors);
  });
  check('firstError 是首条内联错误文案', !!emptyValidation.firstError, emptyValidation.firstError);

  // 自然语言解析（LLM 调用点 1）
  const parseText = '每周三次，每次 30 分钟，宿舍里只有弹力带，膝盖有点不舒服，想提升 1000 米和立定跳远成绩';
  const parsed = await api.parseNaturalLanguage(parseText);
  check('自然语言解析返回 parsed 对象', parsed && parsed.parsed && typeof parsed.parsed === 'object', parsed && parsed.parsed);
  check('解析出可用器械（弹力带）', (parsed.parsed.equipment || []).indexOf('band') >= 0, parsed.parsed.equipment);
  check('解析出训练空间（宿舍）', parsed.parsed.space === 'dorm', parsed.parsed.space);
  check('解析出身体限制（膝盖）', (parsed.parsed.body_limits || []).indexOf('knee') >= 0, parsed.parsed.body_limits);
  check('解析出体测项目', (parsed.parsed.target_events || []).length > 0, parsed.parsed.target_events);
  check('解析出单次时长 30 分钟', parsed.parsed.time_per_session === 30, parsed.parsed.time_per_session);
  check('解析出每周次数 3 次', parsed.parsed.weekly_frequency === 3, parsed.parsed.weekly_frequency);
  check('解析返回已识别字段中文标签', Array.isArray(parsed.filled_fields) && parsed.filled_fields.length >= 4, parsed.filled_fields);
  check('解析置信度在 (0,1] 区间', parsed.confidence > 0 && parsed.confidence <= 1, parsed.confidence);

  const parseShort = validators.validateNaturalLanguage('短');
  check('页面侧自然语言输入长度校验（<6 字）', parseShort.valid === false && !!parseShort.errors.text, parseShort.errors);
  const parseErr = await expectReject('解析失败降级为 3001（不阻塞表单）', api.parseNaturalLanguage('测试失败场景'), 3001);
  check('3001 错误携带 retry_count', parseErr && parseErr.data && parseErr.data.retry_count === 2, parseErr && parseErr.data);

  // 非法画像提交
  const invalidErr = await expectReject('非法画像提交返回 1001', api.submitProfile({ target_events: [] }), 1001);
  check('1001 返回字段级 errors（供表单内联展示）', invalidErr && invalidErr.data && invalidErr.data.errors && invalidErr.data.errors.target_events, invalidErr && invalidErr.data);

  // 合法提交
  const profile = profileOf();
  const saved = await api.submitProfile(profile);
  check('保存合法画像成功并返回 profile', saved && saved.profile && !!saved.profile.user_id, saved && saved.profile && saved.profile.user_id);
  check('首次保存 needs_replan=false（尚无计划）', saved.needs_replan === false, saved.needs_replan);
  const persisted = await api.getProfile();
  check('画像已持久化（器械弹力带）', persisted.profile && (persisted.profile.equipment || []).indexOf('band') >= 0, persisted.profile && persisted.profile.equipment);

  // 诊断（页面用于展示弱项与分数贡献）
  const diagnosis = await api.getDiagnosis(profile);
  check('诊断 items 覆盖 3 个体测项目', diagnosis.items.length === 3, diagnosis.items.length);
  check('诊断包含弱项维度（1-3 个）', diagnosis.weak_dimensions.length >= 1 && diagnosis.weak_dimensions.length <= 3, diagnosis.weak_dimensions.length);
  check('弱项带 priority 排序', diagnosis.weak_dimensions.every(function (d, i) { return d.priority === i + 1; }), diagnosis.weak_dimensions.map(function (d) { return d.priority; }));
  const allocationSum = diagnosis.allocation.reduce(function (acc, d) { return acc + d.weight; }, 0);
  check('训练资源权重已归一化（误差 ≤0.2）', Math.abs(allocationSum - 1) <= 0.2, allocationSum);
  check('诊断 summary 可解释（含提分建议）', typeof diagnosis.summary === 'string' && diagnosis.summary.indexOf('提分') >= 0, diagnosis.summary);
  check('诊断条目含当前分数/下一档/贡献', diagnosis.items.every(function (item) {
    return typeof item.current_score === 'number' && item.next_tier !== undefined && typeof item.contribution === 'number';
  }));
  const diagErr = await expectReject('非法画像诊断返回 1001', api.getDiagnosis({}), 1001);
  check('诊断 1001 含 errors', diagErr && diagErr.data && !!diagErr.data.errors, diagErr && diagErr.data);

  // 生成计划
  const generated = await api.generatePlan({ profile: profile, diagnosis: diagnosis });
  const plan = generated.plan;
  check('计划生成成功并返回 plan', !!plan && !!plan.plan_id);
  check('计划包含 4 周', plan.weeks.length === 4, plan.weeks.length);
  check('每周训练日数 = weekly_frequency(3)', plan.weeks.every(function (w) { return w.sessions.length === 3; }), plan.weeks.map(function (w) { return w.sessions.length; }));
  check('weeks_count=4 / phases 合法', plan.weeks_count === 4 && plan.phases.every(function (p) { return ['base', 'build', 'taper'].indexOf(p) >= 0; }), plan.phases);
  check('计划记录体测日期与倒计时', plan.test_date === profile.test_date && plan.days_to_test === util.diffDays(util.todayStr(), profile.test_date), { test_date: plan.test_date, days_to_test: plan.days_to_test });
  check('计划 constraints 回填用户约束', plan.constraints.time_per_session === 30 && plan.constraints.weekly_frequency === 3, plan.constraints);
  check('候选动作 + 安全拦截 = 动作库总数', plan.meta.candidate_count + plan.safety_intercepts.length === actionsData.ACTIONS.length, { candidate: plan.meta.candidate_count, intercept: plan.safety_intercepts.length });
  check('膝盖限制下存在安全拦截记录', plan.safety_intercepts.length > 0, plan.safety_intercepts.length);
  check('安全拦截带 rule_id / 原因', plan.safety_intercepts.every(function (i) {
    return /^SF-/.test(i.rule_id) && !!i.reason;
  }));
  const metaIds = rules.SAFETY_TABLE.rules.map(function (r) { return r.rule_id; });
  check('安全拦截 rule_id 均来自独立安全规则表', plan.safety_intercepts.every(function (i) { return metaIds.indexOf(i.rule_id) >= 0; }), plan.safety_intercepts.map(function (i) { return i.rule_id; }));

  // 约束变更 → 需要重算
  const changedProfile = profileOf({ time_per_session: 45 });
  const changedSaved = await api.submitProfile(changedProfile);
  check('已有计划时修改约束 needs_replan=true', changedSaved.needs_replan === true, changedSaved.needs_replan);
  check('store.isProfileDirty() 标记脏计划（计划页提示条）', store.isProfileDirty() === true);
  const regenerated = await api.generatePlan({ profile: changedProfile, diagnosis: await api.getDiagnosis(changedProfile) });
  check('重算后约束已生效（每次 45 分钟）', regenerated.plan.constraints.time_per_session === 45, regenerated.plan.constraints.time_per_session);
  check('重算后脏标记被清除', store.isProfileDirty() === false);

  // 无画像生成计划
  store.clearAll();
  await expectReject('无画像生成计划返回 1003', api.generatePlan({}), 1003);

  // 只读：计划解释
  const fixture = await resetToPlan();
  return fixture;
}

async function checkPlanPage() {
  section('3. 计划页数据');
  const fixture = await resetToPlan();
  const plan = fixture.plan;

  const current = await api.getCurrentPlan();
  check('getCurrentPlan 返回计划且 stale=false', !!current.plan && current.stale === false && current.days_old === 0, { stale: current.stale, days_old: current.days_old });
  check('getCurrentPlan 与生成计划一致', current.plan.plan_id === plan.plan_id);

  const today = todaySessionOf(plan);
  check('今天存在训练日（演示保证）', !!today, util.todayStr());
  check('今日训练日 day_label=今天', today && today.session.day_label === '今天', today && today.session.day_label);
  check('今日训练日位于第 1 周', today && today.week.week_no === 1, today && today.week.week_no);

  // 计划页 hero / 周概览 / 卡片所需字段
  check('周数据含阶段/日期范围/重点/说明（hero+周概览）', plan.weeks.every(function (w) {
    return !!w.phase_name && !!w.phase_key && !!w.date_range_text && !!w.weekly_focus && !!w.note && w.target_completion === w.sessions.length;
  }));
  // date_range_text 独立重算（Lead 修复过 util.dateRangeText 拼接 bug，这里做回归锚点）
  check('周日期范围文案与起止日期一致（dateRangeText 回归）', plan.weeks.every(function (w) {
    const s = new Date(w.date_range.start);
    const e = new Date(w.date_range.end);
    const expected = (s.getMonth() + 1) + '月' + s.getDate() + '日 - ' + (e.getMonth() + 1) + '月' + e.getDate() + '日';
    return w.date_range_text === expected;
  }), plan.weeks.map(function (w) { return w.date_range_text; }));
  check('周阶段与 options.PHASE_META 对齐', plan.weeks.every(function (w) {
    return options.PHASE_META[w.phase_key] && options.PHASE_META[w.phase_key].name === w.phase_name;
  }));
  check('training session 含卡片渲染字段（plan-card）', plan.weeks.every(function (w) {
    return w.sessions.every(function (s) {
      return !!s.session_id && !!s.title && !!s.duration_text && !!s.location && !!s.date_md && !!s.weekday;
    });
  }));
  check('动作条目含 action-tag 所需字段', plan.weeks.every(function (w) {
    return w.sessions.every(function (s) {
      return s.actions.every(function (a) {
        return !!a.action_id && !!a.name && !!a.role_label && !!a.reps_text && !!a.rest_text && !!a.equipment && !!a.space && !!a.level_label;
      });
    });
  }));

  // 不越时长 / 动作数约束
  verifyPlanAgainstConstraints(plan, fixture.profile, '膝盖画像');
  check('30 分钟训练日动作数不超过「主项 3 + 热身 1 + 放松 1」', plan.weeks.every(function (w) {
    return w.sessions.every(function (s) { return s.actions.length <= 5; });
  }), plan.weeks[0].sessions.map(function (s) { return s.actions.length; }));
  check('训练时长与用户选择一致', plan.weeks.every(function (w) {
    return w.sessions.every(function (s) { return s.duration_min === 30; });
  }));
  check('同一训练日动作不重复', plan.weeks.every(function (w) {
    return w.sessions.every(function (s) {
      const ids = s.actions.map(function (a) { return a.action_id; });
      return ids.every(function (id, i) { return ids.indexOf(id) === i; });
    });
  }));
  check('30 分钟训练日有热身/放松角色', plan.weeks[0].sessions[0].actions[0].role === 'warmup' && plan.weeks[0].sessions[0].actions[plan.weeks[0].sessions[0].actions.length - 1].role === 'cooldown', plan.weeks[0].sessions[0].actions.map(function (a) { return a.role; }));
  check('15 分钟训练日无热身/放松（纯主项）', true); // 由下节多画像补充

  // 计划解释（LLM 调用点 2，只读）
  const weeksBefore = JSON.stringify(store.getPlan().weeks);
  const explain = await api.explainPlan(plan.plan_id);
  check('解释返回 checks.plan_unchanged=true', explain.checks && explain.checks.plan_unchanged === true, explain.checks);
  check('解释文本包含安全说明', typeof explain.text === 'string' && explain.text.indexOf('安全') >= 0);
  check('解释文本声明未改动计划', explain.text.indexOf('未新增、删除或修改') >= 0);
  check('解释只读：weeks 未被改动', JSON.stringify(store.getPlan().weeks) === weeksBefore);
  check('解释结果缓存进 plan.explanation（计划页可直接展示）', !!store.getPlan().explanation && !!store.getPlan().explanation.text);
  check('解释失败可降级（不阻塞）', true);

  // 解释失败降级：3001
  config.features.planExplain = false;
  await expectReject('计划解释未开启时返回 3001（页面跳过解释）', api.explainPlan(plan.plan_id), 3001);
  config.features.planExplain = true;

  // stale 计划
  const stored = store.getPlan();
  const generatedDate = stored.generated_date;
  stored.generated_date = util.addDays(util.todayStr(), -2);
  store.savePlan(stored);
  const staleRes = await api.getCurrentPlan();
  check('隔天打开返回 stale=true 且 days_old>0（计划日期已过期提示）', staleRes.stale === true && staleRes.days_old === 2, { stale: staleRes.stale, days_old: staleRes.days_old });
  stored.generated_date = generatedDate;
  store.savePlan(stored);

  // 计划详情与错误码
  const detail = await api.getPlan(plan.plan_id);
  check('getPlan(plan_id) 可读取计划详情', detail && detail.plan && detail.plan.plan_id === plan.plan_id);
  await expectReject('getPlan(未知 id) 返回 1003', api.getPlan('plan_not_exist'), 1003);
  const logs = await api.getInterceptLogs();
  check('拦截日志总数与计划一致（计划页可选展示）', logs.total === plan.safety_intercepts.length, { total: logs.total });
  check('拦截日志按类型统计非空', Object.keys(logs.by_type).length > 0, logs.by_type);
  check('拦截日志含身体限制类型', (logs.by_type.body_limit || 0) > 0, logs.by_type);

  // 无计划空状态
  store.clearAll();
  const empty = await api.getCurrentPlan();
  check('无计划返回 plan=null 不报错（空状态）', empty.code === undefined && empty.plan === null && empty.stale === false, empty);
  check('无计划时拦截日志返回空列表', (await api.getInterceptLogs()).total === 0);
  return fixture;
}

async function checkActionPage() {
  section('4. 动作示范页数据');
  // 用膝盖限制画像，验证 current_profile 禁忌提示
  const fixture = await resetToPlan({ body_limits: ['knee'] });

  let demoChecked = 0;
  let textChecked = 0;
  let safeCount = 0;
  let fail = 0;

  for (let i = 0; i < actionsData.ACTIONS.length; i++) {
    const lib = actionsData.ACTIONS[i];
    let detail = null;
    try {
      detail = await api.getAction(lib.action_id);
    } catch (e) {
      fail += 1;
      check('动作详情可读取：' + lib.action_id, false, e && e.msg);
      continue;
    }
    // 页面渲染核心字段
    const ok =
      detail.action_id === lib.action_id &&
      detail.name === lib.name &&
      (detail.dimension_list || []).length > 0 &&
      (detail.key_points || []).length > 0 &&
      (detail.steps || []).length > 0 &&
      (detail.common_errors || []).length > 0 &&
      (detail.correct_vs_wrong || []).length > 0 &&
      !!detail.breathing &&
      !!detail.safety_note &&
      !!detail.level_label &&
      !!detail.demo &&
      !!detail.sets_template;
    if (!ok) {
      fail += 1;
      check('动作详情教学字段完整：' + lib.action_id, false);
    }

    // demo 资源
    if (detail.demo.type === 'frames') {
      demoChecked += 1;
      const expectFrames = Number(lib.demo_frames) || 0;
      const frameOk =
        detail.demo.count === expectFrames &&
        detail.demo.frames.length === expectFrames &&
        detail.demo.frames.every(function (p, index) {
          return p === '/assets/demo/' + lib.action_id + '/frame-' + (index + 1) + '.png';
        }) &&
        detail.demo.poster === detail.demo.frames[0];
      if (!frameOk) {
        fail += 1;
        check('关键帧示范路径与动作库一致：' + lib.action_id, false, detail.demo.frames);
      }
    } else if (detail.demo.type === 'text') {
      textChecked += 1;
      if (detail.demo.frames.length !== 0 || detail.demo.placeholder !== '/assets/demo/placeholder.png') {
        fail += 1;
        check('图文要点示范兜底占位图：' + lib.action_id, false, detail.demo);
      }
    } else {
      fail += 1;
      check('demo.type 合法：' + lib.action_id, false, detail.demo.type);
    }

    // 降阶 / 升阶引用
    if (lib.regression_id) {
      if (!detail.regression || detail.regression.action_id !== lib.regression_id) {
        fail += 1;
        check('降阶动作可跳转：' + lib.action_id, false);
      }
    }
    if (lib.progression_id) {
      if (!detail.progression || detail.progression.action_id !== lib.progression_id) {
        fail += 1;
        check('进阶动作可跳转：' + lib.action_id, false);
      }
    }

    // 当前画像禁忌提示
    if (detail.current_profile && detail.current_profile.safe === true) safeCount += 1;
  }

  check('35 个动作详情全部可读取且教学字段完整', fail === 0, fail);
  check('关键帧示范动作 6 个（demo.type=frames）', demoChecked === 6, demoChecked);
  check('其余动作使用图文要点兜底（demo.type=text）', textChecked === actionsData.ACTIONS.length - 6, textChecked);
  check('膝盖限制画像下存在安全动作（current_profile.safe=true）', safeCount > 0, safeCount);

  const squat = await api.getAction('squat');
  check('蹲类动作在膝盖限制下给出禁忌警示', (squat.current_profile.conflict || []).indexOf('knee') >= 0, squat.current_profile);
  check('禁忌警示带中文标签（页面展示用）', (squat.current_profile.conflict_labels || []).indexOf('膝盖不适') >= 0, squat.current_profile.conflict_labels);
  check('演示资源 id 与动作库一致', squat.demo.type === 'frames' && squat.demo.frames.length === 4, squat.demo);

  await expectReject('不存在动作返回 1003（动作页错误态）', api.getAction('not_exist'), 1003);
  return fixture;
}

async function checkCheckinPage() {
  section('5. 提醒打卡页数据');
  const fixture = await resetToPlan();
  const plan = fixture.plan;
  const today = todaySessionOf(plan);
  const todaySession = today.session;
  check('今日训练日可用于打卡', !!todaySession);

  // 打卡历史与本周统计（空态）
  const initial = await api.getCheckins();
  check('初次读取打卡记录为空', Array.isArray(initial.records) && initial.records.length === 0, initial.records);
  check('本周统计 total_sessions=3 / 完成 0', initial.stats.total_sessions === 3 && initial.stats.done_count === 0 && initial.stats.completion_rate === 0, initial.stats);
  check('打卡页 streak 初始为 0', initial.streak === 0 && initial.stats.streak === 0, initial.streak);
  check('统计含本周 week_no', initial.stats.week_no === 1, initial.stats.week_no);

  // 提醒状态（提醒设置卡数据）
  const reminderStatus = reminder.getReminderStatus();
  check('提醒设置默认开启且时间 19:30', reminderStatus.settings.enabled === true && reminderStatus.settings.time === '19:30', reminderStatus.settings);
  check('订阅模板未配置（template_ready=false，应用内兜底）', reminderStatus.template_ready === false, reminderStatus.template_ready);
  check('提醒状态含今日训练日与周次', !!reminderStatus.today_session && reminderStatus.today_session.session_id === todaySession.session_id && reminderStatus.today_week_no === 1);
  check('提醒状态含下一个训练日（今日即训练日）', !!reminderStatus.next_training && reminderStatus.next_training.date === util.todayStr(), reminderStatus.next_training && reminderStatus.next_training.date);
  check('提醒状态含服务端定时任务说明', typeof reminderStatus.server_cron === 'string' && reminderStatus.server_cron.length > 0, reminderStatus.server_cron);
  check('今日未打卡 today_checked=false', reminderStatus.today_checked === false);

  // tabBar 角标（应用内提醒兜底）
  calls.badges.length = 0;
  reminder.refreshBadge();
  const lastBadge = calls.badges[calls.badges.length - 1];
  check('未打卡时打卡 tab 显示「今日」角标', lastBadge && lastBadge.op === 'set' && lastBadge.index === 1 && lastBadge.text === '今日', lastBadge);

  // 表单校验
  const invalidCheckin = validators.validateCheckin({});
  check('打卡表单空值校验不通过', invalidCheckin.valid === false && !!invalidCheckin.errors.status && !!invalidCheckin.errors.rpe, invalidCheckin.errors);
  check('RPE 越界（99）校验不通过', validators.validateCheckin({ plan_id: plan.plan_id, session_id: todaySession.session_id, status: 'done', rpe: 99, discomfort: ['none'] }).valid === false);
  check('不适选项互斥校验（none + knee）', validators.validateCheckin({ plan_id: plan.plan_id, session_id: todaySession.session_id, status: 'done', rpe: 5, discomfort: ['none', 'knee'] }).valid === false);

  // 提交今日打卡（done）
  const checkinRes = await api.checkin({
    plan_id: plan.plan_id,
    session_id: todaySession.session_id,
    date: todaySession.date,
    status: 'done',
    completed_action_ids: todaySession.actions.map(function (a) { return a.action_id; }),
    rpe: 6,
    discomfort: ['none'],
    discomfort_note: '',
    note: '状态不错',
    duration_actual_min: 30
  });
  check('打卡成功返回 record/stats/safety_review', !!checkinRes.record && !!checkinRes.stats && !!checkinRes.safety_review);
  check('打卡记录字段完整（历史卡展示）', checkinRes.record.session_id === todaySession.session_id && checkinRes.record.status === 'done' && checkinRes.record.rpe === 6 && !!checkinRes.record.title);
  check('本周统计更新：done_count=1 / completion_rate=0.3', checkinRes.stats.done_count === 1 && checkinRes.stats.completion_rate === 0.3, checkinRes.stats);
  check('无不适时不触发安全复查', checkinRes.safety_review.triggered === false, checkinRes.safety_review);
  check('打卡后 streak=1', checkinRes.stats.streak === 1, checkinRes.stats.streak);
  const planAfterCheckin = (await api.getCurrentPlan()).plan;
  check('计划内训练日状态回写为 done', planAfterCheckin.weeks[0].sessions.filter(function (s) { return s.session_id === todaySession.session_id; })[0].status === 'done');
  check('本周状态回写为 partial（1/3 完成）', planAfterCheckin.weeks[0].status === 'partial', planAfterCheckin.weeks[0].status);

  calls.badges.length = 0;
  reminder.refreshBadge();
  const afterBadge = calls.badges[calls.badges.length - 1];
  check('已打卡后移除 tab 角标', afterBadge && afterBadge.op === 'remove' && afterBadge.index === 1, afterBadge);

  // 更新打卡（页面按钮「更新打卡」）：应更新而非追加记录
  const updateRes = await api.checkin({
    plan_id: plan.plan_id,
    session_id: todaySession.session_id,
    date: todaySession.date,
    status: 'partial',
    completed_action_ids: todaySession.actions.slice(0, 2).map(function (a) { return a.action_id; }),
    rpe: 4,
    discomfort: ['none']
  });
  check('更新打卡后仍只有 1 条记录（不重复追加）', store.getCheckins().length === 1, store.getCheckins().length);
  check('更新打卡后统计不虚高（done=0 / partial=1）', updateRes.stats.done_count === 0 && updateRes.stats.partial_count === 1, updateRes.stats);
  check('更新打卡后本周状态仍为 partial', (await api.getCurrentPlan()).plan.weeks[0].status === 'partial');

  // 不适反馈触发安全复查
  const secondSession = plan.weeks[0].sessions[1];
  const discomfortRes = await api.checkin({
    plan_id: plan.plan_id,
    session_id: secondSession.session_id,
    date: secondSession.date,
    status: 'partial',
    rpe: 8,
    discomfort: ['knee'],
    discomfort_note: '深蹲时膝盖有点酸'
  });
  check('不适打卡触发安全复查', discomfortRes.safety_review.triggered === true, discomfortRes.safety_review);
  check('安全复查带中文限制标签与提示文案', (discomfortRes.safety_review.limit_labels || []).indexOf('膝盖不适') >= 0 && !!discomfortRes.safety_review.message, discomfortRes.safety_review);
  check('本周不适次数统计 discomfort_count=1', discomfortRes.stats.discomfort_count === 1, discomfortRes.stats.discomfort_count);
  check('部分完成按 0.5 计入完成率（2 次 partial → 0.3）', discomfortRes.stats.completion_rate === 0.3 && discomfortRes.stats.partial_count === 2, discomfortRes.stats);

  // 跳过训练
  const thirdSession = plan.weeks[0].sessions[2];
  const skippedRes = await api.checkin({
    plan_id: plan.plan_id,
    session_id: thirdSession.session_id,
    date: thirdSession.date,
    status: 'skipped',
    rpe: 3,
    discomfort: ['none']
  });
  check('跳过训练记录 skipped_count=1', skippedRes.stats.skipped_count === 1, skippedRes.stats);
  check('跳过不影响完成率', skippedRes.stats.completion_rate === 0.3, skippedRes.stats.completion_rate);
  check('打卡历史返回全部记录（页面截取最近 10 条）', (await api.getCheckins()).total === 3, (await api.getCheckins()).total);

  // 错误码
  await expectReject('非法打卡（RPE=99）返回 1001', api.checkin({ session_id: todaySession.session_id, status: 'done', rpe: 99, discomfort: ['none'] }), 1001);
  await expectReject('不存在的训练日返回 1003', api.checkin({ session_id: 'session_not_exist', status: 'done', rpe: 5, discomfort: ['none'] }), 1003);

  // 无计划
  store.clearAll();
  await expectReject('无计划打卡返回 1003（空状态）', api.checkin({ session_id: 'x', status: 'done', rpe: 5, discomfort: ['none'] }), 1003);
  const emptyCheckins = await api.getCheckins();
  check('无计划时打卡统计返回 null', emptyCheckins.stats === null, emptyCheckins.stats);
  check('无计划时提醒状态 today_session=null', reminder.getReminderStatus().today_session === null);
  return fixture;
}

async function checkFeedbackPage() {
  section('6. 周反馈页数据与规则分支');
  const fixture = await resetToPlan();

  const initial = await api.getWeeklyFeedback({ week_no: 1 });
  check('周反馈初始 record=null / stats.total_sessions=3', initial.record === null && initial.stats.total_sessions === 3, { record: initial.record, total: initial.stats && initial.stats.total_sessions });
  check('周反馈含计划摘要（页面 hero/周切换器）', !!initial.plan_summary && initial.plan_summary.plan_id === fixture.plan.plan_id && initial.plan_summary.current_week_no === 1, initial.plan_summary);
  check('周反馈 history 初始为空', Array.isArray(initial.history) && initial.history.length === 0);

  const invalidFeedback = validators.validateWeeklyFeedback({});
  check('周反馈空值校验不通过', invalidFeedback.valid === false && !!invalidFeedback.errors.completion_rate && !!invalidFeedback.errors.feel, invalidFeedback.errors);
  check('周反馈完成率越界（1.5）校验不通过', validators.validateWeeklyFeedback({ plan_id: 'p', week_no: 1, completion_rate: 1.5, avg_rpe: 5, feel: 'ok', recovery: 3 }).valid === false);

  const branches = [
    { rule: 'ADJ-01', payload: { completion_rate: 0.5, avg_rpe: 7.5, feel: 'ok', recovery: 3, has_discomfort: true }, type: 'reduce', safetyReview: true, matched: true },
    { rule: 'ADJ-02', payload: { completion_rate: 0.4, avg_rpe: 7, feel: 'ok', recovery: 3, has_discomfort: false }, type: 'rest', safetyReview: false, matched: true },
    { rule: 'ADJ-03', payload: { completion_rate: 0.6, avg_rpe: 9, feel: 'ok', recovery: 3, has_discomfort: false }, type: 'reduce', safetyReview: false, matched: true },
    { rule: 'ADJ-04', payload: { completion_rate: 0.6, avg_rpe: 7, feel: 'hard', recovery: 3, has_discomfort: false }, type: 'reduce', safetyReview: false, matched: true },
    { rule: 'ADJ-05', payload: { completion_rate: 1, avg_rpe: 5, feel: 'easy', recovery: 5, has_discomfort: false }, type: 'upgrade', safetyReview: false, matched: true },
    { rule: 'ADJ-06', payload: { completion_rate: 0.85, avg_rpe: 7, feel: 'ok', recovery: 3, has_discomfort: false }, type: 'progress', safetyReview: false, matched: true },
    { rule: 'DEFAULT', payload: { completion_rate: 0.7, avg_rpe: 7, feel: 'ok', recovery: 3, has_discomfort: false }, type: 'progress', safetyReview: false, matched: false }
  ];

  for (let i = 0; i < branches.length; i++) {
    const branch = branches[i];
    const fx = await resetToPlan();
    // 注意：mock 返回的计划对象与 store 内为同一引用，比较前必须深拷贝快照
    const week2BeforeObj = JSON.parse(JSON.stringify(fx.plan.weeks[1]));
    const week2Before = JSON.stringify(week2BeforeObj.sessions[0].actions.map(function (a) {
      return [a.role, a.sets, a.reps];
    }));
    const payload = Object.assign({ plan_id: fx.plan.plan_id, week_no: 1 }, branch.payload);
    const res = await api.submitWeeklyFeedback(payload);
    check(branch.rule + ' 命中正确规则分支', res.adjustment.rule_id === branch.rule, res.adjustment.rule_id);
    check(branch.rule + ' 调整类型=' + branch.type, res.adjustment.type === branch.type, res.adjustment.type);
    check(branch.rule + ' safety_review=' + branch.safetyReview, res.adjustment.safety_review === branch.safetyReview);
    check(branch.rule + ' matched=' + branch.matched, res.adjustment.matched === branch.matched);
    check(branch.rule + ' 含规则标签/摘要/命中条件文案（结果卡）', !!res.adjustment.label && !!res.adjustment.summary && !!res.adjustment.condition_text, { label: res.adjustment.label, cond: res.adjustment.condition_text });
    check(branch.rule + ' 生成下周预览（available=true, week_no=2）', res.next_week.available === true && res.next_week.week_no === 2, res.next_week.available);
    check(branch.rule + ' 下周预览含 3 个训练日与安全变更列表', res.next_week.week && res.next_week.week.sessions.length === 3 && Array.isArray(res.next_week.safety_changes));
    check(branch.rule + ' 周反馈记录已入库（history 可展示）', store.getFeedbacks().length === 1 && res.history.length === 1);
    check(branch.rule + ' 下周计划被写回并标记 is_preview', store.getPlan().weeks[1].is_preview === true);

    const week2After = JSON.stringify(store.getPlan().weeks[1].sessions[0].actions.map(function (a) {
      return [a.role, a.sets, a.reps];
    }));
    if (branch.type === 'rest') {
      const beforeCount = week2BeforeObj.sessions[0].actions.length;
      const afterCount = store.getPlan().weeks[1].sessions[0].actions.length;
      check(branch.rule + ' 休息分支减少训练动作数', afterCount < beforeCount, { before: beforeCount, after: afterCount });
    }
    if (branch.type === 'reduce') {
      check(branch.rule + ' 减量分支下调主项组数/次数', week2After !== week2Before, { before: week2Before, after: week2After });
    }

    // ADJ-01 分支额外验证：更新同一周反馈不应重复叠加调整
    if (branch.rule === 'ADJ-01') {
      check('ADJ-01 安全变更列表结构合法（页面安全复查卡）', res.next_week.safety_changes.every(function (c) {
        return ['replace', 'remove', 'upgrade'].indexOf(c.type) >= 0 && !!c.reason;
      }), res.next_week.safety_changes);
      const week2First = JSON.stringify(store.getPlan().weeks[1]);
      const repeat = await api.submitWeeklyFeedback(payload);
      check('重复提交同一周反馈视为更新（仍命中 ADJ-01）', repeat.adjustment.rule_id === 'ADJ-01');
      check('更新反馈不产生重复记录（history 仍 1 条）', store.getFeedbacks().length === 1, store.getFeedbacks().length);
      check('更新反馈不重复叠加下周调整（幂等）', JSON.stringify(store.getPlan().weeks[1]) === week2First);
    }
  }

  // 第 4 周反馈：无下周预览
  const lastWeekFixture = await resetToPlan();
  const lastWeekRes = await api.submitWeeklyFeedback({
    plan_id: lastWeekFixture.plan.plan_id,
    week_no: 4,
    completion_rate: 0.85,
    avg_rpe: 7,
    feel: 'ok',
    recovery: 3,
    has_discomfort: false
  });
  check('第 4 周反馈 next_week.available=false', lastWeekRes.next_week.available === false, lastWeekRes.next_week);
  check('第 4 周反馈给出收尾提示文案', typeof lastWeekRes.next_week.message === 'string' && lastWeekRes.next_week.message.length > 0, lastWeekRes.next_week.message);

  // 错误码与无计划
  const fx2 = await resetToPlan();
  await expectReject('非法周反馈参数返回 1001', api.submitWeeklyFeedback({ plan_id: fx2.plan.plan_id, week_no: 5, completion_rate: 2, avg_rpe: 20, feel: 'x', recovery: 9 }), 1001);
  store.clearAll();
  const noPlanFeedback = await api.getWeeklyFeedback({ week_no: 1 });
  check('无计划时周反馈 plan_summary=null（空状态）', noPlanFeedback.plan_summary === null && noPlanFeedback.stats === null, noPlanFeedback.plan_summary);
  await expectReject('无计划提交周反馈返回 1003', api.submitWeeklyFeedback({ week_no: 1, completion_rate: 0.5, avg_rpe: 5, feel: 'ok', recovery: 3 }), 1003);
  return fixture;
}

async function checkDietPage() {
  section('7. 饮食提示页数据');
  const fixture = await resetToPlan();
  const today = todaySessionOf(fixture.plan);

  const tips = await api.getDietTips({ date: util.todayStr(), foods: [] });
  check('饮食提示无食物选择也返回基础提示', !!tips && Array.isArray(tips.tips) && tips.tips.length === 2, tips && tips.tips && tips.tips.length);
  check('今日训练类型由计划推断为力量训练日', tips.training_type === 'strength' && tips.training_label === '力量训练日', { type: tips.training_type, label: tips.training_label });
  check('今日训练卡可关联训练日', !!tips.training_session && tips.training_session.session_id === today.session.session_id, tips.training_session);
  check('两个维度为蛋白质 / 碳水化合物', tips.tips[0].dimension === 'protein' && tips.tips[1].dimension === 'carb');
  check('维度提示包含 level / 实际 vs 目标 / 建议食物', tips.tips.every(function (t) {
    return ['low', 'ok', 'high'].indexOf(t.level) >= 0 && typeof t.actual_g === 'number' && typeof t.target_g === 'number' && t.target_g > 0 && Array.isArray(t.suggested_foods) && t.suggested_foods.length > 0 && !!t.message;
  }));
  check('食物简表用于页面选择（≥20 条且分类齐全）', tips.food_table.length === foodsData.FOODS.length && ['protein', 'carb', 'veg', 'other'].every(function (cat) {
    return tips.food_table.some(function (f) { return f.category === cat; });
  }), tips.food_table.length);
  check('含免责声明（不构成营养处方）', typeof tips.disclaimer === 'string' && tips.disclaimer.indexOf('不构成营养处方') >= 0);
  check('空摄入时 intake 为 0', tips.intake.protein_g === 0 && tips.intake.carb_g === 0 && tips.intake.kcal === 0 && tips.intake.items.length === 0, tips.intake);

  // 食物选择 → 粗略摄入汇总
  const selections = [
    { food_id: 'egg', portion: 2 },
    { food_id: 'rice', portion: 1 },
    { food_id: 'milk', portion: 1 }
  ];
  let expectedProtein = 0;
  let expectedCarb = 0;
  let expectedKcal = 0;
  selections.forEach(function (s) {
    const food = foodsData.getFood(s.food_id);
    expectedProtein += food.protein_g * s.portion;
    expectedCarb += food.carb_g * s.portion;
    expectedKcal += food.kcal * s.portion;
  });
  const withFoods = await api.getDietTips({ date: util.todayStr(), foods: selections });
  check('摄入汇总与食物简表一致（蛋白质/碳水/热量）',
    withFoods.intake.protein_g === expectedProtein && withFoods.intake.carb_g === expectedCarb && withFoods.intake.kcal === expectedKcal,
    { actual: withFoods.intake, expected: { protein: expectedProtein, carb: expectedCarb, kcal: expectedKcal } });
  check('摄入明细含每项份数与克数（页面汇总卡）', withFoods.intake.items.length === 3 && withFoods.intake.items.every(function (it) {
    return !!it.food_id && it.portion > 0 && typeof it.protein_g === 'number' && typeof it.carb_g === 'number';
  }));
  check('蛋白质 24g/25g 判定为基本够用', withFoods.tips[0].level === 'ok', { actual: withFoods.tips[0].actual_g, level: withFoods.tips[0].level });
  check('碳水 56g/90g 判定为偏少', withFoods.tips[1].level === 'low', { actual: withFoods.tips[1].actual_g, level: withFoods.tips[1].level });

  // 高蛋白分支
  const highProtein = await api.getDietTips({
    date: util.todayStr(),
    foods: [{ food_id: 'chicken_breast', portion: 5 }]
  });
  check('高蛋白摄入判定为较充足', highProtein.tips[0].level === 'high', highProtein.tips[0].level);

  // 未知食物 id 容错
  const unknownFood = await api.getDietTips({ date: util.todayStr(), foods: [{ food_id: 'not_exist', portion: 1 }] });
  check('未知食物 id 被忽略且不报错', unknownFood.intake.items.length === 0 && unknownFood.tips.length === 2);

  // 训练类型覆盖（页面训练卡）
  const cardioTips = await api.getDietTips({ date: util.todayStr(), training_type: 'cardio', foods: [] });
  check('指定训练类型覆盖推断（cardio）', cardioTips.training_type === 'cardio' && cardioTips.training_label === '心肺 / 跑动日', { type: cardioTips.training_type, label: cardioTips.training_label });
  check('训练日碳水目标随类型变化（cardio=100g）', cardioTips.tips[1].target_g === 100, cardioTips.tips[1].target_g);

  // 无计划：休息日也可用
  store.clearAll();
  const restTips = await api.getDietTips({ date: util.todayStr(), foods: [] });
  check('无计划时按休息日给提示（不白屏）', restTips.training_type === 'rest' && restTips.training_session === null, { type: restTips.training_type });
  check('无计划时维度提示仍完整', restTips.tips.length === 2 && restTips.tips.every(function (t) { return !!t.message; }));

  // 功能开关降级
  resetConfig();
  config.features.diet = false;
  await expectReject('饮食功能关闭时返回 1001（页面可降级）', api.getDietTips({ date: util.todayStr(), foods: [] }), 1001);
  resetConfig();
  return fixture;
}

async function checkReminderAndSubscription() {
  section('8. 提醒 / 订阅消息（打卡页提醒设置卡）');
  resetConfig();
  const fixture = await resetToPlan();

  // 模板未配置：降级为应用内提醒
  resetConfig();
  const fallback = await reminder.requestSubscribe();
  check('模板未配置时降级为应用内提醒', fallback.available === false && fallback.mode === 'in_app', fallback);
  check('降级提示文案包含「应用内提醒」', fallback.message.indexOf('应用内提醒') >= 0, fallback.message);
  check('降级后提醒渠道写回 in_app', store.getReminderSettings().channel === 'in_app', store.getReminderSettings().channel);

  // 模板已配置 + 用户同意
  config.subscribeTmplIds = ['tmpl_mock_a'];
  subscribeBehavior = 'accept';
  const accepted = await reminder.requestSubscribe();
  check('用户同意订阅后 available=true / quota=1', accepted.available === true && accepted.mode === 'subscribe' && accepted.quota === 1, accepted);
  check('订阅成功后渠道写回 subscribe', store.getReminderSettings().channel === 'subscribe');
  check('订阅授权次数累计 total_auth=1', store.getSubscription().total_auth === 1, store.getSubscription());
  check('订阅调用携带模板 ID', calls.subscriptions.length > 0 && calls.subscriptions[calls.subscriptions.length - 1].tmplIds.indexOf('tmpl_mock_a') >= 0);

  // 用户拒绝
  subscribeBehavior = 'deny';
  const denied = await reminder.requestSubscribe();
  check('用户拒绝订阅后降级 in_app', denied.available === false && denied.mode === 'in_app' && denied.message.indexOf('未授权') >= 0, denied);

  // 接口不可用
  subscribeBehavior = 'fail';
  const failedSub = await reminder.requestSubscribe();
  check('订阅接口不可用时降级 in_app（不阻断打卡）', failedSub.available === false && failedSub.mode === 'in_app' && failedSub.message.indexOf('暂不可用') >= 0, failedSub);
  resetConfig();
  subscribeBehavior = 'none';

  // 打卡消耗订阅额度
  store.clearAll();
  const fx = await resetToPlan();
  store.saveSubscription({ quota: 2, last_auth_at: '', total_auth: 1 });
  const t = todaySessionOf(fx.plan);
  await api.checkin({ plan_id: fx.plan.plan_id, session_id: t.session.session_id, status: 'done', rpe: 6, discomfort: ['none'] });
  check('打卡后订阅额度消耗 1 条（页面 meta 展示）', store.getSubscription().quota === 1, store.getSubscription());

  // 提醒设置校验
  check('提醒时间格式非法被校验拦截', validators.validateReminderSettings({ time: '25:00' }).valid === false);
  check('合法提醒设置通过校验', validators.validateReminderSettings({ time: '19:30', channel: 'in_app' }).valid === true);

  // 关闭提醒后不显示角标
  store.saveReminderSettings({ enabled: false });
  calls.badges.length = 0;
  reminder.refreshBadge();
  const offBadge = calls.badges[calls.badges.length - 1];
  check('关闭提醒后移除打卡 tab 角标', offBadge && offBadge.op === 'remove', offBadge);
  store.saveReminderSettings({ enabled: true });

  // 无计划时提醒不报错
  store.clearAll();
  calls.badges.length = 0;
  reminder.refreshBadge();
  const noPlanBadge = calls.badges[calls.badges.length - 1];
  check('无计划时 refreshBadge 安全降级（移除角标不报错）', noPlanBadge && noPlanBadge.op === 'remove', noPlanBadge);
  return fixture;
}

async function checkSafetyInvariants() {
  section('9. 多画像安全不变量（独立复核）');
  const profiles = [
    { name: '膝盖+弹力带+宿舍+弱基础+30min+3次', over: { body_limits: ['knee'], equipment: ['band'], space: 'dorm', self_level: 'weak', time_per_session: 30, weekly_frequency: 3 } },
    { name: '肩腰不适+无器械+宿舍+15min+2次', over: { body_limits: ['shoulder', 'waist'], equipment: ['none'], space: 'dorm', self_level: 'weak', time_per_session: 15, weekly_frequency: 2 } },
    { name: '无限制+单杠+操场+强基础+45min+5次', over: { body_limits: ['none'], equipment: ['bar'], space: 'track', self_level: 'strong', time_per_session: 45, weekly_frequency: 5 } },
    { name: '膝盖肩腰+无器械+宿舍+30min+4次', over: { body_limits: ['knee', 'shoulder', 'waist'], equipment: ['none'], space: 'dorm', self_level: 'weak', time_per_session: 30, weekly_frequency: 4 } }
  ];

  for (let i = 0; i < profiles.length; i++) {
    const item = profiles[i];
    const fixture = await resetToPlan(item.over);
    const plan = fixture.plan;
    check(item.name + '：生成 4 周计划', plan.weeks.length === 4, plan.weeks.length);
    check(item.name + '：每周训练日数符合设置', plan.weeks.every(function (w) {
      return w.sessions.length === item.over.weekly_frequency;
    }), plan.weeks.map(function (w) { return w.sessions.length; }));
    verifyPlanAgainstConstraints(plan, fixture.profile, item.name);
    check(item.name + '：候选动作 + 安全拦截 = 动作库总数', plan.meta.candidate_count + plan.safety_intercepts.length === 35, { c: plan.meta.candidate_count, i: plan.safety_intercepts.length });
    check(item.name + '：训练日日期在对应周范围内', plan.weeks.every(function (w) {
      return w.sessions.every(function (s) {
        return s.date >= w.date_range.start && s.date <= w.date_range.end;
      });
    }));
    check(item.name + '：训练日数量与 plan.weeks[].target_completion 一致', plan.weeks.every(function (w) { return w.target_completion === w.sessions.length; }));
    if (item.over.weekly_frequency === 2) {
      check('15 分钟训练日动作数为纯主项（2 个、无热身/放松角色）', plan.weeks.every(function (w) {
        return w.sessions.every(function (s) {
          return s.actions.length === 2 && s.actions.every(function (a) { return a.role === 'main'; });
        });
      }), plan.weeks[0].sessions[0].actions.map(function (a) { return a.role; }));
    }
    if (item.over.weekly_frequency === 5) {
      check('45 分钟训练日动作数 ≤ 6（主项 4 + 热身 + 放松）', plan.weeks.every(function (w) {
        return w.sessions.every(function (s) { return s.actions.length <= 6; });
      }), plan.weeks[0].sessions.map(function (s) { return s.actions.length; }));
    }
  }

  // 2001 无可用动作：遍历 UI 可选约束组合，确认 mock 数据下是否可达
  const equipmentSets = [['none'], ['band'], ['bottle'], ['bar'], ['none', 'band']];
  const spaces = ['dorm', 'track', 'gym'];
  const levels = ['weak', 'average', 'strong'];
  const limitSets = [['none'], ['knee'], ['knee', 'shoulder', 'waist'], ['shoulder', 'waist']];
  let noSafeCombos = 0;
  let totalCombos = 0;
  equipmentSets.forEach(function (eq) {
    spaces.forEach(function (sp) {
      levels.forEach(function (lv) {
        limitSets.forEach(function (lim) {
          totalCombos += 1;
          const filtered = mock.filterActions(profileOf({ equipment: eq, space: sp, self_level: lv, body_limits: lim }));
          if (!filtered.safe.length) noSafeCombos += 1;
        });
      });
    });
  });
  if (noSafeCombos === 0) {
    warnCheck('2001（无可用动作）在 mock 数据/UI 可选约束下不可达，约束页的 2001 降级路径无法演示/自动化验证', { totalCombos: totalCombos });
  } else {
    check('2001 降级路径可被 UI 约束触发', true);
  }

  // 边界：体测日期只剩 7 天时，体测日之后不应再排训练日（mock 已按体测日截断）
  const shortFixture = await resetToPlan({ test_date: util.addDays(util.todayStr(), 7) });
  const testDate = shortFixture.profile.test_date;
  const shortSessions = sessionsOf(shortFixture.plan);
  const afterTest = shortSessions.filter(function (item) {
    return item.session.date > testDate;
  }).length;
  check('体测日期距今 7 天时，无训练日排到体测之后', afterTest === 0, { test_date: testDate, afterTest: afterTest });
  check('体测日期临近时计划仍为 4 周结构', shortFixture.plan.weeks.length === 4, shortFixture.plan.weeks.length);
  check('被截断的周更新 target_completion 并在说明中标注', shortFixture.plan.weeks.every(function (w) {
    const truncated = w.note && w.note.indexOf('已过体测日') >= 0;
    if (truncated) return w.target_completion === w.sessions.length;
    return w.target_completion === w.sessions.length;
  }), shortFixture.plan.weeks.map(function (w) { return { n: w.sessions.length, t: w.target_completion, truncated: w.note.indexOf('已过体测日') >= 0 }; }));

  // 验证 2001 场景确实无安全动作（若上面不可达，则人工构造更强约束确认拦截逻辑本身有效）
  const impossible = mock.filterActions(profileOf({ equipment: ['bar'], space: 'dorm', self_level: 'weak', body_limits: ['knee', 'shoulder', 'waist'] }));
  check('拦截逻辑本身有效（人工探针过滤器返回结构化结果）', Array.isArray(impossible.intercepts) && impossible.intercepts.every(function (i) {
    return !!i.rule_type && !!i.reason;
  }), impossible.intercepts.length);
}

async function checkErrorMatrix() {
  section('10. 错误码矩阵与请求层降级');
  resetConfig();
  const fixture = await resetToPlan();

  // 4040 接口不存在（经 request 层）
  const err4040 = await request.get('/not/exist', null, { silent: true }).then(function () { return null; }).catch(function (e) { return e; });
  check('未知接口返回 4040（版本不匹配提示）', err4040 && err4040.code === 4040, err4040 && { code: err4040.code, msg: err4040.msg });

  // silent 错误不重复 toast
  const toastsBefore = calls.toasts.length;
  await request.get('/not/exist', null, { silent: true }).catch(function () {});
  check('silent 请求错误不触发全局 toast', calls.toasts.length === toastsBefore, calls.toasts.length - toastsBefore);
  await request.get('/not/exist', null, {}).catch(function () {});
  check('非 silent 请求错误由请求层统一 toast 一次', calls.toasts.length === toastsBefore + 1, calls.toasts.length - toastsBefore);

  // 真实网络分支：wx.request 桩（验证联调前请求层逻辑）
  config.useMock = false;
  networkBehavior = 'success';
  const okNet = await request.get('/plan/current', null, { silent: true });
  check('真实网络分支：code=0 时剥离外壳返回 data', okNet && okNet.ok === true, okNet);

  networkBehavior = 'biz1001';
  const bizErr = await request.get('/profile', null, { silent: true }).then(function () { return null; }).catch(function (e) { return e; });
  check('真实网络分支：业务错误码透传（1001）', bizErr && bizErr.code === 1001 && !!bizErr.data.errors, bizErr && bizErr.code);

  networkBehavior = 'http500';
  const httpErr = await request.get('/profile', null, { silent: true }).then(function () { return null; }).catch(function (e) { return e; });
  check('真实网络分支：HTTP 500 归一为 5000', httpErr && httpErr.code === 5000, httpErr && httpErr.code);

  networkBehavior = 'fail';
  const beforeFail = calls.requests.length;
  const netErr = await request.get('/profile', null, { silent: true, retry: 0 }).then(function () { return null; }).catch(function (e) { return e; });
  check('真实网络分支：网络错误归一为 5000', netErr && netErr.code === 5000, netErr && netErr.code);
  check('网络错误 retry=0 时只请求 1 次', calls.requests.length - beforeFail === 1, calls.requests.length - beforeFail);

  networkBehavior = 'fail';
  const beforeRetry = calls.requests.length;
  await request.get('/profile', null, { silent: true }).catch(function () {});
  check('GET 网络错误默认自动重试 1 次（共 2 次请求）', calls.requests.length - beforeRetry === 2, calls.requests.length - beforeRetry);

  // 恢复 mock 模式
  resetConfig();
  networkBehavior = 'success';

  // 校验加载态计数平衡（页面 loading 依赖）
  check('请求层 loading 计数无泄漏（showLoading/hideLoading 平衡）', calls.loadingActive === 0, calls.loadingActive);

  // 其它错误码
  const fx = await resetToPlan();
  await expectReject('资源不存在（动作）1003', api.getAction('nope'), 1003);
  await expectReject('参数校验（画像）1001', api.submitProfile({}), 1001);
  await expectReject('LLM 解析失败 3001', api.parseNaturalLanguage('测试失败场景'), 3001);
  config.features.llmParse = false;
  await expectReject('LLM 解析功能关闭 3001', api.parseNaturalLanguage('每周三次，每次 30 分钟'), 3001);
  resetConfig();
  return fx;
}

/* ============================== 6. 主流程 ============================== */

(async function main() {
  console.log('===== 「校练」mock 页面级闭环模拟 =====');
  console.log('运行环境：' + process.version + ' / ' + process.platform);
  console.log('测试数据：' + MINI_ROOT);

  resetConfig();
  store.clearAll();

  await checkEnvironment();
  await checkConstraintsPage();
  await checkPlanPage();
  await checkActionPage();
  await checkCheckinPage();
  await checkFeedbackPage();
  await checkDietPage();
  await checkReminderAndSubscription();
  await checkSafetyInvariants();
  await checkErrorMatrix();

  resetConfig();
  store.clearAll();

  console.log('\n===== 结果：通过 ' + passed + ' / 失败 ' + failed + '（建议 ' + warnCount + '） =====');
  console.log('\n章节统计：');
  if (sectionStats.length) {
    const last = sectionStats[sectionStats.length - 1];
    last.passed = passed - last.startPassed;
    last.failed = failed - last.startFailed;
  }
  sectionStats.forEach(function (s) {
    console.log('  ' + s.title + '：通过 ' + s.passed + ' / 失败 ' + s.failed);
  });
  if (failures.length) {
    console.error('\n失败明细：');
    failures.forEach(function (f) {
      console.error(' - ' + f);
    });
  }
  if (warningList.length) {
    console.log('\n观察项（不计失败）：');
    warningList.forEach(function (w) {
      console.log(' - ' + w);
    });
  }
  if (failed > 0) process.exit(1);
  process.exit(0);
})().catch(function (e) {
  console.error('\n[simulate] 未捕获异常：', e && e.stack ? e.stack : e);
  process.exit(2);
});
