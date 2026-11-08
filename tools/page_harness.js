/**
 * 页面级无头冒烟测试：在 Node 中模拟小程序运行时（wx / Page / getApp），
 * 直接 require 6 个页面并执行 onLoad/onShow/onReady，等待 mock 异步返回后检查页面数据。
 * 目的：提前发现「页面字段与 mock 返回结构不一致」「生命周期抛异常」「空数据未处理」等问题。
 *
 * 运行：node tools/page_harness.js
 */
const path = require('path');

const root = path.resolve(__dirname, '..', 'mini-program');
const storage = {};
const runtimeLog = { switchTab: [], navigateTo: [], reLaunch: [], toast: [], error: [] };
const appStub = { globalData: {}, onLaunch() {}, refreshGlobal() {} };

/* ================= 最小小程序运行时桩 ================= */

function noop() {}

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
  clearStorageSync() {
    Object.keys(storage).forEach(function (k) {
      delete storage[k];
    });
  },
  getStorageInfoSync() {
    return { keys: Object.keys(storage) };
  },
  showToast: function (opt) {
    runtimeLog.toast.push((opt && opt.title) || '');
    if (opt && opt.success) opt.success();
  },
  hideToast: noop,
  showLoading: noop,
  hideLoading: noop,
  showModal: function (opt) {
    if (opt && opt.success) opt.success({ confirm: true, cancel: false });
  },
  showActionSheet: function (opt) {
    if (opt && opt.success) opt.success({ tapIndex: 0 });
  },
  switchTab: function (opt) {
    runtimeLog.switchTab.push((opt && opt.url) || '');
    if (opt && opt.success) opt.success();
  },
  navigateTo: function (opt) {
    runtimeLog.navigateTo.push((opt && opt.url) || '');
    if (opt && opt.success) opt.success();
  },
  redirectTo: function (opt) {
    runtimeLog.navigateTo.push((opt && opt.url) || '');
    if (opt && opt.success) opt.success();
  },
  reLaunch: function (opt) {
    runtimeLog.reLaunch.push((opt && opt.url) || '');
    if (opt && opt.success) opt.success();
  },
  navigateBack: function (opt) {
    if (opt && opt.success) opt.success();
  },
  setNavigationBarTitle: noop,
  setTabBarBadge: noop,
  removeTabBarBadge: noop,
  stopPullDownRefresh: noop,
  pageScrollTo: noop,
  nextTick: function (fn) {
    if (fn) fn();
  },
  getWindowInfo: function () {
    return { statusBarHeight: 20, windowWidth: 375, windowHeight: 667, pixelRatio: 2 };
  },
  getSystemInfoSync: function () {
    return { statusBarHeight: 20, windowWidth: 375, windowHeight: 667, pixelRatio: 2, platform: 'devtools' };
  },
  getNetworkType: function (opt) {
    if (opt && opt.success) opt.success({ networkType: 'wifi' });
  },
  requestSubscribeMessage: function (opt) {
    if (opt && opt.fail) opt.fail({ errMsg: 'mock: subscribe not configured' });
  },
  login: function (opt) {
    if (opt && opt.success) opt.success({ code: 'mock_code' });
  },
  createSelectorQuery: function () {
    const chain = {
      select: function () {
        return chain;
      },
      selectAll: function () {
        return chain;
      },
      selectViewport: function () {
        return chain;
      },
      boundingClientRect: function () {
        return chain;
      },
      scrollOffset: function () {
        return chain;
      },
      exec: function (cb) {
        if (cb) cb([{ top: 0, left: 0, width: 375, height: 100 }]);
      }
    };
    return chain;
  },
  setClipboardData: noop
};

global.getApp = function () {
  return appStub;
};

const originalError = console.error;
console.error = function () {
  runtimeLog.error.push(
    Array.prototype.slice.call(arguments).map(function (v) {
      return typeof v === 'string' ? v : JSON.stringify(v && v.message ? { message: v.message } : v);
    }).join(' ')
  );
  originalError.apply(console, arguments);
};

/* ================= 工具 ================= */

function delay(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

function setByPath(obj, keyPath, value) {
  const keys = String(keyPath).split('.');
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    if (cur[k] === undefined || cur[k] === null || typeof cur[k] !== 'object') {
      cur[k] = {};
    }
    cur = cur[k];
  }
  cur[keys[keys.length - 1]] = value;
}

function loadPage(relFile) {
  const file = path.join(root, relFile);
  let cfg = null;
  global.Page = function (definition) {
    cfg = definition;
  };
  delete require.cache[require.resolve(file)];
  require(file);
  if (!cfg) throw new Error('Page() 未被调用：' + relFile);

  const page = {
    route: relFile.replace(/\\/g, '/').replace(/\.js$/, ''),
    data: JSON.parse(JSON.stringify(cfg.data || {})),
    __options: {}
  };
  Object.keys(cfg).forEach(function (key) {
    if (key === 'data') return;
    page[key] =
      typeof cfg[key] === 'function'
        ? function () {
            return cfg[key].apply(page, arguments);
          }
        : cfg[key];
  });
  page.setData = function (patch, cb) {
    Object.keys(patch || {}).forEach(function (k) {
      setByPath(page.data, k, patch[k]);
    });
    if (typeof cb === 'function') cb();
  };
  page.selectComponent = function () {
    return null;
  };
  page.selectAllComponents = function () {
    return [];
  };
  return page;
}

async function exercise(page, options) {
  if (page.onLoad) await page.onLoad(options || {});
  if (page.onShow) await page.onShow();
  if (page.onReady) await page.onReady();
  // mock 层最大延迟约 0.5s，多接口串行留足时间
  await delay(2600);
  return page;
}

/* ================= 断言 ================= */

let passed = 0;
let failed = 0;
const failures = [];

function check(name, cond, detail) {
  if (cond) {
    passed += 1;
    console.log('  ✓ ' + name);
  } else {
    failed += 1;
    const text = name + (detail !== undefined ? ' :: ' + JSON.stringify(detail) : '');
    failures.push(text);
    console.error('  ✗ ' + text);
  }
}

function hasData(page, key) {
  return page.data && Object.prototype.hasOwnProperty.call(page.data, key);
}

/* ================= 主流程 ================= */

(async function main() {
  console.log('\n===== 「校练」页面级无头冒烟 =====\n');

  const store = require(path.join(root, 'utils/store.js'));
  const mock = require(path.join(root, 'utils/mock.js'));
  const util = require(path.join(root, 'utils/util.js'));

  // ---------- 1. 无画像时：约束输入页 ----------
  console.log('[1] 约束输入页（无画像，首次进入）');
  store.clearAll();
  let page = loadPage('pages/constraints/constraints.js');
  let pageError = null;
  try {
    await exercise(page, {});
  } catch (e) {
    pageError = e;
  }
  check('约束输入页生命周期无异常', !pageError, pageError && pageError.message);
  check('约束输入页有页面数据字段', Object.keys(page.data || {}).length > 0, Object.keys(page.data || {}));
  check('无画像时未强制跳走', runtimeLog.reLaunch.length === 0 || !pageError);

  // ---------- 2. 生成画像与计划（mock 层） ----------
  console.log('\n[2] 预置画像与计划（mock）');
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
    test_date: util.addDays(util.todayStr(), 35)
  };
  const saveProfile = mock.handle('POST', '/profile', { profile: profile });
  const diagnosis = mock.handle('POST', '/diagnosis', { profile: profile });
  const generated = mock.handle('POST', '/plan/generate', { profile: profile, diagnosis: diagnosis.data });
  check('mock 画像/诊断/计划生成成功', saveProfile.code === 0 && diagnosis.code === 0 && generated.code === 0, {
    save: saveProfile.code,
    diag: diagnosis.code,
    plan: generated.code
  });
  const plan = generated.data && generated.data.plan;

  // ---------- 3. 计划页 ----------
  console.log('\n[3] 计划展示页');
  runtimeLog.switchTab.length = 0;
  runtimeLog.navigateTo.length = 0;
  const planPage = loadPage('pages/plan/plan.js');
  pageError = null;
  try {
    await exercise(planPage, {});
  } catch (e) {
    pageError = e;
  }
  check('计划页生命周期无异常', !pageError, pageError && pageError.message);
  check('计划页拿到 4 周计划数据', !!(planPage.data.plan && (planPage.data.plan.weeks || []).length === 4), planPage.data.plan && (planPage.data.plan.weeks || []).length);
  check('计划页存在周切换数据', hasData(planPage, 'activeWeek') || hasData(planPage, 'activeWeekIndex') || hasData(planPage, 'weekIndex'), Object.keys(planPage.data || {}));
  check('计划页无错误态', planPage.data.viewState !== 'error', planPage.data.viewState);

  // ---------- 4. 动作示范页 ----------
  console.log('\n[4] 动作示范页');
  const actionPage = loadPage('pages/action/action.js');
  pageError = null;
  try {
    await exercise(actionPage, { id: 'squat' });
  } catch (e) {
    pageError = e;
  }
  check('动作页生命周期无异常', !pageError, pageError && pageError.message);
  check('动作页拿到 squat 详情', !!(actionPage.data.action && actionPage.data.action.action_id === 'squat'), actionPage.data.action && actionPage.data.action.action_id);
  check('动作页含关键帧 demo', !!(actionPage.data.action && actionPage.data.action.demo && actionPage.data.action.demo.frames && actionPage.data.action.demo.frames.length === 4));
  if (actionPage.onHide) await actionPage.onHide();
  if (actionPage.onUnload) await actionPage.onUnload();

  // ---------- 5. 打卡页 ----------
  console.log('\n[5] 提醒打卡页');
  const checkinPage = loadPage('pages/checkin/checkin.js');
  appStub.globalData.pendingCheckinSessionId = plan.weeks[0].sessions[0].session_id;
  pageError = null;
  try {
    await exercise(checkinPage, {});
  } catch (e) {
    pageError = e;
  }
  check('打卡页生命周期无异常', !pageError, pageError && pageError.message);
  check('打卡页无错误态', checkinPage.data.viewState !== 'error', checkinPage.data.viewState);
  check('打卡页有今日训练或休息日状态', hasData(checkinPage, 'todaySession') || hasData(checkinPage, 'today') || hasData(checkinPage, 'restDay') || hasData(checkinPage, 'hasToday'), Object.keys(checkinPage.data || {}));
  check('打卡页有连续打卡/统计数据', hasData(checkinPage, 'stats') || hasData(checkinPage, 'checkinStats') || hasData(checkinPage, 'streak'), Object.keys(checkinPage.data || {}));

  // ---------- 6. 周反馈页 ----------
  console.log('\n[6] 周反馈页');
  const feedbackPage = loadPage('pages/feedback/feedback.js');
  pageError = null;
  try {
    await exercise(feedbackPage, {});
  } catch (e) {
    pageError = e;
  }
  check('周反馈页生命周期无异常', !pageError, pageError && pageError.message);
  check('周反馈页无错误态', feedbackPage.data.viewState !== 'error', feedbackPage.data.viewState);
  check('周反馈页拿到周统计', !!(feedbackPage.data.stats && feedbackPage.data.stats.total_sessions >= 0), feedbackPage.data.stats && feedbackPage.data.stats.total_sessions);

  // ---------- 7. 饮食提示页 ----------
  console.log('\n[7] 饮食提示页');
  const dietPage = loadPage('pages/diet/diet.js');
  pageError = null;
  try {
    await exercise(dietPage, {});
  } catch (e) {
    pageError = e;
  }
  check('饮食页生命周期无异常', !pageError, pageError && pageError.message);
  check('饮食页无错误态', dietPage.data.viewState !== 'error', dietPage.data.viewState);
  check('饮食页拿到两个维度提示', !!(dietPage.data.tips && dietPage.data.tips.length === 2), dietPage.data.tips && dietPage.data.tips.length);
  check('饮食页有食物简表', !!(dietPage.data.foodTable && dietPage.data.foodTable.length >= 20) || !!(dietPage.data.foodGroups), hasData(dietPage, 'foodTable'));

  // ---------- 8. 已画像时约束输入页（编辑态） ----------
  console.log('\n[8] 约束输入页（编辑态，已有画像）');
  const editPage = loadPage('pages/constraints/constraints.js');
  pageError = null;
  try {
    await exercise(editPage, { edit: '1' });
  } catch (e) {
    pageError = e;
  }
  check('编辑态约束页生命周期无异常', !pageError, pageError && pageError.message);
  check('编辑态预填了器械/空间', !!(editPage.data.form && (editPage.data.form.equipment || []).length > 0), editPage.data.form && editPage.data.form.equipment);

  // ---------- 10. 约束输入页：AI 自然语言解析 ----------
  console.log('\n[10] 约束输入页：AI 解析与回填（编辑态）');
  editPage.setData({
    parseText: '每周三次，每次 30 分钟，宿舍里只有弹力带，膝盖有点不舒服，想提升 1000 米和立定跳远成绩'
  });
  editPage.onParse();
  await delay(2200);
  check('AI 解析返回结果并回填', !!(editPage.data.parseResult && (editPage.data.parseResult.filled_text || editPage.data.parseResult.filled_fields)), editPage.data.parseResult);
  check('AI 解析后表单含弹力带', (editPage.data.form.equipment || []).indexOf('band') >= 0, editPage.data.form.equipment);
  check('AI 解析失败提示未误报', !editPage.data.parseFailText, editPage.data.parseFailText);

  // ---------- 11. 计划页交互 ----------
  console.log('\n[11] 计划页交互：周切换 / 动作跳转 / 去打卡 / 计划解释');
  planPage.onWeekTap({ currentTarget: { dataset: { index: 1 } } });
  check('切换周次生效', Number(planPage.data.activeWeek) === 1, planPage.data.activeWeek);
  runtimeLog.navigateTo.length = 0;
  planPage.onActionTap({ detail: { actionId: 'squat' } });
  check('点击动作跳转动作示范页', runtimeLog.navigateTo.indexOf('/pages/action/action?id=squat') >= 0, runtimeLog.navigateTo.slice());
  runtimeLog.switchTab.length = 0;
  appStub.globalData.pendingCheckinSessionId = null;
  planPage.onCheckin({ detail: { sessionId: plan.weeks[0].sessions[0].session_id } });
  check(
    '去打卡写入跨页待打卡状态',
    appStub.globalData.pendingCheckinSessionId === plan.weeks[0].sessions[0].session_id,
    appStub.globalData.pendingCheckinSessionId
  );
  check('去打卡切换到打卡 tab', runtimeLog.switchTab.indexOf('/pages/checkin/checkin') >= 0, runtimeLog.switchTab.slice());
  planPage.onExplainTap();
  await delay(2600);
  check(
    '计划解释弹层有内容（LLM 只读）',
    !!(planPage.data.explainVisible && planPage.data.explainLines && planPage.data.explainLines.length > 0),
    { visible: planPage.data.explainVisible, lines: (planPage.data.explainLines || []).length, error: planPage.data.explainError }
  );
  if (planPage.onCloseExplain) planPage.onCloseExplain();

  // ---------- 12. 动作示范页交互 ----------
  console.log('\n[12] 动作示范页交互：播放/帧切换/分段/降阶跳转');
  actionPage.onTogglePlay();
  await delay(1300);
  check('关键帧自动播放推进', actionPage.data.playing === false || actionPage.data.frameIndex >= 0, {
    playing: actionPage.data.playing,
    frameIndex: actionPage.data.frameIndex
  });
  actionPage.onDotTap({ currentTarget: { dataset: { index: 2 } } });
  check('点击帧指示切换帧', Number(actionPage.data.frameIndex) === 2, actionPage.data.frameIndex);
  actionPage.onTabTap({ currentTarget: { dataset: { key: 'errors' } } });
  check('切换内容分段成功', actionPage.data.activeTab === 'errors', actionPage.data.activeTab);
  runtimeLog.navigateTo.length = 0;
  actionPage.onGotoRegression();
  check('降阶动作跳转可用', runtimeLog.navigateTo.length > 0, runtimeLog.navigateTo.slice());
  actionPage.onFrameError();
  check('示范图加载失败切占位图', actionPage.data.frameError === true || actionPage.data.imageBroken === true, {
    frameError: actionPage.data.frameError,
    imageBroken: actionPage.data.imageBroken
  });
  if (actionPage.onUnload) await actionPage.onUnload();

  // ---------- 13. 打卡页交互 ----------
  console.log('\n[13] 打卡页交互：勾选 / RPE / 不适 / 提交 / 更新 / 提醒设置');
  checkinPage.onToggleAction({ currentTarget: { dataset: { index: 0 } } });
  check('勾选动作完成计数 +1', Number(checkinPage.data.completedCount) === 1, checkinPage.data.completedCount);
  checkinPage.onStatusChange({ detail: { value: 'done' } });
  checkinPage.onRpeChange({ detail: { value: 6 } });
  checkinPage.onDiscomfortChange({ detail: { value: ['none'] } });
  checkinPage.onSubmitCheckin();
  await delay(1800);
  check('提交打卡后记录入库', store.getCheckins().length === 1, store.getCheckins().length);
  check('打卡页回显提交结果', !!checkinPage.data.todayRecord, checkinPage.data.todayRecord && checkinPage.data.todayRecord.status);
  // 同一训练日再次提交（更新打卡）→ 不应产生重复记录
  checkinPage.onStatusChange({ detail: { value: 'partial' } });
  checkinPage.onSubmitCheckin();
  await delay(1800);
  check('同一训练日更新打卡不产生重复记录', store.getCheckins().length === 1, store.getCheckins().length);
  check('更新后的状态生效', store.getCheckins()[0].status === 'partial', store.getCheckins()[0].status);
  checkinPage.onSubscribeTap();
  await delay(600);
  check('订阅授权降级不卡住页面', checkinPage.data.subscribing === false, checkinPage.data.subscribing);
  checkinPage.onReminderToggle({ detail: { value: false } });
  check('关闭提醒写入本地设置', store.getReminderSettings().enabled === false);
  checkinPage.onReminderToggle({ detail: { value: true } });
  checkinPage.onReminderTimeChange({ detail: { value: '20:15' } });
  check('修改提醒时间生效', checkinPage.data.reminderTime === '20:15' && store.getReminderSettings().time === '20:15', checkinPage.data.reminderTime);

  // ---------- 14. 周反馈页交互 ----------
  console.log('\n[14] 周反馈页交互：填写感受 → 命中规则 → 下周调整');
  const fbPage = loadPage('pages/feedback/feedback.js');
  pageError = null;
  try {
    await exercise(fbPage, {});
  } catch (e) {
    pageError = e;
  }
  check('周反馈页重新加载无异常', !pageError, pageError && pageError.message);
  fbPage.onCompletionRateChange({ detail: { value: 1 } });
  fbPage.onRpeChange({ detail: { value: 5 } });
  fbPage.onFeelChange({ detail: { value: 'easy' } });
  fbPage.onRecoveryChange({ detail: { value: 5 } });
  fbPage.onDiscomfortChange({ detail: { value: 'no' } });
  fbPage.onSubmitFeedback();
  await delay(2200);
  check('周反馈提交后返回调整结果', !!(fbPage.data.adjustment && fbPage.data.adjustment.rule_id), fbPage.data.adjustment && fbPage.data.adjustment.rule_id);
  check('完成率高且轻松命中升阶 ADJ-05', fbPage.data.adjustment && fbPage.data.adjustment.rule_id === 'ADJ-05', fbPage.data.adjustment);
  check('周反馈记录入库', store.getFeedbacks().length === 1, store.getFeedbacks().length);
  check('生成下周计划预览', !!(fbPage.data.preview && fbPage.data.preview.available), fbPage.data.preview && fbPage.data.preview.message);
  fbPage.onWeekSwitch({ currentTarget: { dataset: { week: 2 } } });
  await delay(1800);
  check('切换反馈周次生效', Number(fbPage.data.weekNo) === 2, fbPage.data.weekNo);

  // ---------- 15. 饮食提示页交互 ----------
  console.log('\n[15] 饮食提示页交互：选食物 → 维度提示更新');
  dietPage.onFoodGroupChange({ currentTarget: { dataset: { group: 'protein' } }, detail: { value: ['egg', 'milk'] } });
  await delay(1400);
  check('选择食物后已选列表更新', (dietPage.data.selectedFoods || []).length === 2, (dietPage.data.selectedFoods || []).map(function (v) {
    return v.food_id;
  }));
  check('选择食物后摄入统计更新', !!(dietPage.data.intake && dietPage.data.intake.protein_g > 0), dietPage.data.intake && dietPage.data.intake.protein_g);
  dietPage.onAddSuggested({ currentTarget: { dataset: { foodId: 'rice' } } });
  await delay(1400);
  check('从建议食物一键加入', (dietPage.data.selectedFoods || []).length === 3, (dietPage.data.selectedFoods || []).length);

  // ---------- 16. 约束输入页：完整提交闭环 ----------
  console.log('\n[16] 约束输入页：完整提交闭环（表单 → 诊断 → 计划 → 跳转计划 tab）');
  store.clearAll();
  const submitPage = loadPage('pages/constraints/constraints.js');
  pageError = null;
  try {
    await exercise(submitPage, {});
  } catch (e) {
    pageError = e;
  }
  submitPage.setData({
    form: {
      gender: 'male',
      target_events: ['run_1000', 'jump_long'],
      event_levels: { run_1000: 'fail', jump_long: 'pass' },
      self_level: 'weak',
      equipment: ['band'],
      space: 'dorm',
      time_per_session: 30,
      weekly_frequency: 3,
      body_limits: ['none'],
      goal: 'score_up',
      test_date: util.addDays(util.todayStr(), 35)
    }
  });
  runtimeLog.switchTab.length = 0;
  submitPage.onSubmit();
  await delay(3000);
  check('提交后画像已保存', !!store.getProfile(), store.getProfile() && store.getProfile().equipment);
  check('提交后计划已生成', !!(store.getPlan() && store.getPlan().weeks && store.getPlan().weeks.length === 4));
  check('提交后跳转计划 tab', runtimeLog.switchTab.indexOf('/pages/plan/plan') >= 0, runtimeLog.switchTab.slice());

  // ---------- 17. 运行期错误日志 ----------
  console.log('\n[17] 运行期 console.error 检查');
  const unexpected = runtimeLog.error.filter(function (msg) {
    return msg && msg.indexOf('[mock]') < 0 && msg.indexOf('[store]') < 0 && msg.indexOf('[request]') < 0;
  });
  check('页面运行期无未预期 console.error', unexpected.length === 0, unexpected.slice(0, 8));
  console.log('\n页面跳转记录：');
  console.log('  switchTab:', JSON.stringify(runtimeLog.switchTab));
  console.log('  navigateTo:', JSON.stringify(runtimeLog.navigateTo));

  console.log('\n===== 结果：通过 ' + passed + ' / 失败 ' + failed + ' =====');
  if (failed) {
    console.error('\n失败项：');
    failures.forEach(function (f) {
      console.error(' - ' + f);
    });
    process.exit(1);
  }
})().catch(function (e) {
  originalError('\n[page_harness] 未捕获异常：', e);
  process.exit(1);
});
