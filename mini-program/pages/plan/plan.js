/**
 * 计划展示页（tab 0）
 * - 数据：api.getCurrentPlan()（含 stale/days_old）+ store.isProfileDirty()
 * - 展示：深色 hero（距体测 / 当前周与阶段 / 本周重点 / 完成与拦截统计）、
 *         4 周切换器（阶段徽标用 PHASE_META 颜色）、周概览卡、训练日列表、安全拦截、
 *         AI 计划解释底部弹层（只读，不改计划）、重新生成与调整约束入口
 * - 交互：actiontap → 动作示范页；checkin → 记录待打卡训练日后 switchTab 打卡页
 */
const api = require('../../utils/api');
const store = require('../../utils/store');
const util = require('../../utils/util');
const reminder = require('../../utils/reminder');
const options = require('../../data/options');

const PHASE_META = options.PHASE_META || {};
/* 阶段徽标的浅色底：与 PHASE_META.color 搭配，保证深色文字可读 */
const PHASE_BG = {
  base: '#EAF3FF',
  build: '#FFF1EA',
  taper: '#E7F8EF'
};

/** 解释文本按 \n 拆段：空行留间距，【】开头视作小标题，便于弹层阅读 */
function buildExplainLines(text) {
  const lines = String(text || '').split('\n');
  return lines.map(function (line, index) {
    const trimmed = line.replace(/\s+$/, '');
    return {
      key: 'ln_' + index,
      text: trimmed,
      blank: trimmed === '',
      heading: trimmed.indexOf('【') === 0
    };
  });
}

Page({
  data: {
    /* 三态：loading | error | done（done + plan=null 即空状态） */
    viewState: 'loading',
    stateText: '正在读取训练计划…',

    /* 计划主体 */
    plan: null,
    stale: false,
    daysOld: 0,
    profileDirty: false,

    /* 周切换 */
    weeksView: [],
    activeWeek: 0,
    activeWeekData: null,
    currentWeek: null,
    currentWeekIndex: 0,

    /* 安全拦截 */
    safetyIntercepts: [],

    /* Hero 展示字段（加载中/空状态时也有默认文案，避免 undefined） */
    heroKicker: '训练计划 · 4 周周期化',
    heroTitle: '按你的弱项安排训练',
    heroSub: '完成约束输入后，会按体测项目、器械、空间与时间生成 4 周计划',
    heroMeta: [],

    /* 重新生成中（禁用按钮，防重复提交） */
    regenerating: false,

    /* 计划解释底部弹层 */
    explainVisible: false,
    explainLoading: false,
    explainError: '',
    explainLines: [],
    explainModel: '',
    explainFromCache: false,
    /* 解释正文滚动状态：未滚动时给「下滑查看完整解释」提示，滚到底后隐藏底部渐隐 */
    explainScrolled: false,
    explainAtBottom: false
  },

  onLoad() {
    this._hasLoaded = false;
    this.fetchPlan({ silent: false });
  },

  onShow() {
    // tab 页统一刷新打卡角标；返回本页时静默刷新，保证打卡后的训练日状态及时更新
    reminder.refreshBadge();
    if (this._hasLoaded) this.fetchPlan({ silent: true });
  },

  onPullDownRefresh() {
    function done() {
      wx.stopPullDownRefresh();
    }
    this.fetchPlan({ silent: true }).then(done, done);
  },

  /** 首次进入 / 错误态重试（带整页 loading） */
  loadData() {
    this.fetchPlan({ silent: false });
  },

  /**
   * 拉取当前计划
   * @param {Object} opts { silent: 静默刷新（不切 loading，失败保留旧数据） }
   */
  fetchPlan(opts) {
    const silent = !!(opts && opts.silent);
    const self = this;
    if (!silent) {
      this.setData({ viewState: 'loading', stateText: '正在读取训练计划…' });
    }
    return api
      .getCurrentPlan()
      .then(function (res) {
        self._hasLoaded = true;
        self.applyPlanData(res);
      })
      .catch(function (err) {
        self._hasLoaded = true;
        const code = err && err.code;
        const msg = (err && err.msg) || '加载失败，请稍后重试';
        // 静默刷新失败时保留已有内容，错误已由 request 层统一 toast，页面不重复提示
        if (silent && self.data.plan) return;
        self.setData({
          viewState: code === 1003 ? 'done' : 'error',
          stateText: msg
        });
      });
  },

  /** 把接口数据整理成页面可渲染结构（WXML 内不做复杂计算） */
  applyPlanData(res) {
    const data = res || {};
    const plan = data.plan || null;
    const profileDirty = store.isProfileDirty();

    if (!plan) {
      this.setData({
        viewState: 'done',
        plan: null,
        stale: false,
        daysOld: 0,
        profileDirty: profileDirty,
        weeksView: [],
        activeWeek: 0,
        activeWeekData: null,
        currentWeek: null,
        currentWeekIndex: 0,
        safetyIntercepts: [],
        heroKicker: '训练计划 · 4 周周期化',
        heroTitle: '按你的弱项安排训练',
        heroSub: '完成约束输入后，会按体测项目、器械、空间与时间生成 4 周计划',
        heroMeta: []
      });
      return;
    }

    const weeks = Array.isArray(plan.weeks) ? plan.weeks : [];
    const weeksView = this.buildWeeksView(weeks);
    if (!weeksView.length) {
      // 计划结构异常（理论上不会出现）：按空状态处理，避免白屏
      this.setData({
        viewState: 'done',
        plan: null,
        weeksView: [],
        activeWeekData: null,
        currentWeek: null,
        safetyIntercepts: [],
        profileDirty: profileDirty,
        heroMeta: []
      });
      return;
    }

    const currentIndex = this.findCurrentWeekIndex(weeks);
    // 同计划刷新时保留用户选中的周，切换计划/首次进入则定位到当前周
    const keepActive =
      this.data.plan &&
      this.data.plan.plan_id === plan.plan_id &&
      this.data.activeWeek >= 0 &&
      this.data.activeWeek < weeksView.length;
    const activeWeek = keepActive ? this.data.activeWeek : currentIndex;
    const activeWeekData = weeksView[activeWeek] || weeksView[0];
    const currentWeek = weeksView[currentIndex] || weeksView[0];
    const constraints = plan.constraints || {};
    const sessions = currentWeek.sessions || [];
    const doneCount = sessions.filter(function (session) {
      return session.status === 'done';
    }).length;
    const intercepts = Array.isArray(plan.safety_intercepts) ? plan.safety_intercepts : [];
    const today = util.todayStr();
    const daysToTest = plan.test_date
      ? Math.max(0, util.diffDays(today, plan.test_date))
      : Math.max(0, Number(plan.days_to_test) || 0);

    this.setData({
      viewState: 'done',
      plan: plan,
      stale: !!data.stale,
      daysOld: Number(data.days_old) || 0,
      profileDirty: profileDirty,
      weeksView: weeksView,
      activeWeek: activeWeek,
      activeWeekData: activeWeekData,
      currentWeek: currentWeek,
      currentWeekIndex: currentIndex,
      safetyIntercepts: intercepts,
      heroKicker: daysToTest > 0 ? '距体测 D-' + daysToTest : '体测日期已到 · 建议重新生成',
      heroTitle: '第 ' + currentWeek.week_no + ' 周 · ' + currentWeek.phase_name,
      heroSub: currentWeek.weekly_focus,
      heroMeta: [
        { label: '本周训练', value: sessions.length + ' 练' },
        { label: '每次时长', value: (constraints.time_per_session || 30) + ' 分钟' },
        { label: '已完成', value: doneCount + '/' + sessions.length + ' 次' },
        { label: '安全拦截', value: intercepts.length + ' 条' }
      ]
    });
  },

  /** 当前周下标：落在哪一周的日期区间就用哪一周，过期计划回落到最后一周 */
  findCurrentWeekIndex(weeks) {
    const today = util.todayStr();
    for (let i = 0; i < weeks.length; i++) {
      const range = weeks[i].date_range || {};
      if (range.start && range.end && today >= range.start && today <= range.end) return i;
    }
    const last = weeks[weeks.length - 1] || {};
    const lastRange = last.date_range || {};
    if (lastRange.end && today > lastRange.end) return weeks.length - 1;
    return 0;
  },

  buildWeeksView(weeks) {
    return (weeks || []).map(function (week) {
      const meta = PHASE_META[week.phase] || {};
      const sessions = Array.isArray(week.sessions) ? week.sessions : [];
      return {
        week_no: week.week_no,
        phase: week.phase,
        phase_name: week.phase_name || meta.name || '',
        phase_short: meta.short || week.phase_name || '阶段',
        phase_color: meta.color || '#2E90FA',
        phase_bg: PHASE_BG[week.phase] || '#EAF3FF',
        phase_desc: meta.desc || '',
        date_range_text: week.date_range_text || '',
        weekly_focus: week.weekly_focus || '',
        note: week.note || '',
        target_completion: week.target_completion || sessions.length,
        sessions: sessions,
        session_count: sessions.length,
        status: week.status || 'pending'
      };
    });
  },

  /** 切换周 */
  onWeekTap(e) {
    const index = Number(e.currentTarget.dataset.index);
    if (isNaN(index) || index === this.data.activeWeek) return;
    const target = this.data.weeksView[index];
    if (!target) return;
    this.setData({ activeWeek: index, activeWeekData: target });
  },

  /** 点击动作标签 → 动作示范页 */
  onActionTap(e) {
    const detail = e.detail || {};
    const actionId = detail.actionId;
    if (!actionId) {
      wx.showToast({ title: '动作信息缺失，请刷新后重试', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/pages/action/action?id=' + actionId });
  },

  /** 去打卡：把训练日 id 交给打卡页，再切 tab */
  onCheckin(e) {
    const detail = e.detail || {};
    const sessionId = detail.sessionId;
    if (!sessionId) {
      wx.showToast({ title: '训练日信息缺失，请刷新后重试', icon: 'none' });
      return;
    }
    const app = getApp();
    if (app && app.globalData) {
      app.globalData.pendingCheckinSessionId = sessionId;
    }
    wx.switchTab({ url: '/pages/checkin/checkin' });
  },

  /** 调整约束（编辑模式，保存后回计划页重算） */
  onEditConstraints() {
    wx.navigateTo({ url: '/pages/constraints/constraints?edit=1' });
  },

  /** 空状态出口：去填写约束 */
  goConstraints() {
    wx.navigateTo({ url: '/pages/constraints/constraints' });
  },

  /** 重新生成计划（二次确认，避免误触） */
  onRegenerate() {
    if (this.data.regenerating) return;
    const self = this;
    wx.showModal({
      title: '重新生成计划',
      content: '会按当前约束重新生成 4 周计划，已提交的打卡记录会保留。',
      confirmText: '重新生成',
      confirmColor: '#FF6B2C',
      success: function (res) {
        if (res.confirm) self.runRegenerate();
      }
    });
  },

  /** 诊断 → 重新生成计划 → 静默刷新本页 */
  runRegenerate() {
    if (this.data.regenerating) return;
    const self = this;
    const profile = store.getProfile();
    if (!profile) {
      wx.showModal({
        title: '还没有约束信息',
        content: '需要先完成约束输入，才能生成训练计划。',
        confirmText: '去填写',
        success: function (res) {
          if (res.confirm) self.onEditConstraints();
        }
      });
      return;
    }
    this.setData({ regenerating: true });
    api
      .getDiagnosis(profile)
      .then(function (diagnosis) {
        return api.generatePlan({ profile: profile, diagnosis: diagnosis });
      })
      .then(function () {
        self.setData({ regenerating: false, explainVisible: false, explainLines: [] });
        wx.showToast({ title: '计划已重新生成', icon: 'none' });
        return self.fetchPlan({ silent: true });
      })
      .catch(function (err) {
        self.setData({ regenerating: false });
        const code = err && err.code;
        if (code === 2001) {
          wx.showModal({
            title: '可用动作不足',
            content:
              '当前器械 / 空间 / 身体限制组合下没有安全可用的动作，建议放宽器械或空间限制，或咨询体育老师。',
            confirmText: '去调整约束',
            success: function (res) {
              if (res.confirm) self.onEditConstraints();
            }
          });
        } else if (code === 1003) {
          wx.showModal({
            title: '还没有约束信息',
            content: '请先完成约束输入，再生成计划。',
            confirmText: '去填写',
            success: function (res) {
              if (res.confirm) self.onEditConstraints();
            }
          });
        }
        // 其它错误由 request 层统一 toast，页面不重复提示
      });
  },

  /** 计划解释：有缓存直接展示，没有则请求 explainPlan（只读，不修改计划） */
  onExplainTap() {
    const plan = this.data.plan;
    if (!plan) {
      wx.showToast({ title: '请先完成约束并生成计划', icon: 'none' });
      return;
    }
    const cached = plan.explanation;
    if (cached && cached.text) {
      this.setData({
        explainVisible: true,
        explainLoading: false,
        explainError: '',
        explainFromCache: true,
        explainModel: cached.model || '',
        explainScrolled: false,
        explainAtBottom: false,
        explainLines: buildExplainLines(cached.text)
      });
      return;
    }
    this.setData({
      explainVisible: true,
      explainFromCache: false,
      explainScrolled: false,
      explainAtBottom: false
    });
    this.requestExplain();
  },

  requestExplain() {
    const plan = this.data.plan;
    if (!plan) return;
    const self = this;
    this.setData({
      explainLoading: true,
      explainError: '',
      explainLines: [],
      explainScrolled: false,
      explainAtBottom: false
    });
    api
      .explainPlan(plan.plan_id)
      .then(function (res) {
        self.setData({
          explainLoading: false,
          explainError: '',
          explainModel: (res && res.model) || '',
          explainLines: buildExplainLines(res && res.text)
        });
      })
      .catch(function (err) {
        const code = err && err.code;
        self.setData({
          explainLoading: false,
          explainLines: [],
          explainError:
            code === 1003 ? '计划已更新，请关闭后刷新页面再试' : '暂时无法生成解释，不影响训练'
        });
      });
  },

  /** 解释正文滚动：已开始滚动则收起「下滑查看完整解释」提示 */
  onExplainScroll(e) {
    const detail = (e && e.detail) || {};
    const scrollTop = Number(detail.scrollTop) || 0;
    const scrolled = scrollTop > 24;
    if (scrolled !== this.data.explainScrolled) {
      this.setData({ explainScrolled: scrolled });
    }
  },

  /** 解释正文滚到底：隐藏底部渐隐，避免误以为还有内容 */
  onExplainScrollLower() {
    if (!this.data.explainAtBottom) {
      this.setData({ explainAtBottom: true });
    }
  },

  onRetryExplain() {
    this.requestExplain();
  },

  onCloseExplain() {
    this.setData({ explainVisible: false });
  },

  /** 弹层内容区阻止点击穿透关闭 */
  noop() {}
});
