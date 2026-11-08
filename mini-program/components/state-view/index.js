/**
 * 加载 / 错误 / 内容三态容器（统一 loading、错误、重试）
 * properties:
 *  state      {String} loading | error | done
 *  text       {String}
 *  errorTitle {String}
 *  retryText  {String}
 *  minHeight  {String} 例如 '480rpx'
 * events:
 *  retry
 */
Component({
  options: {
    styleIsolation: 'isolated',
    multipleSlots: true
  },
  properties: {
    state: {
      type: String,
      value: 'loading'
    },
    text: {
      type: String,
      value: ''
    },
    errorTitle: {
      type: String,
      value: '加载失败'
    },
    retryText: {
      type: String,
      value: '重新加载'
    },
    minHeight: {
      type: String,
      value: '360rpx'
    }
  },
  methods: {
    onRetry() {
      this.triggerEvent('retry', {});
    }
  }
});
