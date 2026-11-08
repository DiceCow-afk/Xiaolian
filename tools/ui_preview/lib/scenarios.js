/**
 * UI 预览场景定义
 *
 * 每个场景 = 一次「mock 数据准备 + 页面生命周期驱动 + 关键交互」，最后把页面 data 交给 WXML 近似渲染器。
 * 数据全部来自仓库内 mock 层与页面真实 JS（不是手写假数据），因此能覆盖各页的主路径状态。
 *
 * 场景字段：
 *  name       输出文件名（page-<page>-<state>.png）
 *  page       页面路径（相对 mini-program）
 *  title      overview / README 展示用标题
 *  description 场景说明
 *  prepare()  场景开始前重置/构造 mock 数据（清空 storage，避免场景间串数据）
 *  args       onLoad 参数
 *  ready(page)     数据就绪判定（轮询直到为真）
 *  drive(page)     可选：就绪后继续模拟交互
 *  settle(page)    可选：交互后的完成判定
 *  scrollTo        截图前滚动的元素选择器（空 = 顶部）
 */
'use strict';

function createScenarios(runtime) {
  const store = runtime.requireMini('utils/store.js');
  const mock = runtime.requireMini('utils/mock.js');
  const util = runtime.requireMini('utils/util.js');
  const sleep = runtime.sleep;

  const PROFILE_FACTORY = function () {
    return {
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
      test_date: util.addDays(util.todayStr(), 35),
      natural_language: '每周三次，每次 30 分钟，宿舍里只有弹力带，膝盖有点不舒服，想提升 1000 米成绩'
    };
  };

  function resetAll() {
    runtime.clearStorage();
  }

  function seedProfile() {
    resetAll();
    store.ensureUser();
    store.saveProfile(PROFILE_FACTORY());
    return store.getProfile();
  }

  function seedPlan() {
    const profile = seedProfile();
    const diagnosis = mock.handle('POST', '/diagnosis', { profile: store.getProfile() }).data;
    const generated = mock.handle('POST', '/plan/generate', {
      profile: store.getProfile(),
      diagnosis: diagnosis
    });
    if (!generated || generated.code !== 0) {
      throw new Error('预览数据准备失败：生成计划 code=' + (generated && generated.code));
    }
    return { profile: profile, plan: generated.data.plan, diagnosis: diagnosis };
  }

  function findTodaySession(plan) {
    const today = util.todayStr();
    for (let i = 0; i < (plan.weeks || []).length; i++) {
      const sessions = plan.weeks[i].sessions || [];
      for (let j = 0; j < sessions.length; j++) {
        if (sessions[j].date === today) return { week: plan.weeks[i], session: sessions[j] };
      }
    }
    return null;
  }

  /** 直接调用 mock 打卡接口造一条今日打卡记录（等价于打卡页提交） */
  function seedTodayCheckin(plan, options) {
    const found = findTodaySession(plan);
    if (!found) throw new Error('预览数据准备失败：计划中今天没有训练日');
    const opts = options || {};
    const response = mock.handle('POST', '/checkin', {
      plan_id: plan.plan_id,
      session_id: found.session.session_id,
      date: found.session.date,
      status: opts.status || 'done',
      completed_action_ids: (found.session.actions || []).map(function (action) {
        return action.action_id;
      }),
      rpe: opts.rpe || 7,
      discomfort: opts.discomfort || ['none'],
      discomfort_note: opts.discomfortNote || '',
      note: opts.note || '状态不错，按计划完成',
      duration_actual_min: found.session.duration_min
    });
    if (!response || response.code !== 0) {
      throw new Error('预览数据准备失败：打卡 code=' + (response && response.code));
    }
    return response.data;
  }

  return [
    /* ================= 约束输入页 ================= */
    {
      name: 'page-constraints-form',
      page: 'pages/constraints/constraints',
      title: '约束输入 · 表单初态',
      description: '无画像首次进入：AI 自然语言卡 + 基本信息表单',
      prepare: resetAll,
      args: {},
      ready: function (page) {
        return page.data.viewState === 'done';
      },
      scrollTo: ''
    },
    {
      name: 'page-constraints-parsed',
      page: 'pages/constraints/constraints',
      title: '约束输入 · AI 解析成功',
      description: '示例文本经 parseNaturalLanguage 解析后回填表单并高亮',
      prepare: resetAll,
      args: {},
      ready: function (page) {
        return page.data.viewState === 'done';
      },
      drive: async function (page) {
        page.onUseExample();
        await sleep(80);
        page.onParse();
        await sleep(1800);
        // 等解析结果回填完成（parseResult 由 applyParsed 设置）
        for (let i = 0; i < 40 && !page.data.parseResult; i++) await sleep(100);
      },
      scrollTo: ''
    },

    /* ================= 计划展示页 ================= */
    {
      name: 'page-plan-4weeks',
      page: 'pages/plan/plan',
      title: '计划展示 · 正常 4 周',
      description: '深色 hero + 4 周切换器 + 周概览 + 训练日卡片',
      prepare: function () {
        seedPlan();
      },
      args: {},
      ready: function (page) {
        return page.data.viewState === 'done' && !!page.data.plan;
      },
      scrollTo: ''
    },
    {
      name: 'page-plan-empty',
      page: 'pages/plan/plan',
      title: '计划展示 · 无计划空态',
      description: '未生成计划时的 empty-state 与去填写约束出口',
      prepare: resetAll,
      args: {},
      ready: function (page) {
        return page.data.viewState === 'done' && !page.data.plan;
      },
      scrollTo: ''
    },
    {
      name: 'page-plan-stale',
      page: 'pages/plan/plan',
      title: '计划展示 · 过期 + 待重算提示',
      description: 'stale 提示条 + 约束已修改待重算提示条',
      prepare: function () {
        seedPlan();
        const plan = store.getPlan();
        plan.generated_date = util.addDays(util.todayStr(), -2);
        store.savePlan(plan);
        store.markProfileDirty();
      },
      args: {},
      ready: function (page) {
        return page.data.viewState === 'done' && page.data.stale === true;
      },
      scrollTo: ''
    },
    {
      name: 'page-plan-explain',
      page: 'pages/plan/plan',
      title: '计划展示 · AI 计划解释弹层',
      description: 'explainPlan 返回后按段落渲染的底部弹层（只读声明）',
      prepare: function () {
        seedPlan();
      },
      args: {},
      ready: function (page) {
        return page.data.viewState === 'done' && !!page.data.plan;
      },
      drive: async function (page) {
        page.onExplainTap();
        for (let i = 0; i < 50 && !page.data.explainLines.length; i++) await sleep(100);
      },
      settle: function (page) {
        return page.data.explainVisible === true && page.data.explainLines.length > 0;
      },
      scrollTo: ''
    },

    {
      name: 'page-plan-explain-bottom',
      page: 'pages/plan/plan',
      title: '计划展示 · 解释弹层滚到底',
      description: '解释正文滚动到底：最后一行完整可见，底部渐隐与「下滑查看」提示已收起',
      prepare: function () {
        seedPlan();
      },
      args: {},
      ready: function (page) {
        return page.data.viewState === 'done' && !!page.data.plan;
      },
      drive: async function (page) {
        page.onExplainTap();
        for (let i = 0; i < 50 && !page.data.explainLines.length; i++) await sleep(100);
        // 模拟用户已滚动到底：收起底部渐隐与提示（渲染静态 HTML 时无滚动事件，直接改数据）
        page.setData({ explainScrolled: true, explainAtBottom: true });
      },
      settle: function (page) {
        return page.data.explainVisible === true && page.data.explainLines.length > 0;
      },
      scrollTo: '',
      scriptAfter:
        '(function(){var el=document.querySelector(".ex-body");if(el){el.scrollTop=el.scrollHeight;}return el?el.scrollTop:-1;})()'
    },

    /* ================= 动作示范页 ================= */
    {
      name: 'page-action-frames',
      page: 'pages/action/action',
      title: '动作示范 · 关键帧播放',
      description: 'frames 类型逐帧播放器（透明底关键帧 + 播放控件）与膝盖禁忌提示',
      prepare: function () {
        seedProfile();
      },
      args: { id: 'squat' },
      ready: function (page) {
        return page.data.viewState === 'done' && page.data.demoType === 'frames';
      },
      drive: async function (page) {
        // 自动播放推进 2 帧左右后再渲染，避免总是第 1 帧
        await sleep(1100);
      },
      scrollTo: ''
    },
    {
      name: 'page-action-text',
      page: 'pages/action/action',
      title: '动作示范 · 图文占位',
      description: 'text 类型动作：占位图 + 「暂无视频示范」提示，无播放控件',
      prepare: function () {
        seedProfile();
      },
      args: { id: 'pushup' },
      ready: function (page) {
        return page.data.viewState === 'done' && page.data.demoType === 'text';
      },
      scrollTo: ''
    },

    /* ================= 提醒打卡页 ================= */
    {
      name: 'page-checkin-today',
      page: 'pages/checkin/checkin',
      title: '提醒打卡 · 今日训练',
      description: '提醒设置卡 + 今日训练动作清单 + 打卡表单（滚动到今日训练卡）',
      prepare: function () {
        seedPlan();
      },
      args: {},
      ready: function (page) {
        return page.data.viewState === 'done' && !!page.data.todaySession;
      },
      scrollTo: '#today-card'
    },
    {
      name: 'page-checkin-checked',
      page: 'pages/checkin/checkin',
      title: '提醒打卡 · 已打卡 + 不适提示',
      description: '勾选全部动作并提交含「膝盖不适」的打卡：回显、安全复查卡片',
      prepare: function () {
        seedPlan();
      },
      args: {},
      ready: function (page) {
        return page.data.viewState === 'done' && !!page.data.todaySession;
      },
      drive: async function (page) {
        const total = (page.data.todayActions || []).length;
        for (let i = 0; i < total; i++) {
          page.onToggleAction({ currentTarget: { dataset: { index: i } } });
        }
        page.onDiscomfortChange({ detail: { value: ['knee'] } });
        page.onDiscomfortNoteInput({ detail: { value: '深蹲时膝盖有点酸，已减小幅度' } });
        page.onRpeChange({ detail: { value: 7 } });
        page.onNoteInput({ detail: { value: '整体完成，膝盖酸胀但可接受' } });
        page.onSubmitCheckin();
        for (let i = 0; i < 60 && !page.data.todayRecord; i++) await sleep(100);
      },
      settle: function (page) {
        // 提交成功后页面还会异步再拉一次打卡历史，等历史回填后再截图
        return !!page.data.todayRecord && !!page.data.safetyReview && (page.data.historyItems || []).length > 0;
      },
      scrollTo: '#submit-area'
    },

    /* ================= 周反馈页 ================= */
    {
      name: 'page-feedback-form',
      page: 'pages/feedback/feedback',
      title: '周反馈 · 填写表单',
      description: '蓝色 hero + 周切换 + 本周统计 + 反馈表单（含 RPE）',
      prepare: function () {
        const seeded = seedPlan();
        seedTodayCheckin(seeded.plan, { status: 'done', rpe: 7 });
      },
      args: {},
      ready: function (page) {
        return page.data.viewState === 'done' && !!page.data.planSummary;
      },
      scrollTo: ''
    },
    {
      name: 'page-feedback-result',
      page: 'pages/feedback/feedback',
      title: '周反馈 · 调整结果卡',
      description: '提交反馈后命中调整分支：规则徽标 + 摘要 + 下周预览 + 安全变更',
      prepare: function () {
        const seeded = seedPlan();
        seedTodayCheckin(seeded.plan, { status: 'done', rpe: 8, discomfort: ['knee'] });
      },
      args: {},
      ready: function (page) {
        return page.data.viewState === 'done' && !!page.data.planSummary;
      },
      drive: async function (page) {
        page.onCompletionRateChange({ detail: { value: 0.5 } });
        page.onRpeChange({ detail: { value: 8 } });
        page.onFeelChange({ detail: { value: 'hard' } });
        page.onRecoveryChange({ detail: { value: 2 } });
        page.onSubmitFeedback();
        for (let i = 0; i < 60 && !(page.data.record && page.data.adjustment); i++) await sleep(100);
        await sleep(300);
      },
      settle: function (page) {
        return !!page.data.record && !!page.data.adjustment && page.data.formOpen === false;
      },
      scrollTo: '#result-card'
    },

    /* ================= 饮食提示页 ================= */
    {
      name: 'page-diet-tips',
      page: 'pages/diet/diet',
      title: '饮食提示 · 含已选食物',
      description: '绿色 hero + 今日训练类型 + 已选食物 + 蛋白质/碳水两维度提示',
      prepare: function () {
        seedPlan();
      },
      args: {},
      ready: function (page) {
        return page.data.viewState === 'done' && !!page.data.hasTips;
      },
      drive: async function (page) {
        page.onFoodGroupChange({ currentTarget: { dataset: { group: 'protein' } }, detail: { value: ['egg'] } });
        await sleep(700);
        page.onFoodGroupChange({ currentTarget: { dataset: { group: 'carb' } }, detail: { value: ['rice'] } });
        for (let i = 0; i < 50 && page.data.tipsLoading; i++) await sleep(100);
        await sleep(500);
      },
      settle: function (page) {
        return page.data.selectedCount >= 2 && page.data.tips.length === 2;
      },
      scrollTo: '.tip-card'
    }
  ];
}

module.exports = {
  createScenarios: createScenarios
};
