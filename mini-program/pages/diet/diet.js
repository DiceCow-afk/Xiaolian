/**
 * 饮食提示页（tab 3，拓展功能）
 * 只看两个与训练关联的维度：蛋白质是否够、训练日主食是否够。
 * 说明：数据全部来自 utils/api.js 的 getDietTips；选择食物后局部刷新提示，不整页 loading。
 */
const api = require('../../utils/api');
const util = require('../../utils/util');
const reminder = require('../../utils/reminder');

/** 食物分类展示顺序（category 来自 getDietTips 的 food_table） */
const FOOD_GROUPS = [
  { key: 'protein', title: '蛋白来源', icon: '🥚', desc: '蛋奶、肉类、豆制品' },
  { key: 'carb', title: '主食碳水', icon: '🍚', desc: '米饭、面食、粗粮、水果' },
  { key: 'veg', title: '蔬菜', icon: '🥦', desc: '食堂常见蔬菜' },
  { key: 'other', title: '其他', icon: '🥤', desc: '饮料与补水' }
];

/** level -> 徽标 / 进度条配色（复用 app.wxss 的 tag 类） */
const LEVEL_META = {
  low: { tag: 'tag-warning', bar: 'bar-warn' },
  ok: { tag: 'tag-success', bar: 'bar-ok' },
  high: { tag: 'tag-info', bar: 'bar-high' }
};

Page({
  data: {
    viewState: 'loading',
    loadingText: '正在读取今日饮食提示…',
    errorText: '',

    // 今日训练
    trainingType: '',
    trainingLabel: '识别中…',
    trainingTitle: '',
    isRest: false,
    dateText: '',
    trainingSession: null,

    // 粗略摄入
    intake: { protein_g: 0, carb_g: 0, kcal: 0, items: [] },
    proteinText: '—',
    carbText: '—',

    // 两个维度提示
    tips: [],
    hasTips: false,
    tipsLoading: false,

    // 食物选择
    foodGroups: [],
    selectedFoods: [],
    selectedCount: 0,

    disclaimer: ''
  },

  onLoad() {
    this._seq = 0;
    this._foodMap = {};
    this.loadData();
  },

  onShow() {
    // tab 页每次展示都刷新打卡角标（应用内提醒兜底）
    reminder.refreshBadge();
    // 训练类型可能随日期/计划变化，回来时静默刷新一次
    if (this.hasLoaded) this.refreshSilent();
  },

  onUnload() {
    // 让未返回的请求结果失效，避免页面卸载后继续 setData
    this._seq = (this._seq || 0) + 1;
  },

  onPullDownRefresh() {
    const self = this;
    const seq = this.nextSeq();
    this.requestTips()
      .then(function (res) {
        if (seq === self._seq) {
          self.applyData(res);
          self.hasLoaded = true;
        }
        wx.stopPullDownRefresh();
      })
      .catch(function () {
        wx.stopPullDownRefresh();
      });
  },

  /* ================= 数据请求 ================= */

  nextSeq() {
    this._seq = (this._seq || 0) + 1;
    return this._seq;
  },

  requestTips() {
    return api.getDietTips({ date: util.todayStr(), foods: this.data.selectedFoods });
  },

  /** 首屏 / 重试：整页三态 */
  loadData() {
    const self = this;
    const seq = this.nextSeq();
    this.setData({ viewState: 'loading', loadingText: '正在读取今日饮食提示…', errorText: '' });
    this.requestTips()
      .then(function (res) {
        if (seq !== self._seq) return;
        self.applyData(res);
        self.hasLoaded = true;
      })
      .catch(function (err) {
        if (seq !== self._seq) return;
        self.setData({
          viewState: 'error',
          errorText: (err && err.msg) || '饮食提示加载失败，请稍后重试'
        });
      });
  },

  /** onShow 静默刷新：失败保留旧数据 */
  refreshSilent() {
    const self = this;
    const seq = this.nextSeq();
    this.requestTips()
      .then(function (res) {
        if (seq !== self._seq) return;
        self.applyData(res);
      })
      .catch(function () {
        // request 层已 toast，静默刷新失败时保留上次内容
      });
  },

  /** 选择变化后局部刷新 tips（不整页 loading） */
  refreshTips() {
    const self = this;
    const seq = this.nextSeq();
    this.setData({ tipsLoading: true });
    this.requestTips()
      .then(function (res) {
        if (seq !== self._seq) return;
        self.applyData(res);
        self.setData({ tipsLoading: false });
      })
      .catch(function () {
        if (seq !== self._seq) return;
        self.setData({ tipsLoading: false });
      });
  },

  /* ================= 数据落地 ================= */

  applyData(res) {
    if (!res) return;
    const foodTable = Array.isArray(res.food_table) ? res.food_table : [];
    const foodMap = {};
    foodTable.forEach(function (food) {
      foodMap[food.food_id] = food;
    });
    this._foodMap = foodMap;

    const dimMap = {};
    (res.dimensions || []).forEach(function (dim) {
      dimMap[dim.key] = dim;
    });

    const selectedIds = this.data.selectedFoods.map(function (item) {
      return item.food_id;
    });
    const self = this;
    const tips = (res.tips || []).map(function (tip) {
      return self.buildTip(tip, dimMap, selectedIds);
    });
    const groups = this.buildGroups(foodTable, selectedIds);
    const trainingType = res.training_type || 'rest';
    const isRest = trainingType === 'rest';
    const session = res.training_session || null;
    const intake = res.intake || { protein_g: 0, carb_g: 0, kcal: 0, items: [] };

    this.setData({
      viewState: 'done',
      errorText: '',
      trainingType: trainingType,
      trainingLabel: res.training_label || (isRest ? '休息日' : '训练日'),
      trainingTitle: session ? session.title : isRest ? '今天没有安排训练' : '',
      trainingSession: session,
      isRest: isRest,
      dateText: res.date || util.todayStr(),
      intake: intake,
      proteinText: (Number(intake.protein_g) || 0) + ' g',
      carbText: (Number(intake.carb_g) || 0) + ' g',
      tips: tips,
      hasTips: tips.length > 0,
      foodGroups: groups,
      selectedCount: this.data.selectedFoods.length,
      disclaimer: res.disclaimer || ''
    });
  },

  /** 把一个维度 tip 转成视图数据（徽标、进度、建议食物是否已加） */
  buildTip(tip, dimMap, selectedIds) {
    const dimension = tip.dimension || 'protein';
    const dim = dimMap[dimension] || {};
    const level = tip.level || 'ok';
    const meta = LEVEL_META[level] || LEVEL_META.ok;
    const target = Number(tip.target_g) || 0;
    const actual = Number(tip.actual_g) || 0;
    let percent = target > 0 ? Math.round((actual / target) * 100) : 100;
    if (percent < 0) percent = 0;
    if (percent > 100) percent = 100;
    const suggested = (tip.suggested_foods || []).map(function (food) {
      return {
        food_id: food.food_id,
        name: food.name,
        unit: food.unit,
        added: selectedIds.indexOf(food.food_id) >= 0
      };
    });
    return {
      dimension: dimension,
      label: tip.label || dim.name || dimension,
      icon: dim.icon || '🎯',
      desc: dim.desc || '',
      level: level,
      level_label: tip.level_label || '',
      level_class: meta.tag,
      bar_class: meta.bar,
      actual_g: actual,
      target_g: target,
      percent: percent,
      message: tip.message || '',
      suggested_foods: suggested
    };
  },

  /** 按 category 分组生成多个 tag-picker 的数据 */
  buildGroups(foodTable, selectedIds) {
    const groups = [];
    FOOD_GROUPS.forEach(function (meta) {
      const options = foodTable
        .filter(function (food) {
          return food.category === meta.key;
        })
        .map(function (food) {
          return { value: food.food_id, label: food.name, desc: food.unit };
        });
      if (!options.length) return;
      const value = selectedIds.filter(function (id) {
        return options.some(function (option) {
          return option.value === id;
        });
      });
      groups.push({
        key: meta.key,
        title: meta.title,
        icon: meta.icon,
        desc: meta.desc,
        options: options,
        value: value
      });
    });
    return groups;
  },

  /** 把各分组的选中值同步回 tag-picker（组件为受控组件） */
  syncGroupValues(selectedFoods) {
    const foodMap = this._foodMap || {};
    const ids = selectedFoods.map(function (item) {
      return item.food_id;
    });
    const groups = this.data.foodGroups.map(function (group) {
      const value = ids.filter(function (id) {
        const food = foodMap[id];
        return food && food.category === group.key;
      });
      return Object.assign({}, group, { value: value });
    });
    this.setData({ foodGroups: groups });
  },

  /* ================= 交互 ================= */

  /** 某一分类的食物多选变化：合并 selectedFoods 后局部刷新提示 */
  onFoodGroupChange(e) {
    const groupKey = e.currentTarget.dataset.group;
    const values = (e.detail && e.detail.value) || [];
    if (!groupKey) return;
    this.mergeSelections(groupKey, values);
  },

  mergeSelections(groupKey, values) {
    const foodMap = this._foodMap || {};
    const selectedMap = {};
    this.data.selectedFoods.forEach(function (item) {
      selectedMap[item.food_id] = item;
    });
    // 该分类以组件最新选择为准，其余分类保留原有份数
    const keep = this.data.selectedFoods.filter(function (item) {
      const food = foodMap[item.food_id];
      return food && food.category !== groupKey;
    });
    const picked = values.map(function (id) {
      return selectedMap[id] || { food_id: id, portion: 1 };
    });
    const selected = keep.concat(picked);
    this.setData({ selectedFoods: selected, selectedCount: selected.length });
    this.syncGroupValues(selected);
    this.refreshTips();
  },

  /** 点击建议食物：加入已选并刷新提示 */
  onAddSuggested(e) {
    const foodId = e.currentTarget.dataset.foodId;
    if (!foodId) return;
    const exists = this.data.selectedFoods.some(function (item) {
      return item.food_id === foodId;
    });
    if (exists) {
      wx.showToast({ title: '已经在已选食物里了', icon: 'none' });
      return;
    }
    const selected = this.data.selectedFoods.concat([{ food_id: foodId, portion: 1 }]);
    this.setData({ selectedFoods: selected, selectedCount: selected.length });
    this.syncGroupValues(selected);
    this.refreshTips();
    wx.showToast({ title: '已加入已选食物', icon: 'none', duration: 1000 });
  },

  /** Hero 免责说明入口 */
  onShowDisclaimer() {
    wx.showModal({
      title: '饮食提示说明',
      content:
        this.data.disclaimer ||
        '以上仅为一般性饮食参考，不构成营养处方；如有特殊健康状况请咨询医生或注册营养师。',
      showCancel: false,
      confirmText: '我知道了'
    });
  },

  /** 今日训练卡出口：训练日去打卡，休息日看计划 */
  onGoTraining() {
    wx.switchTab({
      url: this.data.isRest ? '/pages/plan/plan' : '/pages/checkin/checkin',
      fail: function () {}
    });
  }
});
