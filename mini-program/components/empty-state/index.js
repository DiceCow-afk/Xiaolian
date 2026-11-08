/**
 * 空状态：无计划 / 无打卡 / 无反馈时的引导
 * properties:
 *  icon       {String} emoji
 *  title      {String}
 *  desc       {String}
 *  actionText {String} 有值才展示按钮
 *  actionType {String} primary | ghost
 * events:
 *  action
 */
Component({
  options: {
    styleIsolation: 'isolated'
  },
  properties: {
    icon: {
      type: String,
      value: '🏃'
    },
    title: {
      type: String,
      value: '暂无数据'
    },
    desc: {
      type: String,
      value: ''
    },
    actionText: {
      type: String,
      value: ''
    },
    actionType: {
      type: String,
      value: 'primary'
    }
  },
  methods: {
    onAction() {
      this.triggerEvent('action', {});
    }
  }
});
