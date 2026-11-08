/**
 * WXML 近似渲染器（仅用于本地布局预览，不是微信官方渲染器）
 *
 * 支持范围（覆盖「校练」小程序 6 个页面实际用到的语法）：
 * - 标签：view / text / image / scroll-view / block / input / textarea / picker / switch
 * - 指令：wx:if / wx:elif / wx:else / wx:for（含 wx:for-item、wx:for-index）
 * - 插值：{{ 简单 JS 表达式 }}（三元、比较、属性访问、字符串拼接、数组长度等）
 * - 自定义组件：由调用方通过 ctx.components 提供近似渲染函数
 *
 * 不支持：事件绑定、组件生命周期、setData 联动、slider/swiper 等原生交互组件，
 * 以及 WXML 的精确空白/换行规则；因此只能用于「布局与视觉近似」，不能替代真机截图。
 */
'use strict';

function parseAttrs(str) {
  const attrs = {};
  const re = /([a-zA-Z_:][\w:.-]*)(?:\s*=\s*("([^"]*)"|'([^']*)'))?/g;
  let m;
  while ((m = re.exec(str || ''))) {
    attrs[m[1]] = m[3] !== undefined ? m[3] : m[4] !== undefined ? m[4] : '';
  }
  return attrs;
}

function parseWXML(src) {
  const source = String(src || '').replace(/<!--[\s\S]*?-->/g, '');
  const root = { tag: '#root', attrs: {}, children: [] };
  const stack = [root];
  const re = /<(\/?)([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;
  let last = 0;
  let m;

  function pushText(text) {
    if (!text) return;
    stack[stack.length - 1].children.push({ type: 'text', text: text });
  }

  while ((m = re.exec(source))) {
    pushText(source.slice(last, m.index));
    last = re.lastIndex;
    const closing = m[1] === '/';
    const tag = m[2];
    const selfClose = m[4] === '/';
    if (closing) {
      if (stack.length > 1) stack.pop();
      continue;
    }
    const node = { tag: tag, attrs: parseAttrs(m[3]), children: [] };
    stack[stack.length - 1].children.push(node);
    // WXML 中 <image />、<input /> 可能自闭合，也可能写成 <image></image>：
    // 统一依据源码的 / 判定，避免把闭合标签错误地弹到父级（会导致绝对定位元素错位）
    if (!selfClose) stack.push(node);
  }
  pushText(source.slice(last));
  return root.children;
}

/* ================= 表达式求值 ================= */

function evalExpr(expr, scope) {
  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function('s', 'with (s) { return (' + expr + '); }');
    const value = fn(scope);
    return value === undefined ? '' : value;
  } catch (e) {
    return '';
  }
}

const WHOLE_EXPR_RE = /^\s*\{\{([\s\S]*?)\}\}\s*$/;

function evalAttr(raw, scope) {
  if (raw === undefined || raw === null) return '';
  const whole = WHOLE_EXPR_RE.exec(raw);
  if (whole) return evalExpr(whole[1], scope);
  return String(raw).replace(/\{\{([\s\S]*?)\}\}/g, function (_, expr) {
    const value = evalExpr(expr, scope);
    return value === undefined || value === null ? '' : String(value);
  });
}

function str(value) {
  if (value === undefined || value === null) return '';
  return String(value);
}

function escapeHTML(value) {
  return str(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(value) {
  return str(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ================= 渲染 ================= */

function renderChildren(children, scope, ctx) {
  let html = '';
  let chain = undefined; // undefined | 'failed' | 'done'
  (children || []).forEach(function (node) {
    if (node.type === 'text') {
      html += String(node.text).replace(/\{\{([\s\S]*?)\}\}/g, function (_, expr) {
        return escapeHTML(evalExpr(expr, scope));
      });
      return;
    }
    const attrs = node.attrs || {};
    if (attrs['wx:if'] !== undefined) {
      const pass = !!evalAttr(attrs['wx:if'], scope);
      chain = pass ? 'done' : 'failed';
      if (pass) html += renderElement(node, scope, ctx);
      return;
    }
    if (attrs['wx:elif'] !== undefined) {
      if (chain === 'failed' && !!evalAttr(attrs['wx:elif'], scope)) {
        chain = 'done';
        html += renderElement(node, scope, ctx);
      }
      return;
    }
    if (attrs['wx:else'] !== undefined) {
      if (chain === 'failed') html += renderElement(node, scope, ctx);
      chain = undefined;
      return;
    }
    chain = undefined;
    html += renderElement(node, scope, ctx);
  });
  return html;
}

function renderElement(node, scope, ctx) {
  const attrs = node.attrs || {};
  if (attrs['wx:for'] !== undefined) {
    const list = evalAttr(attrs['wx:for'], scope);
    const arr = Array.isArray(list) ? list : [];
    const itemName = attrs['wx:for-item'] || 'item';
    const indexName = attrs['wx:for-index'] || 'index';
    return arr
      .map(function (item, index) {
        const loopScope = Object.create(scope);
        loopScope[itemName] = item;
        loopScope[indexName] = index;
        const copy = { tag: node.tag, attrs: Object.assign({}, attrs), children: node.children };
        delete copy.attrs['wx:for'];
        delete copy.attrs['wx:for-item'];
        delete copy.attrs['wx:for-index'];
        delete copy.attrs['wx:key'];
        return renderElement(copy, loopScope, ctx);
      })
      .join('');
  }

  const tag = node.tag;
  if (tag === 'block') return renderChildren(node.children, scope, ctx);

  const component = ctx.components[tag];
  if (component) {
    const props = {};
    Object.keys(attrs).forEach(function (key) {
      if (/^(bind|catch|mut-bind|capture-)/.test(key) || key.indexOf('wx:') === 0) return;
      const camel = key.replace(/-([a-z])/g, function (_, c) {
        return c.toUpperCase();
      });
      props[camel] = evalAttr(attrs[key], scope);
    });
    return component(props, renderChildren(node.children, scope, ctx), ctx);
  }

  /* ---------- 原生标签近似 ---------- */
  if (tag === 'switch') {
    const checked = !!evalAttr(attrs.checked, scope);
    return '<div class="pv-switch' + (checked ? ' pv-switch--on' : '') + '"><div class="pv-switch-knob"></div></div>';
  }
  if (tag === 'input' || tag === 'textarea') {
    const value = str(evalAttr(attrs.value, scope));
    const placeholder = str(evalAttr(attrs.placeholder, scope));
    const cls = 'pv-field ' + str(evalAttr(attrs.class, scope)) + (tag === 'textarea' ? ' pv-field--textarea' : '');
    const content = value
      ? '<span class="pv-field-value">' + escapeHTML(value) + '</span>'
      : '<span class="pv-placeholder">' + escapeHTML(placeholder) + '</span>';
    const idAttr = attrs.id !== undefined ? ' id="' + escapeAttr(evalAttr(attrs.id, scope)) + '"' : '';
    return '<div class="' + escapeAttr(cls) + '"' + idAttr + '>' + content + '</div>';
  }
  if (tag === 'picker') {
    // picker 本身无视觉，渲染其子节点（页面里通常是一个 .time-value 视图）
    return renderChildren(node.children, scope, ctx);
  }
  if (tag === 'scroll-view') {
    // 小程序 scroll-view 近似为可滚动 div：保留 class/style，并按 scroll-y 加 overflow
    const cls = str(evalAttr(attrs.class, scope));
    const styleParts = [];
    if (attrs.style !== undefined) {
      const rawStyle = str(evalAttr(attrs.style, scope));
      if (rawStyle) styleParts.push(rawStyle);
    }
    if (attrs['scroll-y'] !== undefined) {
      styleParts.push('overflow-y:auto');
      styleParts.push('-webkit-overflow-scrolling:touch');
    }
    if (attrs['scroll-x'] !== undefined) styleParts.push('overflow-x:auto');
    const styleAttr = styleParts.length ? ' style="' + escapeAttr(styleParts.join(';')) + '"' : '';
    return '<div class="' + escapeAttr(cls) + '"' + styleAttr + '>' +
      renderChildren(node.children, scope, ctx) + '</div>';
  }
  if (tag === 'image') {
    let src = str(evalAttr(attrs.src, scope));
    if (src && ctx.resolveAsset) src = ctx.resolveAsset(src);
    let html = '<img';
    if (attrs.class !== undefined) html += ' class="' + escapeAttr(evalAttr(attrs.class, scope)) + '"';
    html += ' src="' + escapeAttr(src) + '" alt=""';
    const styleParts = [];
    if (attrs.style !== undefined) {
      const rawStyle = str(evalAttr(attrs.style, scope));
      if (rawStyle) styleParts.push(rawStyle);
    }
    // 小程序 image 的 mode 用 object-fit 近似（aspectFit ≈ contain，aspectFill ≈ cover）
    const mode = str(evalAttr(attrs.mode, scope));
    if (mode === 'aspectFit') styleParts.push('object-fit:contain');
    else if (mode === 'aspectFill') styleParts.push('object-fit:cover');
    if (styleParts.length) html += ' style="' + escapeAttr(styleParts.join(';')) + '"';
    return html + '>';
  }

  const htmlTag = tag === 'text' ? 'span' : 'div';
  let open = '<' + htmlTag;
  if (attrs.id !== undefined) open += ' id="' + escapeAttr(evalAttr(attrs.id, scope)) + '"';
  if (attrs.class !== undefined) open += ' class="' + escapeAttr(evalAttr(attrs.class, scope)) + '"';
  if (attrs.style !== undefined) open += ' style="' + escapeAttr(evalAttr(attrs.style, scope)) + '"';
  open += '>';
  return open + renderChildren(node.children, scope, ctx) + '</' + htmlTag + '>';
}

function renderWXML(wxmlSource, data, ctx) {
  const tree = parseWXML(wxmlSource);
  return renderChildren(tree, data || {}, ctx || { components: {} });
}

module.exports = {
  parseWXML: parseWXML,
  renderWXML: renderWXML,
  evalAttr: evalAttr,
  escapeHTML: escapeHTML
};
