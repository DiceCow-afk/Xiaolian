/**
 * 数字步进器（每周训练次数等）
 * properties:
 *  value {Number}
 *  min   {Number}
 *  max   {Number}
 *  step  {Number}
 *  unit  {String} 单位后缀
 *  disabled {Boolean}
 * events:
 *  change -> { value }
 */
Component({
  options: {
    styleIsolation: 'isolated'
  },
  properties: {
    value: {
      type: Number,
      value: 3
    },
    min: {
      type: Number,
      value: 1
    },
    max: {
      type: Number,
      value: 99
    },
    step: {
      type: Number,
      value: 1
    },
    unit: {
      type: String,
      value: ''
    },
    disabled: {
      type: Boolean,
      value: false
    }
  },
  methods: {
    update(next) {
      const value = Math.max(this.data.min, Math.min(this.data.max, next));
      if (value === this.data.value) return;
      this.triggerEvent('change', { value: value });
    },
    onMinus() {
      if (this.data.disabled) return;
      this.update(Number(this.data.value) - Number(this.data.step || 1));
    },
    onPlus() {
      if (this.data.disabled) return;
      this.update(Number(this.data.value) + Number(this.data.step || 1));
    }
  }
});
