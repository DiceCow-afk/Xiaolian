/**
 * 约束输入页（入口页，非 tab）
 * 目标：自然语言/AI 解析 + 表单采集结构化画像，提交后依次完成
 * 保存画像 -> 弱项诊断 -> 生成 4 周计划 -> 跳转计划页。
 * 说明：AI 解析失败只降级为手动填写，不阻塞提交；页面数据全部来自 utils/api.js。
 */
const api = require('../../utils/api');
const util = require('../../utils/util');
const validators = require('../../utils/validators');
const config = require('../../utils/config');
const options = require('../../data/options');
const standards = require('../../data/testStandards');

/** 自然语言示例（仅作输入提示，不参与业务计算） */
const EXAMPLE_TEXT =
  '每周三次，每次 30 分钟，宿舍里只有弹力带，膝盖有点不舒服，想提升 1000 米和立定跳远成绩';

/** 校验错误字段 -> 页面锚点，用于把视图滚到首个错误 */
const FIELD_ANCHORS = {
  gender: 'field-gender',
  self_level: 'field-self-level',
  target_events: 'field-events',
  goal: 'field-goal',
  test_date: 'field-date',
  equipment: 'field-equipment',
  space: 'field-space',
  time_per_session: 'field-time',
  weekly_frequency: 'field-freq',
  body_limits: 'field-limits'
};

/** 表单从上到下的字段顺序，用于挑出「首个」错误（而不是 Validator 的报错顺序） */
const FIELD_PRIORITY = [
  'gender',
  'self_level',
  'target_events',
  'goal',
  'test_date',
  'equipment',
  'space',
  'time_per_session',
  'weekly_frequency',
  'body_limits'
];

/** AI 解析可回填的字段（与 profile Schema 同名） */
const HIGHLIGHT_KEYS = [
  'gender',
  'self_level',
  'target_events',
  'goal',
  'equipment',
  'space',
  'time_per_session',
  'weekly_frequency',
  'body_limits'
];

/** 表单默认值：体测日期默认今天 + 配置偏移天数，周频次默认 3 次 */
function defaultForm() {
  return {
    gender: '',
    self_level: '',
    target_events: [],
    event_levels: {},
    goal: '',
    test_date: util.addDays(util.todayStr(), config.defaultTestDateOffset),
    equipment: [],
    space: '',
    time_per_session: '',
    weekly_frequency: options.FREQUENCY_RANGE.default,
    body_limits: [],
    natural_language: ''
  };
}

Page({
  data: {
    viewState: 'loading',
    loadingText: '正在读取你的约束…',
    errorText: '',
    editMode: false,
    hasProfile: false,
    coldTip: '',
    planBlocked: false,
    submitting: false,
    submitText: '保存约束并生成计划',

    form: defaultForm(),
    errors: {},
    eventRows: [],
    testDateMin: '',
    testDateMax: '',
    daysToTest: 35,
    testDateHint: '',

    // AI 解析卡
    parseText: '',
    parseChars: 0,
    parsing: false,
    parseResult: null,
    parseFailText: '',
    parseError: '',
    highlighted: {},

    // 静态枚举（data/options.js，只读展示）
    genderOptions: options.GENDER_OPTIONS,
    selfLevelOptions: options.SELF_LEVEL_OPTIONS,
    eventOptions: options.EVENT_OPTIONS,
    tierOptions: options.EVENT_LEVEL_OPTIONS,
    goalOptions: options.GOAL_OPTIONS,
    equipmentOptions: options.EQUIPMENT_OPTIONS,
    spaceOptions: options.SPACE_OPTIONS,
    timeOptions: options.TIME_OPTIONS,
    bodyLimitOptions: options.BODY_LIMIT_OPTIONS,
    frequencyMin: options.FREQUENCY_RANGE.min,
    frequencyMax: options.FREQUENCY_RANGE.max
  },

  onLoad(query) {
    const editMode = !!(query && query.edit === '1');
    const today = util.todayStr();
    const form = defaultForm();
    this.setData({
      editMode: editMode,
      submitText: editMode ? '保存并重算计划' : '保存约束并生成计划',
      testDateMin: util.addDays(today, 7),
      testDateMax: util.addDays(today, 180),
      form: form
    });
    this.updateDateMeta(form.test_date);
    this.loadProfile();
  },

  onShow() {
    // 冷启动跳计划页的定时器可能因页面隐藏被清掉，回到页面时补一次
    if (this._redirectPending) this.scheduleRedirect();
  },

  onHide() {
    this.clearTimers();
  },

  onUnload() {
    this._redirectPending = false;
    this.clearTimers();
  },

  /** 清理定时器：高亮恢复、冷启动跳转 */
  clearTimers() {
    if (this.highlightTimer) {
      clearTimeout(this.highlightTimer);
      this.highlightTimer = null;
    }
    if (this.redirectTimer) {
      clearTimeout(this.redirectTimer);
      this.redirectTimer = null;
    }
  },

  /* ================= 数据加载与进入逻辑 ================= */

  loadProfile() {
    const self = this;
    this.setData({ viewState: 'loading', loadingText: '正在读取你的约束…', errorText: '' });
    api
      .getProfile()
      .then(function (res) {
        const profile = res && res.profile;
        if (!profile) {
          // 首次进入：直接展示空表单
          self.setData({ viewState: 'done', hasProfile: false });
          return;
        }
        self.fillFromProfile(profile);
        if (self.data.editMode) {
          // 从计划页「调整约束」进入：预填并提示需重新生成计划
          self.setData({ viewState: 'done', hasProfile: true });
          return;
        }
        // 冷启动入口页：已有画像时优先回计划页，避免每次停在表单；无计划才留在本页
        api
          .getCurrentPlan()
          .then(function (planRes) {
            if (planRes && planRes.plan) {
              self.scheduleRedirect();
            } else {
              self.setData({
                viewState: 'done',
                hasProfile: true,
                coldTip: '检测到已有画像，但还没有训练计划，确认约束后即可生成'
              });
            }
          })
          .catch(function () {
            self.setData({
              viewState: 'done',
              hasProfile: true,
              coldTip: '读取计划失败，确认约束后可重新生成计划'
            });
          });
      })
      .catch(function (err) {
        self.setData({ viewState: 'error', errorText: (err && err.msg) || '加载失败，请稍后重试' });
      });
  },

  /** 短暂展示后切回计划页（switchTab），失败则留在表单 */
  scheduleRedirect() {
    const self = this;
    this._redirectPending = true;
    this.setData({ viewState: 'loading', loadingText: '已找到训练计划，正在进入…' });
    if (this.redirectTimer) clearTimeout(this.redirectTimer);
    this.redirectTimer = setTimeout(function () {
      self.redirectTimer = null;
      wx.switchTab({
        url: '/pages/plan/plan',
        fail: function () {
          self._redirectPending = false;
          self.setData({
            viewState: 'done',
            coldTip: '进入计划页失败，可直接修改约束后生成计划'
          });
        }
      });
    }, 420);
  },

  /** 把已有画像写回表单（体测日期越界时重置为默认 35 天后） */
  fillFromProfile(profile) {
    const base = defaultForm();
    const p = profile || {};
    let testDate = p.test_date || base.test_date;
    const days = util.diffDays(util.todayStr(), testDate);
    if (isNaN(days) || days < 7 || days > 180) testDate = base.test_date;
    const form = {
      gender: p.gender || '',
      self_level: p.self_level || '',
      target_events: Array.isArray(p.target_events) ? p.target_events.slice(0, 3) : [],
      event_levels: p.event_levels || {},
      goal: p.goal || '',
      test_date: testDate,
      equipment: Array.isArray(p.equipment) ? p.equipment.slice() : [],
      space: p.space || '',
      time_per_session: p.time_per_session ? Number(p.time_per_session) : '',
      weekly_frequency: Number(p.weekly_frequency) || base.weekly_frequency,
      body_limits: Array.isArray(p.body_limits) ? p.body_limits.slice() : [],
      natural_language: p.natural_language || ''
    };
    const text = form.natural_language || '';
    this.setData({ form: form, parseText: text, parseChars: text.length });
    this.updateDateMeta(form.test_date);
    this.updateEventRows({});
  },

  /* ================= 日期与体测项目动态行 ================= */

  updateDateMeta(dateStr) {
    const days = util.diffDays(util.todayStr(), dateStr);
    const safeDays = isNaN(days) ? 0 : days;
    let hint = '约 ' + Math.max(0, safeDays) + ' 天后体测，将排布 4 周周期化训练';
    if (safeDays > 42) {
      hint = '时间充裕，按「准备 → 进展 → 减量」完整排布 4 周';
    } else if (safeDays > 21) {
      hint = '时间适中，训练会先补弱项、再逐步减量';
    } else if (safeDays >= 7) {
      hint = '临近体测，计划以减量与保持状态为主';
    }
    this.setData({ daysToTest: safeDays, testDateHint: hint });
  },

  /** 体测项目多选后，为每个已选项目生成「当前档位」行 */
  updateEventRows(errors) {
    const form = this.data.form || {};
    const errs = errors || this.data.errors || {};
    const rows = (form.target_events || []).map(function (eventId) {
      const ev = standards.getEvent(eventId);
      const tierKey = (form.event_levels && form.event_levels[eventId]) || '';
      const tier = tierKey ? standards.getTier(eventId, tierKey) : null;
      return {
        event_id: eventId,
        name: ev ? ev.name : eventId,
        full_name: ev ? ev.full_name : '',
        tier: tierKey,
        tier_name: tier ? tier.name : '',
        threshold: tier ? tier.threshold : '',
        error: errs['event_levels.' + eventId] || ''
      };
    });
    this.setData({ eventRows: rows });
  },

  /* ================= 表单字段变更 ================= */

  patchForm(patch, clearErrorKeys) {
    const form = Object.assign({}, this.data.form, patch);
    const errors = Object.assign({}, this.data.errors);
    (clearErrorKeys || []).forEach(function (key) {
      delete errors[key];
    });
    this.setData({ form: form, errors: errors });
    if (patch.target_events || patch.event_levels) this.updateEventRows(errors);
  },

  onGenderChange(e) {
    this.patchForm({ gender: e.detail.value }, ['gender']);
  },

  onSelfLevelChange(e) {
    this.patchForm({ self_level: e.detail.value }, ['self_level']);
  },

  onEventsChange(e) {
    const selected = (e.detail.value || []).slice(0, 3);
    const form = Object.assign({}, this.data.form, { target_events: selected });
    // 移除项目时同步清理其档位，避免脏数据被提交
    const levels = {};
    selected.forEach(function (eventId) {
      if (form.event_levels && form.event_levels[eventId]) levels[eventId] = form.event_levels[eventId];
    });
    form.event_levels = levels;
    const errors = Object.assign({}, this.data.errors);
    delete errors.target_events;
    this.setData({ form: form, errors: errors });
    this.updateEventRows(errors);
  },

  onEventLevelChange(e) {
    const eventId = e.currentTarget.dataset.eventId;
    if (!eventId) return;
    const levels = Object.assign({}, this.data.form.event_levels || {});
    levels[eventId] = e.detail.value;
    const errors = Object.assign({}, this.data.errors);
    delete errors['event_levels.' + eventId];
    this.setData({ form: Object.assign({}, this.data.form, { event_levels: levels }), errors: errors });
    this.updateEventRows(errors);
  },

  onGoalChange(e) {
    this.patchForm({ goal: e.detail.value }, ['goal']);
  },

  onDateChange(e) {
    const value = e.detail.value;
    this.patchForm({ test_date: value }, ['test_date']);
    this.updateDateMeta(value);
  },

  onEquipmentChange(e) {
    this.patchForm({ equipment: e.detail.value || [] }, ['equipment']);
  },

  onSpaceChange(e) {
    this.patchForm({ space: e.detail.value }, ['space']);
  },

  onTimeChange(e) {
    this.patchForm({ time_per_session: e.detail.value }, ['time_per_session']);
  },

  onFreqChange(e) {
    this.patchForm({ weekly_frequency: e.detail.value }, ['weekly_frequency']);
  },

  onBodyLimitsChange(e) {
    this.patchForm({ body_limits: e.detail.value || [] }, ['body_limits']);
  },

  /* ================= AI 自然语言解析 ================= */

  onParseInput(e) {
    const value = (e.detail && e.detail.value) || '';
    this.setData({ parseText: value, parseChars: value.length, parseError: '' });
  },

  onUseExample() {
    this.setData({
      parseText: EXAMPLE_TEXT,
      parseChars: EXAMPLE_TEXT.length,
      parseError: '',
      parseFailText: ''
    });
  },

  onDismissParseFail() {
    this.setData({ parseFailText: '' });
  },

  onParse() {
    const self = this;
    if (this.data.parsing) return;
    const text = String(this.data.parseText || '').trim();
    const check = validators.validateNaturalLanguage(text);
    if (!check.valid) {
      this.setData({ parseError: check.firstError, parseResult: null });
      return;
    }
    this.setData({ parsing: true, parseError: '', parseFailText: '', parseResult: null });
    api
      .parseNaturalLanguage(text)
      .then(function (res) {
        self.applyParsed(res || {});
      })
      .catch(function (err) {
        self.setData({ parsing: false });
        if (err && err.code === 3001) {
          // LLM 失败只降级，不阻塞表单提交
          self.setData({ parseFailText: 'AI 暂时没能理解，已切换为手动填写，不影响继续' });
          return;
        }
        // parseNaturalLanguage 为 silent 请求，路由层不会自动 toast，这里补一次
        wx.showToast({ title: (err && err.msg) || '解析失败，请手动填写', icon: 'none' });
      });
  },

  /** 把解析结果合并进表单并高亮，保留用户已填的其它字段 */
  applyParsed(res) {
    const self = this;
    const parsed = (res && res.parsed) || {};
    const form = Object.assign({}, this.data.form);
    const highlighted = {};
    let filledCount = 0;
    HIGHLIGHT_KEYS.forEach(function (key) {
      if (parsed[key] === undefined || parsed[key] === null) return;
      highlighted[key] = true;
      form[key] = util.deepClone(parsed[key]);
      filledCount += 1;
    });
    if (highlighted.target_events) {
      const levels = {};
      (form.target_events || []).forEach(function (eventId) {
        if (form.event_levels && form.event_levels[eventId]) levels[eventId] = form.event_levels[eventId];
      });
      form.event_levels = levels;
    }
    if (parsed.natural_language) form.natural_language = parsed.natural_language;

    const labels = res && Array.isArray(res.filled_fields) && res.filled_fields.length
      ? res.filled_fields.join('、')
      : '部分约束';
    const confidence =
      res && typeof res.confidence === 'number' ? Math.round(res.confidence * 100) + '%' : '';

    this.setData({
      form: form,
      highlighted: highlighted,
      parseResult: { filled_text: labels, confidence_text: confidence },
      parseFailText: '',
      parseError: '',
      parsing: false
    });
    this.updateEventRows(this.data.errors);
    wx.showToast({
      title: '已填写 ' + (filledCount || 1) + ' 项，请核对',
      icon: 'none',
      duration: 1600
    });
    // 高亮 6 秒后恢复，避免一直闪烁（定时器在 onHide/onUnload 清理）
    if (this.highlightTimer) clearTimeout(this.highlightTimer);
    this.highlightTimer = setTimeout(function () {
      self.highlightTimer = null;
      self.setData({ highlighted: {} });
    }, 6000);
  },

  /* ================= 提交 ================= */

  buildProfile() {
    const form = this.data.form || {};
    return {
      gender: form.gender,
      target_events: (form.target_events || []).slice(),
      event_levels: Object.assign({}, form.event_levels || {}),
      self_level: form.self_level,
      equipment: (form.equipment || []).slice(),
      space: form.space,
      time_per_session: Number(form.time_per_session) || 0,
      weekly_frequency: Number(form.weekly_frequency) || 0,
      body_limits: (form.body_limits || []).slice(),
      goal: form.goal,
      test_date: form.test_date,
      natural_language: String(this.data.parseText || '').trim()
    };
  },

  onSubmit() {
    if (this.data.submitting) return;
    const self = this;
    const profile = this.buildProfile();
    const check = validators.validateProfile(profile);
    if (!check.valid) {
      this.setData({ errors: check.errors });
      this.updateEventRows(check.errors);
      wx.showToast({ title: check.firstError, icon: 'none', duration: 2200 });
      this.scrollToFirstError(check.errors);
      return;
    }
    this.setData({ submitting: true, submitText: '正在诊断并生成计划', errors: {}, planBlocked: false });
    api
      .submitProfile(profile)
      .then(function () {
        return api.getDiagnosis(profile);
      })
      .then(function (diagnosis) {
        return api.generatePlan({ profile: profile, diagnosis: diagnosis });
      })
      .then(function () {
        self.setData({
          submitting: false,
          submitText: self.data.editMode ? '保存并重算计划' : '保存约束并生成计划'
        });
        wx.showToast({
          title: self.data.editMode ? '计划已重算' : '计划已生成',
          icon: 'success',
          duration: 1000
        });
        wx.switchTab({
          url: '/pages/plan/plan',
          fail: function () {
            // 切换失败时不阻塞：用户仍可用系统返回键回到计划页
          }
        });
      })
      .catch(function (err) {
        self.handleSubmitError(err);
      });
  },

  /** 提交失败：2001 无可用动作 -> 弹窗降级；1001 -> 内联错误 */
  handleSubmitError(err) {
    this.setData({
      submitting: false,
      submitText: this.data.editMode ? '保存并重算计划' : '保存约束并生成计划'
    });
    if (!err) return;
    if (err.code === 2001) {
      wx.showModal({
        title: '暂时无法生成计划',
        content:
          '当前器械 / 空间 / 身体限制组合下没有安全可用动作。建议放宽器械或空间限制后再试，画像已保存，可稍后重算。',
        confirmText: '返回修改',
        cancelText: '仅保存画像',
        success: (res) => {
          if (res.confirm) {
            // 留在本页并给出空态出口：引导放宽器械/空间后再生成
            this.setData({ planBlocked: true });
            return;
          }
          wx.showToast({ title: '约束已保存', icon: 'none' });
          wx.switchTab({
            url: '/pages/plan/plan',
            fail: function () {}
          });
        }
      });
      return;
    }
    if (err.code === 1001 && err.data && err.data.errors) {
      this.setData({ errors: err.data.errors });
      this.updateEventRows(err.data.errors);
      this.scrollToFirstError(err.data.errors);
    }
    // 其它错误由 request 层统一 toast，页面不重复提示
  },

  /** 按页面从上到下的顺序定位首个错误字段并滚动 */
  scrollToFirstError(errors) {
    const keys = Object.keys(errors || {});
    if (!keys.length) return;
    let first = '';
    for (let i = 0; i < FIELD_PRIORITY.length; i++) {
      if (keys.indexOf(FIELD_PRIORITY[i]) >= 0) {
        first = FIELD_PRIORITY[i];
        break;
      }
    }
    if (!first) {
      for (let j = 0; j < keys.length; j++) {
        if (keys[j].indexOf('event_levels.') === 0) {
          first = 'target_events';
          break;
        }
      }
    }
    const anchor = FIELD_ANCHORS[first];
    if (!anchor) return;
    wx.pageScrollTo({
      selector: '#' + anchor,
      duration: 300,
      fail: function () {}
    });
  },

  /** 2001 空态出口：收起提示并定位到器械卡，方便放宽约束 */
  onGoAdjustEquipment() {
    this.setData({ planBlocked: false });
    wx.pageScrollTo({
      selector: '#field-equipment',
      duration: 300,
      fail: function () {}
    });
  },

  /** 编辑模式：取消修改，回计划页 */
  onCancelEdit() {
    wx.switchTab({
      url: '/pages/plan/plan',
      fail: function () {}
    });
  }
});
