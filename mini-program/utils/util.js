/**
 * 通用工具：日期 / 数字 / 字符串 / 深拷贝 / 格式化
 * 说明：小程序基础库支持 ES6，不使用可选链等过新语法，兼容旧版开发者工具。
 */

function pad2(n) {
  return n < 10 ? '0' + n : '' + n;
}

/**
 * 格式化日期
 * @param {Date|string|number} input
 * @param {string} fmt 支持 YYYY MM DD HH mm ss
 */
function formatDate(input, fmt) {
  if (!input) return '';
  const d = input instanceof Date ? input : new Date(input);
  if (isNaN(d.getTime())) return '';
  const map = {
    YYYY: d.getFullYear(),
    MM: pad2(d.getMonth() + 1),
    DD: pad2(d.getDate()),
    HH: pad2(d.getHours()),
    mm: pad2(d.getMinutes()),
    ss: pad2(d.getSeconds())
  };
  return (fmt || 'YYYY-MM-DD').replace(/YYYY|MM|DD|HH|mm|ss/g, function (k) {
    return map[k];
  });
}

/** 今天 00:00 的 Date */
function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** 今天是 YYYY-MM-DD */
function todayStr() {
  return formatDate(new Date(), 'YYYY-MM-DD');
}

/**
 * 日期加天数（dateStr 或 Date），返回 YYYY-MM-DD
 */
function addDays(input, days) {
  const d = input instanceof Date ? new Date(input.getTime()) : new Date(input);
  if (isNaN(d.getTime())) return '';
  d.setDate(d.getDate() + days);
  return formatDate(d, 'YYYY-MM-DD');
}

/** 两个日期相差的自然天数（b - a），入参可为 YYYY-MM-DD 或 Date */
function diffDays(a, b) {
  const da = a instanceof Date ? a : new Date(a);
  const db = b instanceof Date ? b : new Date(b);
  if (isNaN(da.getTime()) || isNaN(db.getTime())) return 0;
  const sa = new Date(da.getFullYear(), da.getMonth(), da.getDate()).getTime();
  const sb = new Date(db.getFullYear(), db.getMonth(), db.getDate()).getTime();
  return Math.round((sb - sa) / 86400000);
}

const WEEKDAY_CN = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

/** 星期几（中文） */
function weekdayCN(input) {
  const d = input instanceof Date ? input : new Date(input);
  if (isNaN(d.getTime())) return '';
  return WEEKDAY_CN[d.getDay()];
}

/** 相对于今天的中文标签：今天 / 明天 / 后天 / 周X / M月D日 */
function relativeDayLabel(input) {
  const d = input instanceof Date ? input : new Date(input);
  if (isNaN(d.getTime())) return '';
  const diff = diffDays(startOfToday(), d);
  if (diff === 0) return '今天';
  if (diff === 1) return '明天';
  if (diff === 2) return '后天';
  if (diff === -1) return '昨天';
  return weekdayCN(d);
}

/** 日期间隔文本：11月10日 - 11月16日 */
function dateRangeText(start, end) {
  if (!start || !end) return '';
  const s = new Date(start);
  const e = new Date(end);
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return '';
  return (
    (s.getMonth() + 1) + '月' + s.getDate() + '日 - ' + (e.getMonth() + 1) + '月' + e.getDate() + '日'
  );
}

/** 秒数格式化为 4'10" */
function formatPace(seconds) {
  if (!seconds && seconds !== 0) return '';
  const s = Math.round(seconds);
  return Math.floor(s / 60) + "'" + pad2(s % 60) + '"';
}

/** 数值夹取 */
function clamp(value, min, max) {
  const v = Number(value);
  if (isNaN(v)) return min;
  return Math.min(max, Math.max(min, v));
}

/** 轮询取整 */
function roundTo(value, step) {
  const s = step || 1;
  return Math.round(Number(value) / s) * s;
}

/** 唯一 id（不依赖 crypto） */
function uuid(prefix) {
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 8);
  return (prefix || 'id') + '_' + t + r;
}

/** 深拷贝（数据均为 JSON 安全结构） */
function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  return JSON.parse(JSON.stringify(obj));
}

/** 安全取值：get(obj, 'a.b.c', 默认值) */
function get(obj, path, defaultValue) {
  if (!obj) return defaultValue;
  const keys = String(path).split('.');
  let cur = obj;
  for (let i = 0; i < keys.length; i++) {
    if (cur === null || cur === undefined) return defaultValue;
    cur = cur[keys[i]];
  }
  return cur === undefined ? defaultValue : cur;
}

/** 按字段分组 */
function groupBy(list, key) {
  const map = {};
  (list || []).forEach(function (item) {
    const k = typeof key === 'function' ? key(item) : item[key];
    if (!map[k]) map[k] = [];
    map[k].push(item);
  });
  return map;
}

/** 求和 */
function sum(list, key) {
  return (list || []).reduce(function (acc, item) {
    const v = key ? (typeof key === 'function' ? key(item) : item[key]) : item;
    return acc + (Number(v) || 0);
  }, 0);
}

/** 平均值（保留一位小数） */
function avg(list, key) {
  if (!list || !list.length) return 0;
  return Math.round((sum(list, key) / list.length) * 10) / 10;
}

/** 百分比（0-1 之间） */
function percent(part, total) {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}

/** 延迟 */
function sleep(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

/** 数组去重 */
function unique(arr) {
  return (arr || []).filter(function (item, index) {
    return arr.indexOf(item) === index;
  });
}

/** 是否纯对象 */
function isPlainObject(v) {
  return Object.prototype.toString.call(v) === '[object Object]';
}

/** 编号转两位 */
function pct(value) {
  const v = clamp(value, 0, 1);
  return Math.round(v * 100) + '%';
}

/** 格式化时长（分钟） */
function durationText(min) {
  const m = Number(min) || 0;
  if (m < 60) return m + ' 分钟';
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? h + ' 小时 ' + rest + ' 分钟' : h + ' 小时';
}

module.exports = {
  pad2: pad2,
  formatDate: formatDate,
  startOfToday: startOfToday,
  todayStr: todayStr,
  addDays: addDays,
  diffDays: diffDays,
  weekdayCN: weekdayCN,
  relativeDayLabel: relativeDayLabel,
  dateRangeText: dateRangeText,
  formatPace: formatPace,
  clamp: clamp,
  roundTo: roundTo,
  uuid: uuid,
  deepClone: deepClone,
  get: get,
  groupBy: groupBy,
  sum: sum,
  avg: avg,
  percent: percent,
  sleep: sleep,
  unique: unique,
  isPlainObject: isPlainObject,
  pct: pct,
  durationText: durationText,
  WEEKDAY_CN: WEEKDAY_CN
};
