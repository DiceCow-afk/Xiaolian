/**
 * RPE 主观强度滑条（1-10）
 * properties:
 *  value   {Number} 1-10
 *  disabled {Boolean}
 * events:
 *  change -> { value }
 */
const options = require('../../data/options');

Component({
  options: {
    styleIsolation: 'isolated'
  },
  properties: {
    value: {
      type: Number,
      value: 6
    },
    disabled: {
      type: Boolean,
      value: false
    },
    leftText: {
      type: String,
      value: '很轻松'
    },
    rightText: {
      type: String,
      value: '力竭'
    }
  },
  data: {
    displayValue: 6,
    desc: '有点累',
    min: 1,
    max: 10
  },
  observers: {
    value: function (value) {
      this.syncView(value);
    }
  },
  attached() {
    this.syncView(this.data.value);
  },
  methods: {
    syncView(value) {
      const v = Math.max(1, Math.min(10, Number(value) || 6));
      const level = options.RPE_LEVELS[v - 1];
      this.setData({
        displayValue: v,
        desc: level ? level.label : ''
      });
    },
    onChange(e) {
      const value = Number(e.detail.value);
      this.syncView(value);
      this.triggerEvent('change', { value: value });
    },
    onChanging(e) {
      this.syncView(Number(e.detail.value));
    }
  }
});
