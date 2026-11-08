/**
 * 提醒打卡页（tab 1）
 * - 提醒设置：switch / 时间 picker 写入 store，授权订阅走 reminder.requestSubscribe；
 *   订阅模板未配置时展示「应用内提醒兜底」说明，不阻断任何流程
 * - 今日训练：动作逐行勾选；已有今日打卡时回显状态/RPE/不适/完成动作，按钮变「更新打卡」
 * - 打卡表单：validators.validateCheckin 校验 → api.checkin，提交后展示 safety_review 与周完成提示
 * - 打卡历史：最近 10 条；无计划时整页 empty-state
 * 数据只通过 utils/api.js + utils/reminder.js 获取，提醒设置通过 utils/store.js 保存
 */
const api = require('../../utils/api');
const store = require('../../utils/store');
const reminder = require('../../utils/reminder');
const validators = require('../../utils/validators');
const options = require('../../data/options');
const util = require('../../utils/util');

/** 打卡状态展示元数据 */
const STATUS_META = {
  done: { label: '已完成', className: 'is-done' },
  partial: { label: '部分完成', className: 'is-partial' },
  skipped: { label: '已跳过', className: 'is-skipped' },
  pending: { label: '待打卡', className: 'is-pending' }
};

/** 阶段徽标的浅色底（与 data/options.js 的 PHASE_META 颜色成对使用） */
const PHASE_SOFT = {
  base: '#EAF3FF',
  build: '#FFF1EA',
  taper: '#E7F8EF'
};

const DEFAULT_FORM = {
  status: 'done',
  rpe: 6,
  discomfort: ['none'],
  discomfortNote: '',
  note: ''
};

function labelOf(list, value) {
  for (let i = 0; i < list.length; i++) {
    if (String(list[i].value) === String(value)) return list[i].label;
  }
  return '';
}

Page({
  data: {
    viewState: 'loading',
    errorText: '',

    // 计划 / 统计
    plan: null,
    stale: false,
    stats: null,
    streak: 0,
    weekDoneText: '0/0',
    completionPercent: 0,

    // Hero
    heroKicker: '今日训练',
    heroTitle: '训练打卡',

    // 提醒设置
    reminderEnabled: true,
    reminderTime: '19:30',
    reminderChannelLabel: '应用内提醒',
    templateReady: false,
    subscriptionQuota: 0,
    serverCron: '',
    nextTrainingLabel: '',
    nextTrainingTitle: '',
    subscribing: false,

    // 今日训练
    todaySession: null,
    todayDateText: '',
    todayPhaseName: '',
    todayPhaseColor: '#FF6B2C',
    todayPhaseBg: '#FFF1EA',
    todayActions: [],
    completedActionIds: [],
    completedCount: 0,
    todayActionTotal: 0,
    todayRecord: null,
    echoText: '',
    isUpdateMode: false,

    // 页面顶部定位提示（来自计划页 pendingCheckinSessionId，且不是今天时展示）
    locatedSession: null,
    locatedText: '',

    // 打卡表单
    statusOptions: options.CHECKIN_STATUS_OPTIONS,
    discomfortOptions: options.DISCOMFORT_OPTIONS,
    form: Object.assign({}, DEFAULT_FORM),
    formErrors: {},
    showDiscomfortNote: false,
    noteLength: 0,
    formTitle: '填写今日打卡',
    submitText: '提交打卡',
    submitting: false,
    safetyReview: null,
    weekCompletionTip: false,

    // 历史
    historyItems: []
  },

  /** 页面级运行时状态（不参与渲染） */
  onLoad() {
    this.formDirty = false;
    this.hasLoaded = false;
    this.pendingSessionId = '';
    this.loadData(false);
  },

  onShow() {
    // 应用内提醒兜底角标
    reminder.refreshBadge();
    // 消费计划页「去打卡」带来的训练日定位请求
    this.consumePendingSession();
    // 返回本页时静默刷新（打卡/计划可能已在其它页面变化），不打断正在编辑的表单
    if (this.hasLoaded) {
      this.loadData(true);
    }
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

  onPullDownRefresh() {
    this.loadData(true).then(() => {
      wx.stopPullDownRefresh();
    });
  },

  /* ================= 数据加载 ================= */

  /**
   * 拉取计划 + 打卡记录 + 提醒状态
   * @param {Boolean} silent 静默刷新：不切换到 loading 态，失败时保留旧数据
   */
  loadData(silent) {
    const quiet = !!silent;
    if (!quiet) {
      this.setData({ viewState: 'loading', errorText: '' });
    }
    return Promise.all([api.getCurrentPlan(), api.getCheckins()])
      .then((res) => {
        this.hasLoaded = true;
        const planRes = res[0] || {};
        const ckRes = res[1] || {};
        if (!planRes.plan) {
          this.setData({
            viewState: 'done',
            plan: null,
            stats: null,
            locatedSession: null,
            todaySession: null,
            historyItems: []
          });
          return;
        }
        this.applyData(planRes, ckRes, quiet);
      })
      .catch((err) => {
        // 请求层已统一 toast 错误，页面只负责三态展示
        if (!quiet) {
          this.setData({
            viewState: 'error',
            errorText: (err && err.msg) || '加载失败，请稍后重试'
          });
        }
      });
  },

  onRetry() {
    this.loadData(false);
  },

  /** 把计划与打卡数据落到页面（首次加载与静默刷新共用） */
  applyData(planRes, ckRes, quiet) {
    const plan = planRes.plan;
    const allRecords = ckRes.records || [];
    // 计划重算后，旧计划的打卡记录不再计入本计划（mock/服务端均按 plan_id 隔离）
    const records = plan
      ? allRecords.filter(function (r) {
          return !r.plan_id || r.plan_id === plan.plan_id;
        })
      : allRecords;
    const stats = ckRes.stats || null;
    const streak = Number(ckRes.streak) || 0;
    const reminderStatus = reminder.getReminderStatus();
    const todaySession = reminderStatus.today_session || null;
    const todayRecord = todaySession
      ? records.filter(function (r) {
          return r.session_id === todaySession.session_id;
        })[0] || null
      : null;

    // 今日所属周的阶段徽标
    let todayWeek = null;
    if (todaySession) {
      (plan.weeks || []).forEach(function (week) {
        if (Number(week.week_no) === Number(reminderStatus.today_week_no)) todayWeek = week;
      });
    }
    const phaseMeta = todayWeek ? options.PHASE_META[todayWeek.phase] : null;

    // 静默刷新时，用户已编辑的表单不被回显覆盖
    const keepForm = !!quiet && this.formDirty;
    if (!keepForm) this.formDirty = false;
    const form = keepForm ? this.data.form : this.buildFormFromRecord(todayRecord);
    const completedActionIds = keepForm
      ? this.data.completedActionIds
      : todayRecord
        ? (todayRecord.completed_action_ids || []).slice()
        : [];
    const todayActions = (todaySession ? todaySession.actions || [] : []).map(function (action) {
      return Object.assign({}, action, {
        checked: completedActionIds.indexOf(action.action_id) >= 0
      });
    });

    const nextTraining = reminderStatus.next_training || null;
    const reminderData = this.buildReminderData(reminderStatus);

    const data = Object.assign(
      {
        viewState: 'done',
        errorText: '',
        plan: plan,
        stale: !!planRes.stale,
        stats: stats,
        streak: streak,
        weekDoneText: stats ? stats.done_count + '/' + stats.total_sessions : '0/0',
        completionPercent: stats ? Math.round((Number(stats.completion_rate) || 0) * 100) : 0,
        heroKicker: todaySession
          ? '今日训练 · ' + (todaySession.weekday || todaySession.day_label || '训练日')
          : '今日休息 · 恢复日',
        heroTitle: todaySession ? todaySession.title : '今天休息',
        todaySession: todaySession,
        todayDateText: todaySession
          ? todaySession.date_md + ' · ' + (todaySession.weekday || todaySession.day_label)
          : '',
        todayPhaseName: phaseMeta && todayWeek ? todayWeek.phase_name : '',
        todayPhaseColor: phaseMeta ? phaseMeta.color : '#FF6B2C',
        todayPhaseBg: phaseMeta ? PHASE_SOFT[todayWeek.phase] || '#FFF1EA' : '#FFF1EA',
        todayActions: todayActions,
        completedActionIds: completedActionIds,
        completedCount: completedActionIds.length,
        todayActionTotal: todayActions.length,
        todayRecord: todayRecord,
        echoText: todayRecord
          ? '上次提交于 ' + util.formatDate(todayRecord.created_at, 'MM-DD HH:mm') + '，再次提交将更新今日打卡'
          : '',
        isUpdateMode: !!todayRecord,
        form: form,
        showDiscomfortNote: (form.discomfort || []).some(function (d) {
          return d !== 'none';
        }),
        noteLength: (form.note || '').length,
        formTitle: todayRecord ? '更新今日打卡' : '填写今日打卡',
        submitText: todayRecord ? '更新打卡' : '提交打卡',
        weekCompletionTip: !!(stats && Number(stats.completion_rate) >= 1),
        historyItems: this.buildHistoryItems(records)
      },
      reminderData
    );

    if (!quiet) {
      data.formErrors = {};
      data.safetyReview = null;
    }

    this.setData(data, () => {
      // 计划页可能指定了某个训练日，数据就绪后再定位
      if (this.pendingSessionId) {
        this.applyPendingSession();
      }
    });
  },

  /** 提醒设置卡的展示数据 */
  buildReminderData(status) {
    const info = status || reminder.getReminderStatus();
    const settings = info.settings || {};
    const subscription = info.subscription || {};
    const nextTraining = info.next_training || null;
    return {
      reminderEnabled: settings.enabled !== false,
      reminderTime: settings.time || '19:30',
      reminderChannelLabel:
        settings.channel === 'subscribe' ? '订阅消息提醒' : '应用内提醒（兜底）',
      templateReady: !!info.template_ready,
      subscriptionQuota: Number(subscription.quota) || 0,
      serverCron: info.server_cron || '',
      nextTrainingLabel: nextTraining
        ? util.relativeDayLabel(nextTraining.date) + ' · ' + nextTraining.date_md
        : '',
      nextTrainingTitle: nextTraining ? nextTraining.title : ''
    };
  },

  /** 用已有打卡记录回显表单 */
  buildFormFromRecord(record) {
    const source = record || {};
    let discomfort =
      Array.isArray(source.discomfort) && source.discomfort.length
        ? source.discomfort.slice()
        : ['none'];
    if (!discomfort.length) discomfort = ['none'];
    return {
      status: source.status || DEFAULT_FORM.status,
      rpe: Number(source.rpe) > 0 ? Number(source.rpe) : DEFAULT_FORM.rpe,
      discomfort: discomfort,
      discomfortNote: source.discomfort_note || '',
      note: source.note || ''
    };
  },

  /** 最近 10 条打卡记录 → 历史列表展示结构 */
  buildHistoryItems(records) {
    return (records || []).slice(0, 10).map(function (record) {
      const statusMeta = STATUS_META[record.status] || STATUS_META.pending;
      const discomfortText = (record.discomfort || [])
        .filter(function (d) {
          return d !== 'none';
        })
        .map(function (d) {
          return labelOf(options.DISCOMFORT_OPTIONS, d) || d;
        })
        .join('、');
      return {
        checkin_id: record.checkin_id,
        dateText: util.formatDate(record.date, 'MM-DD'),
        title: record.title || '训练打卡',
        status: record.status,
        statusLabel: statusMeta.label,
        statusClass: statusMeta.className,
        rpe: Number(record.rpe) || 0,
        discomfortText: discomfortText
      };
    });
  },

  /** 修改某个字段后清掉它的内联错误（避免已修正还挂着红字） */
  clearFormError(field) {
    const errors = this.data.formErrors || {};
    if (!errors[field]) return;
    const next = Object.assign({}, errors);
    delete next[field];
    this.setData({ formErrors: next });
  },

  /* ================= 训练日定位（来自计划页） ================= */

  /** 读取并清空 globalData.pendingCheckinSessionId，避免重复消费 */
  consumePendingSession() {
    let app = null;
    try {
      app = getApp();
    } catch (e) {
      app = null;
    }
    if (!app || !app.globalData || !app.globalData.pendingCheckinSessionId) return;
    const sessionId = app.globalData.pendingCheckinSessionId;
    app.globalData.pendingCheckinSessionId = null;
    this.pendingSessionId = sessionId;
    this.applyPendingSession();
  },

  applyPendingSession() {
    const sessionId = this.pendingSessionId;
    if (!sessionId || !this.data.plan) return;
    const found = this.findSessionById(this.data.plan, sessionId);
    if (!found) {
      this.pendingSessionId = '';
      wx.showToast({ title: '计划已更新，未找到对应训练日', icon: 'none' });
      return;
    }
    this.pendingSessionId = '';
    if (found.session.date === util.todayStr()) {
      // 就是今天：直接滚动到今日训练卡
      this.scrollTo('#today-card');
      wx.showToast({ title: '已定位到今天的训练', icon: 'none' });
      return;
    }
    this.setData(
      {
        locatedSession: found.session,
        locatedText: '已定位到 ' + found.session.date_md + ' 的训练日'
      },
      () => {
        this.scrollTo('#located-card');
      }
    );
  },

  findSessionById(plan, sessionId) {
    if (!plan || !plan.weeks) return null;
    for (let i = 0; i < plan.weeks.length; i++) {
      const sessions = plan.weeks[i].sessions || [];
      for (let j = 0; j < sessions.length; j++) {
        if (sessions[j].session_id === sessionId) {
          return { week: plan.weeks[i], session: sessions[j] };
        }
      }
    }
    return null;
  },

  scrollTo(selector) {
    this.clearScrollTimer();
    this._scrollTimer = setTimeout(function () {
      wx.pageScrollTo({
        selector: selector,
        duration: 280,
        fail: function () {}
      });
    }, 220);
  },

  onClearLocated() {
    this.setData({ locatedSession: null, locatedText: '' });
  },

  onLocatedActionTap(e) {
    const detail = e.detail || {};
    if (!detail.actionId) return;
    wx.navigateTo({
      url: '/pages/action/action?id=' + detail.actionId,
      fail: function () {
        wx.showToast({ title: '动作示范页暂不可用', icon: 'none' });
      }
    });
  },

  /* ================= 提醒设置交互 ================= */

  onReminderToggle(e) {
    const enabled = !!e.detail.value;
    store.saveReminderSettings({ enabled: enabled });
    reminder.refreshBadge();
    this.setData({ reminderEnabled: enabled });
    wx.showToast({
      title: enabled ? '已开启训练提醒' : '已关闭训练提醒',
      icon: 'none'
    });
  },

  onReminderTimeChange(e) {
    const time = e.detail.value || '19:30';
    store.saveReminderSettings({ time: time });
    reminder.refreshBadge();
    this.setData({ reminderTime: time });
    wx.showToast({ title: '提醒时间已设为 ' + time, icon: 'none' });
  },

  onSubscribeTap() {
    if (this.data.subscribing) return;
    this.setData({ subscribing: true });
    reminder
      .requestSubscribe()
      .then((res) => {
        this.setData(this.buildReminderData(reminder.getReminderStatus()));
        this.setData({ subscribing: false });
        wx.showModal({
          title: res && res.available ? '订阅成功' : '已启用应用内提醒',
          content: (res && res.message) || '订阅状态已更新',
          showCancel: false,
          confirmText: '知道了'
        });
      })
      .catch(() => {
        this.setData({ subscribing: false });
        wx.showToast({ title: '订阅请求失败，请稍后重试', icon: 'none' });
      });
  },

  /* ================= 今日训练勾选 ================= */

  onToggleAction(e) {
    const index = Number(e.currentTarget.dataset.index);
    const actions = this.data.todayActions.slice();
    const target = actions[index];
    if (!target) return;
    target.checked = !target.checked;
    const ids = actions
      .filter(function (action) {
        return action.checked;
      })
      .map(function (action) {
        return action.action_id;
      });
    const patch = {
      todayActions: actions,
      completedActionIds: ids,
      completedCount: ids.length
    };
    // 之前选了「跳过」又开始勾动作 → 自动回到「部分完成」，避免状态与勾选矛盾
    if (this.data.form.status === 'skipped' && target.checked) {
      patch['form.status'] = 'partial';
    }
    this.formDirty = true;
    this.setData(patch);
  },

  /* ================= 打卡表单 ================= */

  onStatusChange(e) {
    const status = e.detail.value;
    this.clearFormError('status');
    const patch = { 'form.status': status };
    if (status === 'skipped') {
      // 跳过时清空动作勾选（完成动作数自动归零）
      patch.todayActions = this.data.todayActions.map(function (action) {
        return Object.assign({}, action, { checked: false });
      });
      patch.completedActionIds = [];
      patch.completedCount = 0;
    }
    this.formDirty = true;
    this.setData(patch);
  },

  onRpeChange(e) {
    this.formDirty = true;
    this.clearFormError('rpe');
    this.setData({ 'form.rpe': Number(e.detail.value) || 6 });
  },

  onDiscomfortChange(e) {
    const value = Array.isArray(e.detail.value) ? e.detail.value : ['none'];
    this.formDirty = true;
    this.clearFormError('discomfort');
    this.setData({
      'form.discomfort': value,
      showDiscomfortNote: value.some(function (item) {
        return item !== 'none';
      })
    });
  },

  onDiscomfortNoteInput(e) {
    this.formDirty = true;
    this.setData({ 'form.discomfortNote': e.detail.value });
  },

  onNoteInput(e) {
    const value = e.detail.value || '';
    this.formDirty = true;
    this.clearFormError('note');
    this.setData({ 'form.note': value, noteLength: value.length });
  },

  onSubmitCheckin() {
    if (this.data.submitting) return;
    const plan = this.data.plan;
    const session = this.data.todaySession;
    if (!plan || !session) {
      wx.showToast({ title: '今天没有训练安排', icon: 'none' });
      return;
    }
    const form = this.data.form;
    const payload = {
      plan_id: plan.plan_id,
      session_id: session.session_id,
      date: session.date,
      status: form.status,
      completed_action_ids: this.data.completedActionIds,
      rpe: Number(form.rpe),
      discomfort: form.discomfort,
      discomfort_note: form.discomfortNote || '',
      note: form.note || '',
      duration_actual_min: session.duration_min
    };

    const check = validators.validateCheckin(payload);
    if (!check.valid) {
      this.setData({ formErrors: check.errors });
      wx.showToast({ title: check.firstError, icon: 'none' });
      return;
    }

    this.setData({ submitting: true, formErrors: {} });
    api
      .checkin(payload)
      .then((res) => {
        const stats = res.stats || this.data.stats;
        const record = res.record || null;
        const safety = res.safety_review || null;
        this.formDirty = false;
        this.setData(
          {
            submitting: false,
            stats: stats,
            streak: stats && stats.streak ? stats.streak : this.data.streak,
            weekDoneText: stats ? stats.done_count + '/' + stats.total_sessions : this.data.weekDoneText,
            completionPercent: stats
              ? Math.round((Number(stats.completion_rate) || 0) * 100)
              : this.data.completionPercent,
            todayRecord: record,
            isUpdateMode: true,
            formTitle: '更新今日打卡',
            submitText: '更新打卡',
            echoText: record
              ? '已记录 ' +
                util.formatDate(record.created_at, 'MM-DD HH:mm') +
                ' 的打卡，再次提交将更新'
              : this.data.echoText,
            safetyReview: safety && safety.triggered ? safety : null,
            weekCompletionTip: !!(stats && Number(stats.completion_rate) >= 1)
          },
          () => {
            reminder.refreshBadge();
            this.scrollTo('#submit-area');
          }
        );
        wx.showToast({ title: '打卡已记录', icon: 'success' });
        // 历史记录需要包含刚提交的这条，再拉一次列表（静默）
        api
          .getCheckins()
          .then((ck) => {
            this.setData({
              historyItems: this.buildHistoryItems(ck.records || []),
              streak: Number(ck.streak) || this.data.streak
            });
          })
          .catch(function () {});
      })
      .catch((err) => {
        this.setData({
          submitting: false,
          formErrors: (err && err.data && err.data.errors) || {}
        });
        // 请求层已统一 toast，页面不重复提示
      });
  },

  /* ================= 跳转 ================= */

  goFeedback() {
    wx.switchTab({ url: '/pages/feedback/feedback' });
  },

  goPlan() {
    wx.switchTab({ url: '/pages/plan/plan' });
  },

  goConstraints() {
    wx.navigateTo({ url: '/pages/constraints/constraints' });
  }
});
