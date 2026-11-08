/**
 * 计划卡片：训练日卡片（计划页 / 打卡页 / 周反馈预览复用）
 * properties:
 *  session    {Object} 训练日对象（见《接口契约》plan.weeks[].sessions[]）
 *  mode       {String} full | compact
 *  showStatus {Boolean} 是否展示打卡状态
 * events:
 *  actiontap -> { actionId, actionName, index }   点击动作标签查看示范
 *  checkin   -> { sessionId }                      点击去打卡
 */
Component({
  options: {
    styleIsolation: 'isolated'
  },
  properties: {
    session: {
      type: Object,
      value: {}
    },
    mode: {
      type: String,
      value: 'full'
    },
    showStatus: {
      type: Boolean,
      value: true
    }
  },
  data: {
    statusLabel: '待打卡'
  },
  observers: {
    session: function (session) {
      const status = (session && session.status) || 'pending';
      const map = {
        pending: '待打卡',
        done: '已完成',
        partial: '部分完成',
        skipped: '已跳过'
      };
      this.setData({ statusLabel: map[status] || '待打卡' });
    }
  },
  methods: {
    onActionTap(e) {
      const detail = e.detail || {};
      this.triggerEvent('actiontap', {
        actionId: detail.actionId,
        actionName: detail.actionName,
        index: detail.index
      });
    },
    onCheckin() {
      const session = this.data.session || {};
      this.triggerEvent('checkin', { sessionId: session.session_id });
    }
  }
});
