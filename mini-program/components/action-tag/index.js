/**
 * 动作标签：计划卡片中的一个动作条目
 * properties:
 *  action   {Object} { action_id, name, reps_text, rest_text, role_label, level_label }
 *  index    {Number}
 *  showMeta {Boolean} 是否展示组次/休息/难度（紧凑模式关闭）
 *  selected {Boolean}
 * events:
 *  select -> { actionId, actionName, index }
 */
Component({
  options: {
    styleIsolation: 'isolated'
  },
  properties: {
    action: {
      type: Object,
      value: {}
    },
    index: {
      type: Number,
      value: 0
    },
    showMeta: {
      type: Boolean,
      value: true
    },
    selected: {
      type: Boolean,
      value: false
    }
  },
  methods: {
    onTap() {
      const action = this.data.action || {};
      this.triggerEvent('select', {
        actionId: action.action_id,
        actionName: action.name,
        index: this.data.index
      });
    }
  }
});
