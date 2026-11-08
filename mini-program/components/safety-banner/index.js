/**
 * 安全拦截提示（独立规则表产出的硬过滤结果）
 * properties:
 *  intercepts     {Array} [{ rule_id, action_name, reason, replaced_by_name }]
 *  title          {String}
 *  collapsible    {Boolean}
 *  defaultExpanded {Boolean}
 */
Component({
  options: {
    styleIsolation: 'isolated'
  },
  properties: {
    intercepts: {
      type: Array,
      value: []
    },
    title: {
      type: String,
      value: '安全拦截'
    },
    collapsible: {
      type: Boolean,
      value: true
    },
    defaultExpanded: {
      type: Boolean,
      value: false
    }
  },
  data: {
    expanded: false,
    count: 0
  },
  observers: {
    intercepts: function (list) {
      this.setData({
        count: (list || []).length,
        expanded: this.data.defaultExpanded
      });
    }
  },
  methods: {
    onToggle() {
      if (!this.data.collapsible) return;
      this.setData({ expanded: !this.data.expanded });
    }
  }
});
