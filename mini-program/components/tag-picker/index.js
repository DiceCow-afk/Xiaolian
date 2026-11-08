/**
 * 标签选择器（单选 / 多选 / 互斥项）
 * properties:
 *  options        {Array}  [{ value, label, desc }]
 *  value          {Any}    multiple 时为数组
 *  multiple       {Boolean}
 *  exclusiveValue {String} 互斥值（如「无器械」「无限制」「没有不适」）：选中它清空其他，选其他清空它
 *  max            {Number} 多选上限，0 表示不限
 *  layout         {String} chips | cards
 *  disabled       {Boolean}
 *  accent         {String} 主色，默认品牌橙
 * events:
 *  change -> { value, changed }
 */
Component({
  options: {
    styleIsolation: 'isolated'
  },
  properties: {
    options: {
      type: Array,
      value: []
    },
    value: {
      type: null,
      value: ''
    },
    multiple: {
      type: Boolean,
      value: false
    },
    exclusiveValue: {
      type: String,
      value: ''
    },
    max: {
      type: Number,
      value: 0
    },
    layout: {
      type: String,
      value: 'chips'
    },
    disabled: {
      type: Boolean,
      value: false
    },
    accent: {
      type: String,
      value: '#FF6B2C'
    }
  },
  data: {
    items: [],
    selectedValues: []
  },
  observers: {
    'options, value': function () {
      this.rebuild();
    }
  },
  attached() {
    this.rebuild();
  },
  methods: {
    normalizeSelected(value) {
      if (this.data.multiple) {
        if (Array.isArray(value)) return value.slice();
        if (value === '' || value === null || value === undefined) return [];
        return [value];
      }
      if (value === '' || value === null || value === undefined) return [];
      return [value];
    },
    rebuild() {
      const selected = this.normalizeSelected(this.data.value);
      const items = (this.data.options || []).map(function (item) {
        return Object.assign({}, item, {
          checked: selected.some(function (v) {
            return String(v) === String(item.value);
          })
        });
      });
      this.setData({ items: items, selectedValues: selected });
    },
    onTap(e) {
      if (this.data.disabled) return;
      const index = Number(e.currentTarget.dataset.index);
      const item = this.data.items[index];
      if (!item) return;
      const value = item.value;
      let selected = this.normalizeSelected(this.data.value);

      if (this.data.multiple) {
        const exists = selected.some(function (v) {
          return String(v) === String(value);
        });
        const exclusive = this.data.exclusiveValue;
        if (exists) {
          selected = selected.filter(function (v) {
            return String(v) !== String(value);
          });
        } else {
          if (exclusive && String(value) === String(exclusive)) {
            selected = [value];
          } else {
            if (exclusive) {
              selected = selected.filter(function (v) {
                return String(v) !== String(exclusive);
              });
            }
            if (this.data.max > 0 && selected.length >= this.data.max) {
              wx.showToast({ title: '最多选择 ' + this.data.max + ' 项', icon: 'none' });
              return;
            }
            selected = selected.concat([value]);
          }
        }
        this.triggerEvent('change', { value: selected, changed: value });
      } else {
        // 单选：点击已选项不取消（避免出现空值），由页面设置默认值
        if (String(selected[0]) === String(value)) return;
        this.triggerEvent('change', { value: value, changed: value });
      }
    }
  }
});
