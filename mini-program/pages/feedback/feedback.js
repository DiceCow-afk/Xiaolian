/**
 * 周反馈页（tab 2）
 * - 周切换（1-4 周，显示「已反馈 / 待反馈」）
 * - 统计卡：完成率 / 完成-部分-跳过-不适 / 平均 RPE
 * - 反馈表单：validateWeeklyFeedback 校验 → api.submitWeeklyFeedback
 * - 调整结果卡：分支徽标、命中规则 rule_id + condition_text、摘要、下周预览（plan-card compact）、
 *   safety_changes、CTA；已提交的周默认收起表单，可「更新反馈」回填后再提交
 * - 历史调整记录；无计划 empty-state；下拉刷新
 * 数据只通过 utils/api.js 获取，提醒角标通过 utils/reminder.js 刷新
 */
const api = require('../../utils/api');
const reminder = require('../../utils/reminder');
const validators = require('../../utils/validators');
const options = require('../../data/options');
const util = require('../../utils/util');

/** 调整分支展示元数据（与 data/rules.js 的 WEEKLY_ADJUSTMENT_TABLE 四类对应） */
const ADJUSTMENT_META = {
  progress: { label: '正常推进', color: '#0d8f52', soft: '#E7F8EF', icon: '📈' },
  reduce: { label: '减量', color: '#b96a00', soft: '#FFF6E6', icon: '📉' },
  rest: { label: '休息', color: '#1c6bc4', soft: '#EAF3FF', icon: '🛌' },
  upgrade: { label: '升阶', color: '#f2551a', soft: '#FFF1EA', icon: '🚀' }
};

/** safety_changes 变更类型展示元数据 */
const CHANGE_META = {
  replace: { label: '替换', tagClass: 'tag-warning' },
  remove: { label: '移除', tagClass: 'tag-danger' },
  upgrade: { label: '升阶', tagClass: 'tag-success' }
};

const COMPLETION_OPTIONS = [
  { value: 0, label: '0%' },
  { value: 0.25, label: '25%' },
  { value: 0.5, label: '50%' },
  { value: 0.75, label: '75%' },
  { value: 1, label: '100%' }
];

const DISCOMFORT_OPTIONS = [
  { value: 'yes', label: '有不适' },
  { value: 'no', label: '没有不适' }
];

const EMPTY_PREVIEW = {
  available: false,
  sessions: [],
  message: '',
  phaseName: '',
  focus: '',
  nextWeekNo: 0,
  safetyChanges: []
};

function buildFormFromStats(stats) {
  const safeStats = stats || {};
  return {
    completionRate: Number(safeStats.completion_rate) || 0,
    avgRpe:
      Number(safeStats.avg_rpe) > 0 ? Math.round(Number(safeStats.avg_rpe)) : 6,
    feel: 'ok',
    recovery: 3,
    hasDiscomfort: Number(safeStats.discomfort_count) > 0 ? 'yes' : 'no',
    note: ''
  };
}

Page({
  data: {
    viewState: 'loading',
    errorText: '',

    // 周切换
    weekNo: 1,
    totalWeeks: 4,
    weekTabs: [],

    // 计划摘要 / 统计
    planSummary: null,
    stats: null,
    streak: 0,
    hasCheckinRecords: false,
    completionPercent: 0,
    avgRpeText: '—',
    recordsCountText: '0',
    doneCount: 0,
    partialCount: 0,
    skippedCount: 0,
    discomfortCount: 0,
    discomfortCountText: '—',
    statsSubText: '',
    discomfortFromCheckins: false,

    // Hero
    heroKicker: '周反馈 · 动态调整',

    // 已提交反馈
    record: null,
    recordTimeText: '',
    adjustment: null,
    adjustmentMeta: { label: '', color: '#0d8f52', soft: '#E7F8EF', icon: '📈' },
    preview: Object.assign({}, EMPTY_PREVIEW),

    // 历史调整记录
    historyItems: [],

    // 表单
    formOpen: true,
    formTitle: '填写本周反馈',
    submitText: '生成周反馈与下周调整',
    completionOptions: COMPLETION_OPTIONS,
    feelOptions: options.FEEL_OPTIONS,
    recoveryOptions: options.RECOVERY_OPTIONS,
    discomfortOptions: DISCOMFORT_OPTIONS,
    rpeHint: '',
    form: {
      completionRate: 0.5,
      avgRpe: 6,
      feel: 'ok',
      recovery: 3,
      hasDiscomfort: 'no',
      note: ''
    },
    formErrors: {},
    noteLength: 0,
    submitting: false
  },

  onLoad() {
    this.formDirty = false;
    this.hasLoaded = false;
    this.loadPage(false);
  },

  onShow() {
    // tab 页统一刷新「打卡」角标
    reminder.refreshBadge();
    // 从打卡页回来时本周统计可能已变，静默刷新（不打断已编辑表单）
    if (this.hasLoaded) {
      this.loadPage(true);
    }
  },

  onPullDownRefresh() {
    this.loadPage(true).then(() => {
      wx.stopPullDownRefresh();
    });
  },

  /* ================= 数据加载 ================= */

  loadPage(silent) {
    const quiet = !!silent;
    if (!quiet) {
      this.setData({ viewState: 'loading', errorText: '' });
    }
    const weekNo = Number(this.data.weekNo) || 1;
    return Promise.all([api.getWeeklyFeedback({ week_no: weekNo }), api.getCurrentPlan()])
      .then((res) => {
        this.hasLoaded = true;
        const feedback = res[0] || {};
        const planRes = res[1] || {};
        if (!feedback.plan_summary) {
          this.setData({
            viewState: 'done',
            errorText: '',
            planSummary: null,
            stats: null,
            record: null,
            adjustment: null,
            preview: Object.assign({}, EMPTY_PREVIEW),
            weekTabs: [],
            historyItems: [],
            formOpen: false
          });
          return;
        }
        this.applyWeekData(feedback, planRes.plan, quiet);
      })
      .catch((err) => {
        if (!quiet) {
          this.setData({
            viewState: 'error',
            errorText: (err && err.msg) || '加载失败，请稍后重试'
          });
        }
      });
  },

  onRetry() {
    this.loadPage(false);
  },

  /** 把某一周的反馈数据落到页面 */
  applyWeekData(feedback, plan, quiet) {
    const planSummary = feedback.plan_summary;
    const stats = feedback.stats || null;
    const records = stats && stats.records ? stats.records : [];
    const hasCheckinRecords = records.length > 0;
    const record = feedback.record || null;
    const history = feedback.history || [];
    const weekNo = Number(planSummary.current_week_no) || Number(this.data.weekNo) || 1;
    const totalWeeks = Number(planSummary.total_weeks) || 4;

    const weekTabs = [];
    for (let i = 1; i <= totalWeeks; i++) {
      weekTabs.push({
        no: i,
        label: '第 ' + i + ' 周',
        feedbacked: history.some(function (item) {
          return Number(item.week_no) === i;
        })
      });
    }

    const streak = stats ? Number(stats.streak) || 0 : 0;
    const completionPercent = stats
      ? Math.round((Number(stats.completion_rate) || 0) * 100)
      : 0;

    // 静默刷新时保留用户正在编辑的表单
    const keepForm = !!quiet && this.formDirty;
    const form = keepForm ? this.data.form : this.buildForm(record, stats, hasCheckinRecords);

    const adjustment = record && record.adjustment ? record.adjustment : null;
    const adjustmentMeta = adjustment
      ? ADJUSTMENT_META[adjustment.type] || ADJUSTMENT_META.progress
      : ADJUSTMENT_META.progress;
    const preview = record ? this.buildPreviewFromRecord(record, plan) : Object.assign({}, EMPTY_PREVIEW);

    const data = {
      viewState: 'done',
      errorText: '',
      weekNo: weekNo,
      totalWeeks: totalWeeks,
      weekTabs: weekTabs,
      planSummary: planSummary,
      stats: stats,
      streak: streak,
      hasCheckinRecords: hasCheckinRecords,
      completionPercent: completionPercent,
      avgRpeText: stats && Number(stats.avg_rpe) > 0 ? String(stats.avg_rpe) : '—',
      recordsCountText: String(records.length),
      doneCount: stats ? Number(stats.done_count) || 0 : 0,
      partialCount: stats ? Number(stats.partial_count) || 0 : 0,
      skippedCount: stats ? Number(stats.skipped_count) || 0 : 0,
      discomfortCount: stats ? Number(stats.discomfort_count) || 0 : 0,
      discomfortCountText: stats ? String(Number(stats.discomfort_count) || 0) : '—',
      statsSubText: hasCheckinRecords
        ? '基于本周 ' + records.length + ' 条打卡记录'
        : '本周还没有打卡记录，可用估算值提交反馈',
      discomfortFromCheckins: !!(stats && Number(stats.discomfort_count) > 0),
      heroKicker:
        '第 ' +
        weekNo +
        ' 周 · ' +
        (planSummary.phase_name || '周期计划') +
        (record ? ' · 已反馈' : ' · 待反馈'),
      record: record,
      recordTimeText: record ? util.formatDate(record.created_at, 'MM-DD HH:mm') : '',
      adjustment: adjustment,
      adjustmentMeta: adjustmentMeta,
      preview: preview,
      historyItems: this.buildHistoryItems(history)
    };

    if (keepForm) {
      data.form = this.data.form;
      data.formOpen = this.data.formOpen;
      data.formTitle = this.data.formTitle;
      data.submitText = this.data.submitText;
      data.noteLength = this.data.noteLength;
      data.rpeHint = this.data.rpeHint;
    } else {
      this.formDirty = false;
      data.form = form;
      data.formOpen = !record;
      data.formTitle = record ? '更新第 ' + weekNo + ' 周反馈' : '填写本周反馈';
      data.submitText = record ? '更新反馈与调整' : '生成周反馈与下周调整';
      data.noteLength = (form.note || '').length;
      data.rpeHint = hasCheckinRecords
        ? '默认取本周打卡平均 RPE，可手动调整'
        : '本周没有打卡数据，请估算整体主观强度';
    }

    if (!quiet) {
      data.formErrors = {};
    }

    this.setData(data);
  },

  /** 表单默认值：优先回填上次提交值，无记录时取本周统计 */
  buildForm(record, stats, hasCheckinRecords) {
    if (!record) return buildFormFromStats(stats);
    const recordRate = Number(record.completion_rate) || 0;
    const recordRpe = Number(record.avg_rpe) || 6;
    return {
      completionRate:
        hasCheckinRecords && stats
          ? Number(stats.completion_rate) || 0
          : recordRate,
      avgRpe:
        hasCheckinRecords && stats && Number(stats.avg_rpe) > 0
          ? Math.round(Number(stats.avg_rpe))
          : Math.round(recordRpe),
      feel: record.feel || 'ok',
      recovery: Number(record.recovery) || 3,
      hasDiscomfort: record.has_discomfort ? 'yes' : 'no',
      note: record.note || ''
    };
  },

  /** 已提交周的「下周预览」：记录里只有摘要，训练日列表从当前计划补齐 */
  buildPreviewFromRecord(record, plan) {
    const nextWeek = record.next_week || null;
    if (!nextWeek) return Object.assign({}, EMPTY_PREVIEW);
    const nextWeekNo = Number(nextWeek.week_no) || Number(record.week_no) + 1;
    let sessions = [];
    let phaseName = nextWeek.phase_name || '';
    let focus = nextWeek.weekly_focus || '';
    if (plan && plan.weeks) {
      const target = plan.weeks.filter(function (week) {
        return Number(week.week_no) === nextWeekNo;
      })[0];
      if (target) {
        sessions = target.sessions || [];
        phaseName = target.phase_name || phaseName;
        focus = target.weekly_focus || focus;
      }
    }
    return {
      available: !!nextWeek.week_no,
      sessions: sessions,
      message: nextWeek.message || '',
      phaseName: phaseName,
      focus: focus,
      nextWeekNo: nextWeekNo,
      safetyChanges: this.decorateSafetyChanges(nextWeek.safety_changes)
    };
  },

  decorateSafetyChanges(list) {
    return (list || []).map(function (item, index) {
      const meta = CHANGE_META[item.type] || CHANGE_META.replace;
      return {
        changeId: 'sc_' + index,
        type: item.type,
        typeLabel: meta.label,
        tagClass: meta.tagClass,
        from: item.from || '',
        to: item.to || '',
        reason: item.reason || ''
      };
    });
  },

  buildHistoryItems(history) {
    return (history || []).map(function (item, index) {
      const adjustment = item.adjustment || {};
      const meta = ADJUSTMENT_META[adjustment.type] || ADJUSTMENT_META.progress;
      return {
        feedback_id: item.feedback_id || 'fb_' + index,
        weekLabel: '第 ' + item.week_no + ' 周',
        ruleId: adjustment.rule_id || 'DEFAULT',
        typeLabel: adjustment.label || meta.label,
        color: meta.color,
        soft: meta.soft,
        icon: meta.icon,
        summary: adjustment.summary || '',
        timeText: util.formatDate(item.created_at, 'MM-DD HH:mm')
      };
    });
  },

  /* ================= 周切换 ================= */

  onWeekSwitch(e) {
    const weekNo = Number(e.currentTarget.dataset.week);
    if (!weekNo || weekNo === Number(this.data.weekNo)) return;
    this.formDirty = false;
    this.setData({ weekNo: weekNo, formErrors: {} });
    this.loadPage(false);
  },

  /* ================= 表单交互 ================= */

  /** 修改某个字段后清掉它的内联错误（避免已修正还挂着红字） */
  clearFormError(field) {
    const errors = this.data.formErrors || {};
    if (!errors[field]) return;
    const next = Object.assign({}, errors);
    delete next[field];
    this.setData({ formErrors: next });
  },

  onCompletionRateChange(e) {
    this.formDirty = true;
    this.clearFormError('completion_rate');
    this.setData({ 'form.completionRate': Number(e.detail.value) || 0 });
  },

  onRpeChange(e) {
    this.formDirty = true;
    this.clearFormError('avg_rpe');
    this.setData({ 'form.avgRpe': Number(e.detail.value) || 6 });
  },

  onFeelChange(e) {
    this.formDirty = true;
    this.clearFormError('feel');
    this.setData({ 'form.feel': e.detail.value });
  },

  onRecoveryChange(e) {
    this.formDirty = true;
    this.clearFormError('recovery');
    this.setData({ 'form.recovery': Number(e.detail.value) || 3 });
  },

  onDiscomfortChange(e) {
    this.formDirty = true;
    this.setData({ 'form.hasDiscomfort': e.detail.value === 'yes' ? 'yes' : 'no' });
  },

  onNoteInput(e) {
    const value = e.detail.value || '';
    this.formDirty = true;
    this.clearFormError('note');
    this.setData({ 'form.note': value, noteLength: value.length });
  },

  onUpdateFeedback() {
    this.setData({ formOpen: true }, () => {
      this.clearScrollTimer();
      this._scrollTimer = setTimeout(function () {
        wx.pageScrollTo({
          selector: '#feedback-form',
          duration: 280,
          fail: function () {}
        });
      }, 120);
    });
  },

  onCancelUpdate() {
    if (!this.data.record) return;
    this.setData({ formOpen: false });
  },

  onHide() {
    this.clearScrollTimer();
  },

  onUnload() {
    this.clearScrollTimer();
  },

  /** 清理滚动定时器（页面定时器需在 onHide/onUnload 清理） */
  clearScrollTimer() {
    if (this._scrollTimer) {
      clearTimeout(this._scrollTimer);
      this._scrollTimer = null;
    }
  },

  /* ================= 提交反馈 ================= */

  onSubmitFeedback() {
    if (this.data.submitting) return;
    const planSummary = this.data.planSummary;
    if (!planSummary) {
      wx.showToast({ title: '还没有训练计划', icon: 'none' });
      return;
    }
    const form = this.data.form;
    const payload = {
      plan_id: planSummary.plan_id,
      week_no: Number(this.data.weekNo),
      completion_rate: Number(form.completionRate),
      avg_rpe: Number(form.avgRpe),
      feel: form.feel,
      recovery: Number(form.recovery),
      has_discomfort: form.hasDiscomfort === 'yes',
      note: form.note || ''
    };

    const check = validators.validateWeeklyFeedback(payload);
    if (!check.valid) {
      this.setData({ formErrors: check.errors });
      wx.showToast({ title: check.firstError, icon: 'none' });
      return;
    }

    this.setData({ submitting: true, formErrors: {} });
    api
      .submitWeeklyFeedback(payload)
      .then((res) => {
        this.formDirty = false;
        this.applySubmitResult(res);
        wx.showToast({ title: '周反馈已提交', icon: 'success' });
      })
      .catch((err) => {
        this.setData({
          submitting: false,
          formErrors: (err && err.data && err.data.errors) || {}
        });
        // 请求层已统一 toast，页面不重复提示
      });
  },

  /** 用提交结果刷新调整结果卡、下周预览、历史与周切换状态 */
  applySubmitResult(res) {
    const record = res.record || null;
    const adjustment = res.adjustment || (record && record.adjustment) || null;
    const adjustmentMeta = adjustment
      ? ADJUSTMENT_META[adjustment.type] || ADJUSTMENT_META.progress
      : ADJUSTMENT_META.progress;
    const nextWeek = res.next_week || {};
    const previewSessions =
      nextWeek.available && nextWeek.week ? nextWeek.week.sessions || [] : [];
    const previewWeek = nextWeek.week || {};
    const currentWeek = Number(this.data.weekNo);
    const preview = {
      available: !!nextWeek.available,
      sessions: previewSessions,
      message: nextWeek.message || '',
      phaseName: previewWeek.phase_name || nextWeek.phase_name || '',
      focus: previewWeek.weekly_focus || nextWeek.weekly_focus || '',
      nextWeekNo: Number(nextWeek.week_no) || currentWeek + 1,
      safetyChanges: this.decorateSafetyChanges(nextWeek.safety_changes)
    };

    const weekTabs = this.data.weekTabs.map(function (tab) {
      return Object.assign({}, tab, {
        feedbacked: tab.feedbacked || Number(tab.no) === currentWeek
      });
    });

    this.setData(
      {
        submitting: false,
        formErrors: {},
        record: record,
        recordTimeText: record ? util.formatDate(record.created_at, 'MM-DD HH:mm') : '',
        adjustment: adjustment,
        adjustmentMeta: adjustmentMeta,
        preview: preview,
        historyItems: this.buildHistoryItems(res.history || []),
        weekTabs: weekTabs,
        formOpen: false,
        formTitle: '更新第 ' + currentWeek + ' 周反馈',
        submitText: '更新反馈与调整',
        heroKicker:
          '第 ' +
          currentWeek +
          ' 周 · ' +
          (this.data.planSummary ? this.data.planSummary.phase_name : '') +
          ' · 已反馈'
      },
      () => {
        this.clearScrollTimer();
        this._scrollTimer = setTimeout(function () {
          wx.pageScrollTo({
            selector: '#result-card',
            duration: 280,
            fail: function () {}
          });
        }, 160);
      }
    );
  },

  /* ================= 跳转 ================= */

  onPreviewActionTap(e) {
    const detail = e.detail || {};
    if (!detail.actionId) return;
    wx.navigateTo({
      url: '/pages/action/action?id=' + detail.actionId,
      fail: function () {
        wx.showToast({ title: '动作示范页暂不可用', icon: 'none' });
      }
    });
  },

  goPlan() {
    wx.switchTab({ url: '/pages/plan/plan' });
  },

  goConstraints() {
    wx.navigateTo({ url: '/pages/constraints/constraints' });
  }
});
