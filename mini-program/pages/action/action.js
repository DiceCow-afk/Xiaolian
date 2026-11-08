/**
 * 动作示范页（详情页，非 tab）
 * - 数据：onLoad 取 options.id → api.getAction(id)；缺 id / 1003 走错误态 + 返回出口
 * - 展示：深色 hero、关键帧播放器（demo.type=frames 时 500ms 逐帧循环，可播放/暂停/点选帧；
 *         text 类型用占位图 + 图文要点）、身体限制禁忌警示 + 降阶入口、
 *         能力维度 / 器械 / 空间 / 难度 / 组次信息、5 段内容（要点+呼吸、步骤时间线、
 *         常见错误、正误对比、替代动作）、底部返回 + 去打卡
 * - 清理：定时器在 onHide / onUnload 清理；图片 binderror 逐级降级到 placeholder / 文本占位
 */
const api = require('../../utils/api');
const store = require('../../utils/store');
const options = require('../../data/options');

/** 图片一级兜底：图文要点占位图 */
const PLACEHOLDER = '/assets/demo/placeholder.png';

Page({
  data: {
    /* 三态：loading | error | done */
    viewState: 'loading',
    stateText: '正在加载动作示范…',
    actionId: '',
    action: null,

    /* Hero */
    heroKicker: '动作示范',
    heroTitle: '动作示范',
    heroSub: '查看动作要点、步骤分解与常见错误',
    heroMeta: [],

    /* 关键帧播放器 */
    demoType: 'text',
    demoBadge: '图文要点',
    frames: [],
    frameCount: 0,
    frameIndex: 0,
    frameSrc: '',
    placeholder: PLACEHOLDER,
    frameError: false,
    imageBroken: false,
    playing: false,

    /* 身体限制禁忌 */
    conflict: false,
    conflictText: '',
    regression: null,
    progression: null,

    /* 动作信息 */
    dimensions: [],
    infoRows: [],

    /* 5 段内容 */
    tabs: [
      { key: 'points', label: '动作要点' },
      { key: 'steps', label: '步骤分解' },
      { key: 'errors', label: '常见错误' },
      { key: 'compare', label: '正误对比' },
      { key: 'alternatives', label: '替代动作' }
    ],
    activeTab: 'points',
    keyPoints: [],
    breathing: '',
    safetyNote: '',
    steps: [],
    errors: [],
    compares: [],
    alternatives: []
  },

  onLoad(options) {
    /* 实例属性：播放定时器 / 隐藏后恢复标记 / 用户主动暂停标记 */
    this._timer = null;
    this._resumeOnShow = false;
    this._userPaused = false;

    const actionId = options && options.id ? String(options.id) : '';
    if (!actionId) {
      this.setData({
        viewState: 'error',
        stateText: '缺少动作参数，请从计划页点击动作重新进入',
        action: null
      });
      return;
    }
    this.setData({ actionId: actionId });
    this.loadData();
  },

  onShow() {
    // 仅当在别页停留前处于播放状态、且不是用户主动暂停时才恢复
    if (!this._resumeOnShow) return;
    this._resumeOnShow = false;
    if (this._userPaused) return;
    this.startPlay();
  },

  onHide() {
    if (this.data.playing) {
      this._resumeOnShow = !this._userPaused;
    }
    this.stopTimer();
    if (this.data.playing) this.setData({ playing: false });
  },

  onUnload() {
    this._resumeOnShow = false;
    this.stopTimer();
  },

  /** 首次加载 / 错误态重试 */
  loadData() {
    const actionId = this.data.actionId;
    this.stopTimer();
    if (!actionId) {
      this.setData({
        viewState: 'error',
        stateText: '缺少动作参数，请从计划页点击动作重新进入',
        playing: false
      });
      return;
    }
    const self = this;
    this.setData({
      viewState: 'loading',
      stateText: '正在加载动作示范…',
      playing: false,
      frameError: false,
      imageBroken: false
    });
    api
      .getAction(actionId)
      .then(function (detail) {
        self.applyDetail(detail);
      })
      .catch(function (err) {
        const code = err && err.code;
        self.setData({
          viewState: 'error',
          stateText:
            code === 1003
              ? '动作不存在或已下架，请返回计划页重新选择'
              : (err && err.msg) || '加载失败，请稍后重试'
        });
      });
  },

  /** 把动作详情整理为页面可渲染结构（WXML 内不做复杂计算） */
  applyDetail(detail) {
    const self = this;
    const action = detail || {};
    const demo = action.demo || {};
    const frames =
      demo.type === 'frames' && Array.isArray(demo.frames)
        ? demo.frames.filter(function (path) {
            return !!path;
          })
        : [];
    const demoType = frames.length ? 'frames' : 'text';
    const placeholder = demo.placeholder || PLACEHOLDER;

    const template = action.sets_template || {};
    const setsText =
      template.sets && template.reps
        ? template.sets + ' 组 × ' + template.reps + (template.unit || '次')
        : '按计划完成';
    const restText = template.rest_sec ? '休息 ' + template.rest_sec + ' 秒' : '';

    const dimensionList = Array.isArray(action.dimension_list) ? action.dimension_list : [];
    const dimensions = dimensionList.map(function (item) {
      return {
        key: item.key,
        name: item.name,
        color: item.color || '#FF6B2C',
        weightText: Math.round((Number(item.weight) || 0) * 100) + '%'
      };
    });
    const dimensionText = dimensionList
      .map(function (item) {
        return item.name;
      })
      .join('、');

    const equipmentLabels = action.equipment_labels || [];
    const spaceLabels = action.space_labels || [];
    const profileInfo = action.current_profile || {};
    const conflictList = Array.isArray(profileInfo.conflict) ? profileInfo.conflict : [];
    const conflictLabels =
      Array.isArray(profileInfo.conflict_labels) && profileInfo.conflict_labels.length
        ? profileInfo.conflict_labels
        : conflictList;

    const regression = action.regression || null;
    const progression = action.progression || null;
    const alternatives = [];
    if (regression) {
      alternatives.push({
        action_id: regression.action_id,
        name: regression.name,
        levelLabel: regression.level_label || '入门',
        type: 'regression',
        typeLabel: '降阶'
      });
    }
    if (progression) {
      alternatives.push({
        action_id: progression.action_id,
        name: progression.name,
        levelLabel: progression.level_label || '入门',
        type: 'progression',
        typeLabel: '进阶'
      });
    }

    const equipmentText = equipmentLabels.length ? equipmentLabels.join('、') : '徒手';
    const spaceText = spaceLabels.length ? spaceLabels.join(' / ') : '不限';

    // hero 只放 1 个代表空间（优先当前画像空间，动作不支持时退回动作首个空间），
    // 完整兼容空间列表放到下方「动作信息」卡，避免 hero 元信息过长把「组次」挤换行
    const profile = store.getProfile();
    const profileSpaceKey = profile && profile.space ? profile.space : '';
    let profileSpaceLabel = '';
    (options.SPACE_OPTIONS || []).forEach(function (item) {
      if (item.value === profileSpaceKey) profileSpaceLabel = item.label;
    });
    const profileSpaceIndex = profileSpaceLabel ? spaceLabels.indexOf(profileSpaceLabel) : -1;
    const heroSpaceLabel =
      profileSpaceIndex >= 0 ? spaceLabels[profileSpaceIndex] : spaceLabels[0] || '不限';
    const heroSpaceText = spaceLabels.length > 1 ? heroSpaceLabel + ' 等多场景' : heroSpaceLabel;

    const infoRows = [
      { label: '可用器械', value: equipmentText },
      { label: '适合空间', value: spaceText },
      { label: '能力门槛', value: action.level_label || '入门' },
      { label: '组次模板', value: restText ? setsText + ' · ' + restText : setsText }
    ];

    this.setData(
      {
        viewState: 'done',
        stateText: '',
        action: action,
        heroKicker: '动作示范 · ' + (action.level_label || '入门'),
        heroTitle: action.name || '动作示范',
        heroSub: dimensionText ? '主要能力：' + dimensionText : '按要点与呼吸提示完成动作',
        heroMeta: [
          { label: '器械', value: equipmentText },
          { label: '空间', value: heroSpaceText },
          { label: '组次', value: setsText }
        ],
        demoType: demoType,
        demoBadge: demoType === 'frames' ? '共 ' + frames.length + ' 帧' : '图文要点',
        frames: frames,
        frameCount: frames.length,
        frameIndex: 0,
        frameSrc: frames.length ? frames[0] : placeholder,
        placeholder: placeholder,
        frameError: false,
        imageBroken: false,
        playing: false,
        conflict: conflictList.length > 0,
        conflictText: conflictLabels.join('、'),
        regression: regression,
        progression: progression,
        dimensions: dimensions,
        infoRows: infoRows,
        keyPoints: Array.isArray(action.key_points) ? action.key_points : [],
        breathing: action.breathing || '',
        safetyNote: action.safety_note || '',
        steps: (action.steps || []).map(function (text, index) {
          return { no: index + 1, text: text };
        }),
        errors: Array.isArray(action.common_errors) ? action.common_errors : [],
        compares: Array.isArray(action.correct_vs_wrong) ? action.correct_vs_wrong : [],
        alternatives: alternatives,
        activeTab: 'points'
      },
      function () {
        // 关键帧示范默认自动播放；等待 setData 完成后再启动，保证帧数据已就绪
        if (self.data.demoType === 'frames' && self.data.frameCount > 1) {
          self.startPlay();
        }
      }
    );
  },

  /* ================= 关键帧播放 ================= */

  startPlay() {
    if (this.data.demoType !== 'frames') return;
    if (this.data.frameCount < 2 || this.data.frameError || this.data.imageBroken) return;
    this.stopTimer();
    const self = this;
    this._timer = setInterval(function () {
      const total = self.data.frameCount;
      if (!total) return;
      const next = (self.data.frameIndex + 1) % total;
      self.setData({ frameIndex: next, frameSrc: self.data.frames[next] });
    }, 500);
    this.setData({ playing: true });
    this._userPaused = false;
  },

  pausePlay() {
    this.stopTimer();
    this._userPaused = true;
    this.setData({ playing: false });
  },

  stopTimer() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  },

  onTogglePlay() {
    if (this.data.demoType !== 'frames' || this.data.frameCount < 2) return;
    if (this.data.frameError || this.data.imageBroken) {
      wx.showToast({ title: '示范图暂不可用，请参考图文要点', icon: 'none' });
      return;
    }
    if (this.data.playing) {
      this.pausePlay();
    } else {
      this.startPlay();
    }
  },

  /** 点击圆点跳到指定帧（保持当前播放/暂停状态） */
  onDotTap(e) {
    const index = Number(e.currentTarget.dataset.index);
    if (isNaN(index) || index < 0 || index >= this.data.frames.length) return;
    if (!this.data.playing) this._userPaused = true;
    this.setData({
      frameIndex: index,
      frameSrc: this.data.frames[index],
      frameError: false,
      imageBroken: false
    });
  },

  /** 图片加载失败：先切占位图，占位图也失败则用文本占位，避免出现破图 */
  onFrameError() {
    if (this.data.demoType === 'text') {
      this.stopTimer();
      this.setData({ playing: false, imageBroken: true });
      return;
    }
    if (!this.data.frameError) {
      this.stopTimer();
      this.setData({ frameError: true, playing: false, frameSrc: this.data.placeholder });
      wx.showToast({ title: '示范图加载失败，已切换占位图', icon: 'none' });
      return;
    }
    if (!this.data.imageBroken) {
      this.setData({ playing: false, imageBroken: true });
    }
  },

  /* ================= 内容分段 ================= */

  onTabTap(e) {
    const key = e.currentTarget.dataset.key;
    if (!key || key === this.data.activeTab) return;
    this.setData({ activeTab: key });
  },

  /* ================= 跳转 ================= */

  goAction(actionId) {
    if (!actionId || actionId === this.data.actionId) return;
    wx.navigateTo({ url: '/pages/action/action?id=' + actionId });
  },

  /** 禁忌卡的降阶动作入口 */
  onGotoRegression() {
    const regression = this.data.regression;
    if (!regression) {
      wx.showToast({ title: '该动作暂未配置降阶动作', icon: 'none' });
      return;
    }
    this.goAction(regression.action_id);
  },

  /** 替代动作（降阶 / 进阶）跳转 */
  onGotoAlternative(e) {
    this.goAction(e.currentTarget.dataset.id);
  },

  /** 返回计划页：navigateBack 失败（如从分享直接进入）时兜底切 tab */
  onBack() {
    wx.navigateBack({
      delta: 1,
      fail: function () {
        wx.switchTab({ url: '/pages/plan/plan' });
      }
    });
  },

  onGoCheckin() {
    wx.switchTab({ url: '/pages/checkin/checkin' });
  }
});
