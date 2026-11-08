/**
 * WXSS → CSS 转换（近似预览用）
 * - rpx → px：375pt 视口下 1rpx = 0.5px（设计稿 750rpx = 375px）
 * - page 选择器 → body（设计令牌 / 全局排版在预览页仍可继承）
 * - 安全区 env() 在无手机环境下返回 0，统一替换
 */
'use strict';

function convertWXSS(css) {
  return String(css || '')
    .replace(/(\d*\.?\d+)rpx/g, function (_, n) {
      return (parseFloat(n) * 0.5).toFixed(2) + 'px';
    })
    .replace(/env\(safe-area-inset-[a-z]+\)/g, '0px')
    .replace(/constant\(safe-area-inset-[a-z]+\)/g, '0px')
    .replace(/(^|\n)\s*page\s*\{/g, '$1body {');
}

/** 拼接 app.wxss + 页面 wxss + 组件 wxss + 预览专用样式 */
function buildCSS(parts) {
  return convertWXSS(parts.filter(Boolean).join('\n'));
}

module.exports = {
  convertWXSS: convertWXSS,
  buildCSS: buildCSS
};
