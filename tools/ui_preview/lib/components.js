/**
 * 8 个公共组件的近似渲染函数
 * 说明：组件真实渲染依赖小程序运行时（properties / observers / setData），
 * 这里按各组件的 index.wxml 结构 + 传入 props 静态生成等价 HTML，
 * 复用组件自身的 index.wxss 类名，因此视觉上接近真机，但不具备交互能力。
 */
'use strict';

const PLAN_STATUS_LABEL = {
  pending: '待打卡',
  done: '已完成',
  partial: '部分完成',
  skipped: '已跳过'
};

function esc(value) {
  return String(value === undefined || value === null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderActionTag(action) {
  const a = action || {};
  const role = a.role_label
    ? '<span class="at-role at-role--' + esc(a.role) + '">' + esc(a.role_label) + '</span>'
    : '';
  const reps = a.reps_text ? '<span class="at-reps">' + esc(a.reps_text) + '</span>' : '';
  const rest = a.rest_text ? '<span class="at-rest">休息 ' + esc(a.rest_text) + '</span>' : '';
  return (
    '<div class="at"><div class="at-main">' + role +
    '<span class="at-name">' + esc(a.name) + '</span></div>' +
    '<div class="at-side">' + reps + rest + '</div><span class="at-arrow">›</span></div>'
  );
}

function renderPlanCard(props) {
  const session = props.session || {};
  const compact = props.mode === 'compact';
  const showStatus = props.showStatus !== false && props.showStatus !== 'false' && props.showStatus !== '';
  const status = session.status || 'pending';
  const actions = (session.actions || []).map(renderActionTag).join('');
  return (
    '<div class="plan-card ' + (compact ? 'plan-card--compact' : '') + '">' +
    '<div class="pc-head"><div class="pc-day">' +
    '<span class="pc-day-label">' + esc(session.day_label || '训练日') + '</span>' +
    '<span class="pc-date">' + esc(session.date_md) + '</span></div>' +
    '<div class="pc-title-wrap"><div class="pc-title">' + esc(session.title) + '</div>' +
    '<div class="pc-meta"><span class="pc-meta-item">⏱ ' + esc(session.duration_text) + '</span>' +
    '<span class="pc-meta-dot">·</span><span class="pc-meta-item">📍 ' + esc(session.location) + '</span></div></div>' +
    (showStatus && session.status
      ? '<div class="pc-status pc-status--' + esc(status) + '">' + esc(PLAN_STATUS_LABEL[status] || '待打卡') + '</div>'
      : '') +
    '</div>' +
    '<div class="pc-actions">' + actions + '</div>' +
    (!compact && session.notes
      ? '<div class="pc-notes"><span class="pc-notes-icon">💡</span><span class="pc-notes-text">' +
        esc(session.notes) + '</span></div>'
      : '') +
    (!compact
      ? '<div class="pc-foot"><span class="pc-hint">' + (session.actions || []).length +
        ' 个动作 · 点击动作查看示范</span><div class="pc-btn">' +
        (status === 'done' ? '查看打卡' : '去打卡') + '</div></div>'
      : '') +
    '</div>'
  );
}

function renderStateView(props, childrenHtml) {
  const state = props.state || 'loading';
  const minHeight = props.minHeight || '360rpx';
  if (state === 'done') return childrenHtml;
  if (state === 'error') {
    return (
      '<div class="sv-wrap" style="min-height:' + esc(minHeight) + '">' +
      '<div class="sv"><span class="sv-icon">😵</span>' +
      '<span class="sv-title">' + esc(props.errorTitle || '加载失败') + '</span>' +
      '<span class="sv-text">' + esc(props.text || '网络开小差了，请稍后重试') + '</span>' +
      '<div class="sv-retry">' + esc(props.retryText || '重新加载') + '</div></div></div>'
    );
  }
  return (
    '<div class="sv-wrap" style="min-height:' + esc(minHeight) + '">' +
    '<div class="sv"><div class="sv-spinner"><div class="sv-spinner-ring"></div>' +
    '<span class="sv-spinner-dot">校</span></div>' +
    '<span class="sv-text">' + esc(props.text || '加载中…') + '</span></div></div>'
  );
}

function renderEmptyState(props) {
  return (
    '<div class="empty"><div class="empty-icon-wrap">' +
    '<span class="empty-icon">' + esc(props.icon || '🏃') + '</span>' +
    '<div class="empty-ring"></div></div>' +
    '<span class="empty-title">' + esc(props.title || '暂无数据') + '</span>' +
    (props.desc ? '<span class="empty-desc">' + esc(props.desc) + '</span>' : '') +
    (props.actionText ? '<div class="empty-btn">' + esc(props.actionText) + '</div>' : '') +
    '</div>'
  );
}

function renderSafetyBanner(props) {
  const list = Array.isArray(props.intercepts) ? props.intercepts : [];
  if (!list.length) return '';
  const expanded = props.defaultExpanded === true || props.defaultExpanded === 'true';
  let items = '';
  if (expanded) {
    items =
      '<div class="sb-list">' +
      list
        .map(function (item) {
          return (
            '<div class="sb-item"><div class="sb-item-hd"><span class="sb-rule">' + esc(item.rule_id) +
            '</span><span class="sb-action">' + esc(item.action_name) + '</span></div>' +
            '<div class="sb-reason">' + esc(item.reason) + '</div>' +
            (item.replaced_by_name ? '<div class="sb-replace">→ 已替换为：' + esc(item.replaced_by_name) + '</div>' : '') +
            '</div>'
          );
        })
        .join('') +
      '<div class="sb-note">安全判断来自独立规则表，不依赖知识图谱与大模型。</div></div>';
  }
  return (
    '<div class="sb"><div class="sb-head"><div class="sb-icon">🛡️</div>' +
    '<div class="sb-head-main"><div class="sb-title">' + esc(props.title || '安全拦截') +
    ' <span class="sb-count">' + list.length + '</span></div>' +
    '<div class="sb-sub">已按「器械 / 空间 / 身体限制 / 能力门槛」四类硬过滤处理</div></div>' +
    (props.collapsible !== false ? '<span class="sb-arrow">⌄</span>' : '') +
    '</div>' + items + '</div>'
  );
}

function renderTagPicker(props) {
  const options = Array.isArray(props.options) ? props.options : [];
  const multiple = props.multiple === true || props.multiple === 'true';
  const layout = props.layout || 'chips';
  const rawValue = props.value;
  let selected = [];
  if (multiple) {
    selected = Array.isArray(rawValue) ? rawValue : rawValue === '' || rawValue === undefined ? [] : [rawValue];
  } else {
    selected = rawValue === '' || rawValue === undefined || rawValue === null ? [] : [rawValue];
  }
  const disabled = props.disabled === true || props.disabled === 'true';
  const items = options
    .map(function (item) {
      const checked = selected.some(function (v) {
        return String(v) === String(item.value);
      });
      return (
        '<div class="tp-item ' + (checked ? 'tp-item--checked ' : '') +
        (disabled ? 'tp-item--disabled ' : '') + '">' +
        '<span class="tp-label">' + esc(item.label) + '</span>' +
        (item.desc && layout === 'cards' ? '<span class="tp-desc">' + esc(item.desc) + '</span>' : '') +
        (checked && layout === 'cards' ? '<span class="tp-check">✓</span>' : '') +
        '</div>'
      );
    })
    .join('');
  return '<div class="tp tp--' + esc(layout) + '">' + items + '</div>';
}

function renderRpeSlider(props, ctx) {
  const levels = (ctx && ctx.options && ctx.options.RPE_LEVELS) || [];
  let value = Number(props.value);
  if (!value) value = 6;
  value = Math.max(1, Math.min(10, value));
  const level = levels[value - 1];
  const percent = ((value - 1) / 9) * 100;
  return (
    '<div class="rpe"><div class="rpe-head"><div class="rpe-title-wrap">' +
    '<span class="rpe-title">RPE 主观用力程度</span>' +
    '<span class="rpe-desc">' + esc(level ? level.label : '') + '</span></div>' +
    '<div class="rpe-value-wrap"><span class="rpe-value">' + value + '</span>' +
    '<span class="rpe-total">/10</span></div></div>' +
    '<div class="pv-rpe-track"><div class="pv-rpe-fill" style="width:' + percent.toFixed(1) + '%"></div>' +
    '<div class="pv-rpe-knob" style="left:calc(' + percent.toFixed(1) + '% - 8px)"></div></div>' +
    '<div class="rpe-foot"><span>' + esc(props.leftText || '很轻松') + '</span>' +
    '<span>' + esc(props.rightText || '力竭') + '</span></div></div>'
  );
}

function renderStepper(props) {
  const value = props.value === undefined || props.value === '' ? 3 : props.value;
  return (
    '<div class="stepper"><div class="stepper-btn">−</div>' +
    '<div class="stepper-value"><span class="stepper-num">' + esc(value) + '</span>' +
    (props.unit ? '<span class="stepper-unit">' + esc(props.unit) + '</span>' : '') +
    '</div><div class="stepper-btn">＋</div></div>'
  );
}

function createComponents(ctx) {
  return {
    'plan-card': function (props) {
      return renderPlanCard(props);
    },
    'action-tag': function (props) {
      return renderActionTag(props.action);
    },
    'state-view': function (props, childrenHtml) {
      return renderStateView(props, childrenHtml);
    },
    'empty-state': function (props) {
      return renderEmptyState(props);
    },
    'safety-banner': function (props) {
      return renderSafetyBanner(props);
    },
    'tag-picker': function (props) {
      return renderTagPicker(props);
    },
    'rpe-slider': function (props) {
      return renderRpeSlider(props, ctx);
    },
    stepper: function (props) {
      return renderStepper(props);
    }
  };
}

module.exports = {
  createComponents: createComponents
};
