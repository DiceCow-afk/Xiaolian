/**
 * Node 侧无头自测：在不开微信开发者工具的情况下验证 mock 服务层完整流程
 * 运行：node tools/smoke_test.js
 * 覆盖：画像校验/保存 → 自然语言解析 → 弱项诊断 → 计划生成 → 计划解释 →
 *       打卡 → 周反馈与调整 → 饮食提示 → 拦截日志 → 动作详情
 */
const path = require('path');

/* ---------- 1. 最小 wx 运行时桩 ---------- */
const storage = {};
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
  showLoading() {},
  hideLoading() {},
  showToast() {},
  setTabBarBadge() {},
  removeTabBarBadge() {}
};

const root = path.resolve(__dirname, '..', 'mini-program');
const store = require(path.join(root, 'utils/store.js'));
const mock = require(path.join(root, 'utils/mock.js'));
const util = require(path.join(root, 'utils/util.js'));
const config = require(path.join(root, 'utils/config.js'));
const api = require(path.join(root, 'utils/api.js'));

let passed = 0;
let failed = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) {
    passed += 1;
    console.log('  ✓ ' + name);
  } else {
    failed += 1;
    failures.push(name + (detail ? ' :: ' + JSON.stringify(detail) : ''));
    console.error('  ✗ ' + name + (detail ? ' :: ' + JSON.stringify(detail) : ''));
  }
}

function unwrap(name, resp, code) {
  const expect = code === undefined ? 0 : code;
  const okResp = resp && resp.code === expect;
  check(name + ' (code=' + expect + ')', okResp, resp && { code: resp.code, msg: resp.msg });
  return okResp ? resp.data : null;
}

async function call(method, url, data) {
  // 直接走 api/request 的 mock 分支，等价于页面调用
  const request = require(path.join(root, 'utils/request.js'));
  if (method === 'GET') return request.get(url, data, { silent: true });
  return request.post(url, data, { silent: true });
}

(async function main() {
  console.log('\n===== 「校练」mock 流程自测 =====\n');
  store.clearAll();

  /* ---------- 画像 ---------- */
  console.log('[1] 用户画像');
  const user = store.ensureUser();
  check('生成匿名用户编号', !!user.user_id);

  const invalidProfile = { target_events: [] };
  const invalidResp = mock.handle('POST', '/profile', { profile: invalidProfile });
  check('非法画像被 1001 拦截', invalidResp.code === 1001, invalidResp);

  const testDate = util.addDays(util.todayStr(), 35);
  const profile = {
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
    test_date: testDate,
    natural_language: '每周三次，每次 30 分钟，宿舍里只有弹力带，膝盖有点不舒服'
  };
  const saveResp = mock.handle('POST', '/profile', { profile: profile });
  const savedProfile = unwrap('保存合法画像', saveResp);
  check('画像已持久化', !!savedProfile && savedProfile.profile.equipment.indexOf('band') >= 0);

  /* ---------- 自然语言解析 ---------- */
  console.log('\n[2] 自然语言解析（LLM 调用点 1）');
  const parseResp = mock.handle('POST', '/profile/parse', {
    text: '每周三次，每次 30 分钟，宿舍里只有弹力带，膝盖有点不舒服，想提升 1000 米和立定跳远成绩'
  });
  const parsed = unwrap('自然语言解析成功', parseResp);
  if (parsed) {
    check('解析出器械', Array.isArray(parsed.parsed.equipment) && parsed.parsed.equipment.length > 0, parsed.parsed);
    check('解析出空间', parsed.parsed.space === 'dorm', parsed.parsed);
    check('解析出身体限制', (parsed.parsed.body_limits || []).indexOf('knee') >= 0, parsed.parsed);
    check('解析出体测项目', (parsed.parsed.target_events || []).length > 0, parsed.parsed);
  }
  const parseFailResp = mock.handle('POST', '/profile/parse', { text: '测试失败场景' });
  check('解析失败返回 3001（可降级表单）', parseFailResp.code === 3001, parseFailResp);

  /* ---------- 弱项诊断 ---------- */
  console.log('\n[3] 弱项诊断与分数贡献');
  const diagResp = mock.handle('POST', '/diagnosis', { profile: savedProfile.profile });
  const diagnosis = unwrap('诊断成功', diagResp);
  if (diagnosis) {
    check('诊断包含体测项目条目', diagnosis.items.length === 3, diagnosis.items.length);
    check('弱项维度不超过 3 个', diagnosis.weak_dimensions.length > 0 && diagnosis.weak_dimensions.length <= 3);
    check('训练资源权重已归一化', Math.abs(diagnosis.allocation.reduce((a, b) => a + b.weight, 0) - 1) <= 0.2);
    const contribution = diagnosis.allocation.reduce((a, b) => a + b.contribution, 0);
    check('贡献可解释（存在 contribution）', contribution >= 0);
  }

  /* ---------- 计划生成 ---------- */
  console.log('\n[4] 4 周周期化计划生成');
  const genResp = mock.handle('POST', '/plan/generate', {});
  const gen = unwrap('计划生成成功', genResp);
  const plan = gen && gen.plan;
  if (plan) {
    check('计划包含 4 周', plan.weeks.length === 4, plan.weeks.length);
    check('每周包含训练日', plan.weeks.every((w) => w.sessions.length === profile.weekly_frequency));
    check('阶段符合周期化（含进展/减量）', plan.weeks.some((w) => w.phase_key === 'build') || plan.weeks.some((w) => w.phase_key === 'taper'));
    check('存在安全拦截记录', Array.isArray(plan.safety_intercepts) && plan.safety_intercepts.length > 0, plan.safety_intercepts && plan.safety_intercepts.length);
    check('膝盖限制下不含深蹲类动作', !plan.weeks.some((w) => w.sessions.some((s) => s.actions.some((a) => ['squat', 'jump_squat', 'lunge', 'wall_sit'].indexOf(a.action_id) >= 0))));
    check('动作不超时：动作数符合约束', plan.weeks.every((w) => w.sessions.every((s) => s.actions.length >= 1 && s.actions.length <= 6)));
    check('每次训练不超过所选时长（动作数上限）', plan.weeks.every((w) => w.sessions.every((s) => s.actions.length <= 6)));
    check('器械约束：不含单杠动作', !plan.weeks.some((w) => w.sessions.some((s) => s.actions.some((a) => a.equipment.indexOf('单杠') >= 0))));
    const todaySession = plan.weeks[0].sessions.filter((s) => s.date === util.todayStr())[0];
    check('今日有训练日可打卡', !!todaySession, plan.weeks[0].sessions.map((s) => s.date));
    check('训练日含今天标签', todaySession && todaySession.day_label === '今天', todaySession && todaySession.day_label);
  }

  /* ---------- 计划读取 ---------- */
  console.log('\n[5] 计划读取与解释');
  const currentResp = mock.handle('GET', '/plan/current');
  const current = unwrap('读取当前计划', currentResp);
  check('当前计划与生成一致', current && current.plan && current.plan.plan_id === plan.plan_id);
  const explainResp = mock.handle('POST', '/plan/explain', { plan_id: plan.plan_id });
  const explanation = unwrap('计划解释（LLM 调用点 2）', explainResp);
  if (explanation) {
    check('解释不增删改计划', explanation.checks.plan_unchanged === true);
    check('解释文本包含安全说明', explanation.text.indexOf('安全') >= 0);
  }
  const afterExplain = mock.handle('GET', '/plan/current').data.plan;
  check('解释后计划组次未变', JSON.stringify(afterExplain.weeks) === JSON.stringify(plan.weeks));

  /* ---------- 动作详情 ---------- */
  console.log('\n[6] 动作详情与示范资源');
  const actionResp = mock.handle('GET', '/actions/squat');
  const action = unwrap('动作详情读取成功', actionResp);
  if (action) {
    check('动作含关键帧示范', action.demo.type === 'frames' && action.demo.frames.length === 4);
    check('动作含降阶路径', !!action.regression && action.regression.name);
    check('动作含正误对比', Array.isArray(action.correct_vs_wrong) && action.correct_vs_wrong.length > 0);
    check('禁忌提示与画像一致', action.current_profile.conflict.indexOf('knee') >= 0, action.current_profile);
  }
  const missingAction = mock.handle('GET', '/actions/not_exist');
  check('不存在动作返回 1003', missingAction.code === 1003, missingAction);

  /* ---------- 打卡 ---------- */
  console.log('\n[7] 打卡与统计');
  const week1 = plan.weeks[0];
  const todaySession = week1.sessions.filter((s) => s.date === util.todayStr())[0];
  const checkinResp = mock.handle('POST', '/checkin', {
    plan_id: plan.plan_id,
    session_id: todaySession.session_id,
    date: todaySession.date,
    status: 'done',
    completed_action_ids: todaySession.actions.map((a) => a.action_id),
    rpe: 7,
    discomfort: ['none'],
    discomfort_note: '',
    note: '今天状态不错',
    duration_actual_min: 28
  });
  const checkinData = unwrap('打卡成功', checkinResp);
  if (checkinData) {
    check('打卡记录已持久化', store.getCheckins().length === 1);
    check('本周统计更新', checkinData.stats.done_count === 1 && checkinData.stats.completion_rate > 0);
    check('无不适时不触发安全复查', checkinData.safety_review.triggered === false);
  }
  const invalidCheckin = mock.handle('POST', '/checkin', {
    plan_id: plan.plan_id,
    session_id: todaySession.session_id,
    status: 'done',
    rpe: 99,
    discomfort: ['none']
  });
  check('非法 RPE 被 1001 拦截', invalidCheckin.code === 1001, invalidCheckin);

  const discomfortCheckinResp = mock.handle('POST', '/checkin', {
    plan_id: plan.plan_id,
    session_id: week1.sessions[1].session_id,
    date: week1.sessions[1].date,
    status: 'partial',
    rpe: 8,
    discomfort: ['knee'],
    discomfort_note: '深蹲时膝盖有点酸',
    note: ''
  });
  const discomfortCheckin = unwrap('不适打卡成功', discomfortCheckinResp);
  check('不适反馈触发安全复查', discomfortCheckin && discomfortCheckin.safety_review.triggered === true, discomfortCheckin && discomfortCheckin.safety_review);

  /* ---------- 周反馈 ---------- */
  console.log('\n[8] 周反馈与动态调整');
  const feedbackGet = mock.handle('GET', '/feedback/weekly', { week_no: 1 });
  const feedbackData = unwrap('读取周反馈数据', feedbackGet);
  if (feedbackData) {
    check('周统计已计算', feedbackData.stats && feedbackData.stats.total_sessions === 3, feedbackData.stats);
    check('周反馈含计划摘要', !!feedbackData.plan_summary && feedbackData.plan_summary.plan_id === plan.plan_id);
  }
  const weeklyResp = mock.handle('POST', '/feedback/weekly', {
    plan_id: plan.plan_id,
    week_no: 1,
    completion_rate: 0.5,
    avg_rpe: 7.5,
    feel: 'ok',
    recovery: 3,
    has_discomfort: true,
    note: '膝盖有点不舒服'
  });
  const weekly = unwrap('提交周反馈', weeklyResp);
  if (weekly) {
    check('命中不适优先规则 ADJ-01', weekly.adjustment.rule_id === 'ADJ-01', weekly.adjustment);
    check('调整类型为减量', weekly.adjustment.type === 'reduce');
    check('生成下周预览', weekly.next_week && weekly.next_week.available === true, weekly.next_week);
    check('周反馈已入库', store.getFeedbacks().length === 1);
    const planAfter = store.getPlan();
    check('下周计划已被动态调整写回', planAfter.weeks[1].is_preview === true);
  }
  const restWeekResp = mock.handle('POST', '/feedback/weekly', {
    plan_id: plan.plan_id,
    week_no: 1,
    completion_rate: 1,
    avg_rpe: 5,
    feel: 'easy',
    recovery: 5,
    has_discomfort: false
  });
  const restWeek = unwrap('升阶分支提交成功', restWeekResp);
  check('完成度高且强度低命中升阶 ADJ-05', restWeek && restWeek.adjustment.rule_id === 'ADJ-05', restWeek && restWeek.adjustment);

  /* ---------- 饮食提示 ---------- */
  console.log('\n[9] 饮食提示（拓展）');
  const dietResp = mock.handle('GET', '/diet/tips', {
    date: util.todayStr(),
    foods: [
      { food_id: 'egg', portion: 1 },
      { food_id: 'rice', portion: 1 }
    ]
  });
  const diet = unwrap('饮食提示读取成功', dietResp);
  if (diet) {
    check('返回两个饮食维度', diet.tips.length === 2);
    check('蛋白质维度有判断', ['low', 'ok', 'high'].indexOf(diet.tips[0].level) >= 0);
    check('包含食物简表', diet.food_table.length >= 20);
    check('包含免责声明', !!diet.disclaimer);
  }

  /* ---------- 拦截日志 ---------- */
  console.log('\n[10] 安全拦截日志');
  const logResp = mock.handle('GET', '/logs/intercepts');
  const logs = unwrap('拦截日志读取成功', logResp);
  if (logs) {
    check('日志总数与计划一致', logs.total === plan.safety_intercepts.length, { total: logs.total });
    check('日志按类型统计', Object.keys(logs.by_type).length > 0);
    check('存在身体限制类型拦截', (logs.by_type.body_limit || 0) > 0, logs.by_type);
  }

  /* ---------- 单侧日志 ---------- */
  console.log('\n[11] 错误码与降级路径');
  const unknownResp = mock.handle('GET', '/not/exist');
  check('未知接口返回 4040', unknownResp.code === 4040, unknownResp);
  const noPlanStore = store.getPlan();
  store.clearAll();
  const noPlan = mock.handle('GET', '/plan/current');
  check('清空后无计划返回空数据而非报错', noPlan.code === 0 && noPlan.data.plan === null);
  store.savePlan(noPlanStore);

  console.log('\n===== 结果：通过 ' + passed + ' / 失败 ' + failed + ' =====');
  if (failed) {
    console.error('\n失败项：');
    failures.forEach(function (f) {
      console.error(' - ' + f);
    });
    process.exit(1);
  }
})().catch(function (e) {
  console.error('\n[smoke] 未捕获异常：', e);
  process.exit(1);
});
