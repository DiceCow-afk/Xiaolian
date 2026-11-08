#!/usr/bin/env node
/**
 * 「校练」小程序静态校验器（QA 基线工具）
 *
 * 用法：
 *   node tools/validate-miniprogram.js            # 常规检查：ERROR 使退出码为 1；WIP（进行中）不计失败
 *   node tools/validate-miniprogram.js --strict   # 终检模式：WIP 也计为失败（页面/素材应全部就绪）
 *
 * 退出码：0 = 通过；1 = 存在 ERROR（或 --strict 下存在 WIP）；2 = 脚本自身异常
 *
 * 检查项：
 *   1. 所有 .js 通过 `node --check` 语法检查
 *   2. 所有 .json 可被 JSON.parse
 *   3. app.json：pages / tabBar / window / sitemapLocation / 资源引用
 *   4. 页面四件套（js/json/wxml/wxss）与组件四件套
 *   5. usingComponents 路径存在 + WXML 中自定义组件使用已声明
 *   6. WXML 标签闭合、wx:if/elif/else 相邻合法性、{{ }} 配平
 *   7. WXML 事件绑定（bind/catch）处理函数在对应 .js 中存在
 *   8. WXSS 花括号配平 + @import 路径存在
 *   9. require 相对路径存在、无绝对路径/裸模块、无循环依赖、页面禁止 require mock/request
 *  10. assets PNG 文件头（+ tabBar 图标 81x81）+ 规范要求的资源文件齐全
 *  11. 动作库数据完整性：demo_resource_id / demo_frames / 关键帧资源路径一致性、regression 引用等
 *  12. 页面规范抽查：导航色/标题、下拉刷新、refreshBadge、三态、hero 配色、定时器清理
 *  13. 编码约定：可选链/空值合并、页面直连 storage、console.error/warn、Page/Component 注册
 *  14. 文档与工具：spec/接口契约/smoke_test/project.config.json
 *
 * 只读脚本：不修改任何业务文件。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const MINI_ROOT = path.resolve(__dirname, '..', 'mini-program');
const REPO_ROOT = path.resolve(__dirname, '..');
const ARGS = process.argv.slice(2);
const STRICT = ARGS.indexOf('--strict') >= 0;

/* ============================== 结果收集 ============================== */

const issues = []; // { level: 'error' | 'warn' | 'wip', section, message, file, line }
const stats = { passed: 0 };
let currentSection = '';

function section(name) {
  currentSection = name;
}

function pass(n) {
  stats.passed += n === undefined ? 1 : n;
}

function add(level, message, file, line) {
  issues.push({
    level: level,
    section: currentSection,
    message: message,
    file: file ? rel(file) : '',
    line: line || 0
  });
}

function error(message, file, line) {
  add('error', message, file, line);
}

function warn(message, file, line) {
  add('warn', message, file, line);
}

function wip(message, file, line) {
  add('wip', message, file, line);
}

function check(condition, message, file, line, level) {
  if (condition) {
    pass();
    return true;
  }
  add(level || 'error', message, file, line);
  return false;
}

function rel(p) {
  if (!p) return '';
  return path.relative(REPO_ROOT, p).replace(/\\/g, '/');
}

/* ============================== 文件工具 ============================== */

function isFile(p) {
  try {
    return fs.statSync(p).isFile();
  } catch (e) {
    return false;
  }
}

function isDir(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch (e) {
    return false;
  }
}

function walk(dir, out, filter) {
  if (!isDir(dir)) return out;
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    return out;
  }
  entries
    .slice()
    .sort(function (a, b) {
      return a.name < b.name ? -1 : 1;
    })
    .forEach(function (entry) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.git') return;
        walk(full, out, filter);
      } else if (!filter || filter(full)) {
        out.push(full);
      }
    });
  return out;
}

function walkByExt(dir, ext) {
  return walk(dir, [], function (p) {
    return p.toLowerCase().endsWith('.' + ext);
  });
}

function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (e) {
    return null;
  }
}

function lineAt(text, pos) {
  if (!text) return 0;
  let line = 1;
  const end = Math.min(pos, text.length);
  for (let i = 0; i < end; i++) {
    if (text.charCodeAt(i) === 10) line += 1;
  }
  return line;
}

function firstLine(s) {
  return String(s || '')
    .split(/\r?\n/)[0]
    .trim();
}

/* ============================== 1. JS 语法 ============================== */

function checkJsSyntax() {
  section('JS 语法（node --check）');
  const files = walkByExt(MINI_ROOT, 'js').concat(walkByExt(path.join(REPO_ROOT, 'tools'), 'js'));
  files.sort();
  files.forEach(function (file) {
    try {
      execFileSync(process.execPath, ['--check', file], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe']
      });
      pass();
    } catch (e) {
      const stderr = firstLine(e.stderr) || firstLine(e.message);
      const lineMatch = String(stderr).match(/^(?:.*?):(\d+)/);
      error('JS 语法错误：' + stderr, file, lineMatch ? Number(lineMatch[1]) : 0);
    }
  });
  console.log('  JS 文件：' + files.length);
}

/* ============================== 2. JSON 可解析 ============================== */

const jsonCache = {}; // absPath -> { ok, data, text }

function checkJson() {
  section('JSON 结构');
  const files = walkByExt(MINI_ROOT, 'json').sort();
  files.forEach(function (file) {
    const text = readText(file);
    if (text === null) {
      error('JSON 文件不可读', file);
      return;
    }
    try {
      jsonCache[file] = { ok: true, data: JSON.parse(text), text: text };
      pass();
    } catch (e) {
      jsonCache[file] = { ok: false, data: null, text: text };
      const posMatch = String(e.message).match(/position\s+(\d+)/i);
      error('JSON 解析失败：' + firstLine(e.message), file, posMatch ? lineAt(text, Number(posMatch[1])) : 0);
    }
  });
  console.log('  JSON 文件：' + files.length);
}

function readJson(file) {
  if (jsonCache[file] && jsonCache[file].ok) return jsonCache[file].data;
  const text = readText(file);
  if (text === null) return null;
  try {
    const data = JSON.parse(text);
    jsonCache[file] = { ok: true, data: data, text: text };
    return data;
  } catch (e) {
    return null;
  }
}

function jsonText(file) {
  if (jsonCache[file] && jsonCache[file].text !== undefined) return jsonCache[file].text;
  return readText(file) || '';
}

/* ============================== 3. app.json ============================== */

const APP_JSON = path.join(MINI_ROOT, 'app.json');
const REQUIRED_PAGES = ['pages/constraints/constraints', 'pages/plan/plan', 'pages/action/action', 'pages/checkin/checkin', 'pages/feedback/feedback', 'pages/diet/diet'];

const pageList = []; // { pagePath, base, dir }
const assetRefs = []; // { file, line, ref, kind, required }

function checkAppJson() {
  section('app.json');
  if (!isFile(APP_JSON)) {
    error('缺少 mini-program/app.json', APP_JSON);
    return;
  }
  const app = readJson(APP_JSON);
  if (!app) {
    error('app.json 无法解析，后续页面检查跳过', APP_JSON);
    return;
  }
  const rawText = jsonText(APP_JSON);

  // pages
  if (!Array.isArray(app.pages) || app.pages.length === 0) {
    error('app.json 缺少 pages 数组或为空', APP_JSON);
  } else {
    const seen = {};
    app.pages.forEach(function (p, index) {
      const line = refLine(rawText, p);
      if (typeof p !== 'string' || !p.trim()) {
        error('pages[' + index + '] 不是合法路径字符串', APP_JSON, line);
        return;
      }
      if (p.indexOf('/') === 0) error('pages 路径不能以 / 开头：' + p, APP_JSON, line);
      if (/\.(js|json|wxml|wxss)$/.test(p)) error('pages 路径应省略扩展名：' + p, APP_JSON, line);
      if (seen[p]) error('pages 存在重复路径：' + p, APP_JSON, line);
      seen[p] = true;
      const base = path.join(MINI_ROOT, p);
      const dir = path.dirname(base);
      pageList.push({ pagePath: p, base: base, dir: dir });
    });
    pass();
    REQUIRED_PAGES.forEach(function (required) {
      if (app.pages.indexOf(required) < 0) {
        warn('app.json pages 缺少规范要求的页面：' + required, APP_JSON);
      }
    });
    if (app.pages[0] !== 'pages/constraints/constraints') {
      warn('入口页（pages[0]）应为 pages/constraints/constraints（冷启动约束入口），当前为 ' + app.pages[0], APP_JSON);
    }
    if (app.pages.length !== REQUIRED_PAGES.length) {
      warn('页面数量为 ' + app.pages.length + '，规范要求 6 个页面', APP_JSON);
    }
  }

  // window
  if (!app.window || typeof app.window !== 'object') {
    error('app.json 缺少 window 配置', APP_JSON);
  } else {
    if (app.window.navigationBarTitleText !== '校练') {
      warn('window.navigationBarTitleText 期望「校练」，当前为 ' + JSON.stringify(app.window.navigationBarTitleText), APP_JSON);
    }
    ['navigationBarBackgroundColor', 'backgroundColor'].forEach(function (key) {
      const v = app.window[key];
      if (v !== undefined && !/^#[0-9a-fA-F]{6}$/.test(String(v))) {
        error('window.' + key + ' 不是合法 #RRGGBB 颜色：' + JSON.stringify(v), APP_JSON);
      }
    });
  }

  // tabBar
  if (app.tabBar) {
    const tab = app.tabBar;
    if (!Array.isArray(tab.list) || tab.list.length < 2 || tab.list.length > 5) {
      error('tabBar.list 必须是 2-5 项', APP_JSON);
    } else {
      pass();
      const expectedOrder = ['pages/plan/plan', 'pages/checkin/checkin', 'pages/feedback/feedback', 'pages/diet/diet'];
      const expectedText = ['计划', '打卡', '反馈', '饮食'];
      tab.list.forEach(function (item, i) {
        if (!item || typeof item !== 'object') {
          error('tabBar.list[' + i + '] 不是对象', APP_JSON);
          return;
        }
        if (!item.pagePath) {
          error('tabBar.list[' + i + '] 缺少 pagePath', APP_JSON);
        } else {
          if (!Array.isArray(app.pages) || app.pages.indexOf(item.pagePath) < 0) {
            error('tabBar 页面不在 pages 中：' + item.pagePath, APP_JSON);
          }
          if (item.pagePath !== expectedOrder[i]) {
            warn('tabBar.list[' + i + '].pagePath 期望 ' + expectedOrder[i] + '，当前 ' + item.pagePath, APP_JSON);
          }
        }
        if (item.text !== expectedText[i]) {
          warn('tabBar.list[' + i + '].text 期望「' + expectedText[i] + '」，当前「' + item.text + '」', APP_JSON);
        }
        ['iconPath', 'selectedIconPath'].forEach(function (key) {
          if (!item[key]) {
            error('tabBar.list[' + i + '] 缺少 ' + key, APP_JSON);
            return;
          }
          assetRefs.push({
            file: APP_JSON,
            line: refLine(rawText, item[key]),
            ref: item[key],
            kind: 'tabBar 图标',
            required: true,
            isTabIcon: true
          });
        });
      });
      // 禁止 tabBar 使用网络图标（小程序限制）
      tab.list.forEach(function (item, i) {
        ['iconPath', 'selectedIconPath'].forEach(function (key) {
          if (item && item[key] && /^(https?:)?\/\//.test(item[key])) {
            error('tabBar.list[' + i + '].' + key + ' 不允许使用网络图片', APP_JSON);
          }
        });
      });
    }
  } else {
    warn('app.json 未配置 tabBar（规范要求 4 个 tab 页）', APP_JSON);
  }

  // sitemapLocation
  if (app.sitemapLocation) {
    const sitemap = path.join(MINI_ROOT, app.sitemapLocation);
    check(isFile(sitemap), 'app.json sitemapLocation 指向的文件不存在：' + app.sitemapLocation, APP_JSON, refLine(rawText, app.sitemapLocation));
  }
}

function refLine(rawText, needle) {
  if (!rawText || !needle) return 0;
  const idx = rawText.indexOf(String(needle));
  if (idx < 0) return 0;
  return lineAt(rawText, idx);
}

/* ============================== 4. 页面/组件四件套 ============================== */

function checkPageFourPiece() {
  section('页面四件套');
  const exts = ['js', 'json', 'wxml', 'wxss'];
  pageList.forEach(function (page) {
    const missing = [];
    exts.forEach(function (ext) {
      if (!isFile(page.base + '.' + ext)) missing.push(ext);
    });
    if (missing.length === 0) {
      pass();
      return;
    }
    if (missing.length === 4) {
      wip('页面暂缺（页面任务进行中）：' + page.pagePath + '.*', null);
      return;
    }
    wip('页面四件套未齐（缺 ' + missing.join('/') + '）：' + page.pagePath + '.*', null);
  });

  // 组件四件套：components/<name>/index.{js,json,wxml,wxss}
  const compRoot = path.join(MINI_ROOT, 'components');
  const compDirs = isDir(compRoot)
    ? fs
        .readdirSync(compRoot, { withFileTypes: true })
        .filter(function (d) {
          return d.isDirectory();
        })
        .map(function (d) {
          return d.name;
        })
        .sort()
    : [];
  section('组件四件套');
  compDirs.forEach(function (name) {
    const base = path.join(compRoot, name, 'index');
    const missing = exts.filter(function (ext) {
      return !isFile(base + '.' + ext);
    });
    if (missing.length === 0) {
      pass();
      const cfg = readJson(base + '.json');
      if (!cfg) {
        error('组件 json 无法解析', base + '.json');
      } else if (cfg.component !== true) {
        warn('组件 json 缺少 "component": true', base + '.json');
      }
    } else {
      error('组件四件套不全（缺 ' + missing.join('/') + '）：components/' + name + '/index.*', null);
    }
  });
  if (compDirs.length === 8) pass();
  else warn('公共组件数量为 ' + compDirs.length + '，规范要求 8 个', compRoot);
}

/* ============================== 5. WXML 解析 ============================== */

const BUILTIN_TAGS = (
  'view,text,image,button,input,textarea,scroll-view,swiper,swiper-item,navigator,picker,' +
  'picker-view,picker-view-column,checkbox,checkbox-group,radio,radio-group,switch,slider,icon,' +
  'progress,rich-text,cover-view,cover-image,video,map,canvas,camera,audio,live-player,live-pusher,' +
  'web-view,movable-view,movable-area,open-data,functional-page-navigator,official-account,ad,' +
  'page-container,share-element,match-media,slot,block,import,include,template,wxs,form,label,' +
  'keyboard-accessory,editor,navigator'
)
  .split(',')
  .reduce(function (map, t) {
    map[t] = true;
    return map;
  }, {});

function parseAttrs(rawAttrs, basePos, text) {
  const attrs = {};
  const rowRe = /([^\s=/>]+)(?:\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let m;
  while ((m = rowRe.exec(rawAttrs)) !== null) {
    const name = m[1];
    let value = '';
    if (m[2] !== undefined) value = m[3] !== undefined ? m[3] : m[4] !== undefined ? m[4] : m[5] || '';
    const pos = basePos + m.index;
    attrs[name] = { value: value, line: lineAt(text, pos) };
  }
  return attrs;
}

/**
 * WXML 标签扫描：返回节点树、标签闭合问题、事件绑定、图片引用
 */
function tokenizeWxml(text, file) {
  const problems = [];
  const root = { name: '#root', line: 0, attrs: {}, children: [] };
  const stack = [root];
  const nodes = [];
  let i = 0;
  const n = text.length;

  while (i < n) {
    if (text.startsWith('<!--', i)) {
      const end = text.indexOf('-->', i + 4);
      if (end < 0) {
        problems.push({ message: 'WXML 注释未闭合', line: lineAt(text, i) });
        break;
      }
      i = end + 3;
      continue;
    }
    const ch = text[i];
    if (ch === '<' && /[A-Za-z/]/.test(text[i + 1] || '')) {
      const start = i;
      const line = lineAt(text, start);
      let j = i + 1;
      let closing = false;
      if (text[j] === '/') {
        closing = true;
        j += 1;
      }
      const nameMatch = /^[A-Za-z][\w-]*/.exec(text.slice(j));
      if (!nameMatch) {
        i += 1;
        continue;
      }
      const tagName = nameMatch[0];
      j += tagName.length;

      // 找到标签结束的 '>'（跳过引号内的内容）
      let quote = null;
      let k = j;
      for (; k < n; k++) {
        const c = text[k];
        if (quote) {
          if (c === quote) quote = null;
        } else if (c === '"' || c === "'") {
          quote = c;
        } else if (c === '>') {
          break;
        }
      }
      if (k >= n) {
        problems.push({ message: '标签未闭合：<' + tagName + '> 缺少 >', line: line });
        break;
      }
      const rawAttrs = text.slice(j, k);
      const selfClosing = /\/\s*$/.test(rawAttrs);
      const attrs = parseAttrs(rawAttrs, j, text);

      if (closing) {
        let idx = stack.length - 1;
        while (idx > 0 && stack[idx].name !== tagName) idx -= 1;
        if (idx <= 0) {
          problems.push({ message: '多余的结束标签：</' + tagName + '>', line: line });
        } else {
          while (stack.length - 1 > idx) {
            const unclosed = stack[stack.length - 1];
            problems.push({
              message: '标签未闭合：<' + unclosed.name + '>（开始于第 ' + unclosed.line + ' 行）',
              line: line
            });
            stack.pop();
          }
          stack.pop();
        }
      } else {
        const node = {
          name: tagName,
          line: line,
          attrs: attrs,
          children: [],
          hasIf: !!attrs['wx:if'],
          hasElif: attrs['wx:elif'] !== undefined,
          hasElse: attrs['wx:else'] !== undefined
        };
        stack[stack.length - 1].children.push(node);
        nodes.push(node);
        if (!selfClosing) {
          if (tagName === 'wxs') {
            // wxs 内部是 JS，可能包含 < 比较符，直接跳过到 </wxs>
            const close = text.indexOf('</wxs>', k + 1);
            if (close >= 0) {
              i = close + 6;
              continue;
            }
          }
          stack.push(node);
        }
      }
      i = k + 1;
      continue;
    }
    i += 1;
  }

  while (stack.length > 1) {
    const unclosed = stack.pop();
    problems.push({
      message: '标签未闭合：<' + unclosed.name + '>（开始于第 ' + unclosed.line + ' 行）',
      line: unclosed.line
    });
  }

  return { problems: problems, root: root, nodes: nodes };
}

function collectWxmlInfo(node, out) {
  (node.children || []).forEach(function (child) {
    out.nodes.push(child);
    collectWxmlInfo(child, out);
  });
}

function checkWxml() {
  section('WXML 结构 / 事件 / 图片引用');
  const wxmlFiles = walkByExt(MINI_ROOT, 'wxml').sort();
  wxmlFiles.forEach(function (file) {
    const text = readText(file);
    if (text === null) {
      error('WXML 文件不可读', file);
      return;
    }
    const parsed = tokenizeWxml(text, file);
    parsed.problems.forEach(function (p) {
      error(p.message, file, p.line);
    });
    if (!parsed.problems.length) pass();

    // {{ }} 配平
    const openCount = (text.match(/\{\{/g) || []).length;
    const closeCount = (text.match(/\}\}/g) || []).length;
    check(openCount === closeCount, 'WXML 插值 {{ }} 不配平（{{ ' + openCount + ' 个，}} ' + closeCount + ' 个）', file);

    // wx:if / wx:elif / wx:else 相邻性
    (function checkConditional(node) {
      const children = node.children || [];
      for (let i = 0; i < children.length; i++) {
        const child = children[i];
        if (child.hasElse) {
          const prev = children[i - 1];
          if (!prev || (!prev.hasIf && !prev.hasElif)) {
            error('wx:else 前一个兄弟节点不是 wx:if/wx:elif', file, child.line);
          }
        }
        if (child.hasElif) {
          const prev = children[i - 1];
          if (!prev || (!prev.hasIf && !prev.hasElif)) {
            error('wx:elif 前一个兄弟节点不是 wx:if/wx:elif', file, child.line);
          }
        }
        checkConditional(child);
      }
    })(parsed.root);

    // wx:for 建议带 wx:key
    parsed.nodes.forEach(function (node) {
      if (node.attrs['wx:for'] && !node.attrs['wx:key']) {
        warn('wx:for 缺少 wx:key（列表渲染性能/状态稳定性建议补上）', file, node.line);
      }
    });

    // 自定义组件使用是否声明
    const jsonFile = file.replace(/\.wxml$/, '.json');
    const cfg = readJson(jsonFile) || {};
    const declared = cfg.usingComponents && typeof cfg.usingComponents === 'object' ? cfg.usingComponents : {};
    const declaredNames = Object.keys(declared).reduce(function (m, k) {
      m[k.toLowerCase()] = true;
      return m;
    }, {});
    parsed.nodes.forEach(function (node) {
      const name = node.name;
      if (BUILTIN_TAGS[name]) return;
      if (name.indexOf('-') < 0) return; // 非连字符标签视为内置/自定义标签扩展，不在此校验
      if (!declaredNames[name]) {
        error('WXML 使用了未在 usingComponents 声明的组件：<' + name + '>', file, node.line);
      }
    });

    // 事件绑定 -> 对应 js 方法
    const jsFile = file.replace(/\.wxml$/, '.js');
    if (isFile(jsFile)) {
      const methods = extractJsMethods(readText(jsFile) || '');
      parsed.nodes.forEach(function (node) {
        Object.keys(node.attrs).forEach(function (attrName) {
          const m = /^(?:capture-bind|capture-catch|mut-bind|bind|catch):?([A-Za-z][\w-]*)$/.exec(attrName);
          if (!m) return;
          const handler = String(node.attrs[attrName].value || '').trim();
          if (!handler) {
            error('事件绑定 ' + attrName + ' 的值为空', file, node.attrs[attrName].line);
            return;
          }
          if (handler.indexOf('{{') >= 0) {
            warn('事件绑定 ' + attrName + ' 使用动态处理函数（' + handler + '），静态校验跳过', file, node.attrs[attrName].line);
            return;
          }
          if (/[^\w$.]/.test(handler)) {
            error('事件处理函数应为纯方法名：' + attrName + '="' + handler + '"', file, node.attrs[attrName].line);
            return;
          }
          if (!methods[handler]) {
            error('事件处理函数在 ' + path.basename(jsFile) + ' 中不存在：' + handler + '（' + attrName + '）', file, node.attrs[attrName].line);
          } else {
            pass();
          }
        });
      });
    }

    // 静态图片引用
    parsed.nodes.forEach(function (node) {
      if (node.name !== 'image' && node.name !== 'cover-image') return;
      const src = node.attrs.src ? node.attrs.src.value : '';
      if (!src || src.indexOf('{{') >= 0 || /^(https?:)?\/\//.test(src) || src.indexOf('data:') === 0) return;
      assetRefs.push({
        file: file,
        line: node.attrs.src.line,
        ref: src,
        kind: 'WXML 图片',
        required: true
      });
      pass();
    });
  });
  console.log('  WXML 文件：' + wxmlFiles.length);
}

/* -------------------- JS 方法名提取（去注释/字符串） -------------------- */

function stripJsCommentsAndStrings(text) {
  let out = '';
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    const next = text[i + 1];
    if (c === '/' && next === '/') {
      const end = text.indexOf('\n', i);
      i = end < 0 ? n : end;
      continue;
    }
    if (c === '/' && next === '*') {
      const end = text.indexOf('*/', i + 2);
      i = end < 0 ? n : end + 2;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      const quote = c;
      i += 1;
      while (i < n) {
        if (text[i] === '\\') {
          i += 2;
          continue;
        }
        if (text[i] === quote) {
          i += 1;
          break;
        }
        i += 1;
      }
      out += ' ';
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

const jsMethodCache = {};

function extractJsMethods(jsText) {
  const key = jsText;
  if (jsMethodCache[key]) return jsMethodCache[key];
  const clean = stripJsCommentsAndStrings(jsText);
  const methods = {};
  // 注意：不能用 [^)]* 跨行匹配，否则会把后续方法吞进上一次匹配（如 Component({... onTap() {...})）
  const patterns = [
    /^[ \t]*(?:async\s+)?([A-Za-z_$][\w$]*)[ \t]*\([^)\n]*\)[ \t]*\{/gm,
    /^[ \t]*([A-Za-z_$][\w$]*)[ \t]*:[ \t]*(?:async\s+)?function\b/gm,
    /^[ \t]*([A-Za-z_$][\w$]*)[ \t]*:[ \t]*(?:async\s*)?\([^)\n]*\)[ \t]*=>/gm,
    /^[ \t]*([A-Za-z_$][\w$]*)[ \t]*:[ \t]*[A-Za-z_$][\w$]*[ \t]*=>/gm
  ];
  patterns.forEach(function (re) {
    let m;
    while ((m = re.exec(clean)) !== null) {
      methods[m[1]] = true;
    }
  });
  jsMethodCache[key] = methods;
  return methods;
}

/* ============================== 6. WXSS ============================== */

function checkWxss() {
  section('WXSS 结构');
  const files = walkByExt(MINI_ROOT, 'wxss').sort();
  files.forEach(function (file) {
    const text = readText(file);
    if (text === null) {
      error('WXSS 文件不可读', file);
      return;
    }
    // 去注释 + 去字符串后统计括号
    let clean = '';
    let i = 0;
    const n = text.length;
    let commentLine = 0;
    while (i < n) {
      const c = text[i];
      const next = text[i + 1];
      if (c === '/' && next === '*') {
        commentLine = lineAt(text, i);
        const end = text.indexOf('*/', i + 2);
        if (end < 0) {
          error('WXSS 注释未闭合', file, commentLine);
          i = n;
          break;
        }
        i = end + 2;
        continue;
      }
      if (c === '"' || c === "'") {
        const quote = c;
        i += 1;
        while (i < n) {
          if (text[i] === '\\') {
            i += 2;
            continue;
          }
          if (text[i] === quote) {
            i += 1;
            break;
          }
          i += 1;
        }
        clean += '""';
        continue;
      }
      clean += c;
      i += 1;
    }
    const stack = [];
    let okBrace = true;
    for (let idx = 0; idx < clean.length; idx++) {
      const c = clean[idx];
      if (c === '{') {
        stack.push(lineAt(text, idx));
      } else if (c === '}') {
        if (!stack.length) {
          error('WXSS 出现多余的 }', file, lineAt(text, idx));
          okBrace = false;
        } else {
          stack.pop();
        }
      }
    }
    if (stack.length) {
      error('WXSS 花括号未配平（有 ' + stack.length + ' 个 { 未闭合，首个在第 ' + stack[0] + ' 行）', file, stack[0]);
      okBrace = false;
    }
    if (okBrace) pass();

    // @import 路径
    const importRe = /@import\s+['"]([^'"]+)['"]/g;
    let m;
    while ((m = importRe.exec(clean)) !== null) {
      const target = m[1];
      if (/^(https?:)?\/\//.test(target)) continue;
      const abs = target.indexOf('/') === 0
        ? path.join(MINI_ROOT, target.slice(1))
        : path.resolve(path.dirname(file), target);
      const withExt = path.extname(abs) ? abs : abs + '.wxss';
      check(isFile(withExt), 'WXSS @import 目标不存在：' + target, file, lineAt(text, m.index));
    }
  });
  console.log('  WXSS 文件：' + files.length);
}

/* ============================== 7. require 依赖 ============================== */

function resolveRequire(fromFile, spec) {
  if (!spec) return { error: 'require 路径为空' };
  if (spec.indexOf('/') === 0) {
    return { error: '小程序不支持绝对路径 require：' + spec };
  }
  if (spec.indexOf('.') !== 0) {
    return { error: '存在裸模块 require（不支持 npm）：' + spec };
  }
  let abs = path.resolve(path.dirname(fromFile), spec);
  if (!path.extname(abs)) abs += '.js';
  return { abs: abs };
}

function checkRequires() {
  section('require 依赖');
  const files = walkByExt(MINI_ROOT, 'js').sort();
  const graph = {};
  const requireRe = /require\s*\(\s*(['"])([^'"]+)\1\s*\)/g;

  files.forEach(function (file) {
    const text = readText(file) || '';
    graph[file] = [];
    let m;
    while ((m = requireRe.exec(text)) !== null) {
      const spec = m[2];
      const line = lineAt(text, m.index);
      const resolved = resolveRequire(file, spec);
      if (resolved.error) {
        error(resolved.error, file, line);
        continue;
      }
      const target = resolved.abs;
      if (!isFile(target)) {
        error('require 目标文件不存在：' + spec + '（解析为 ' + rel(target) + '）', file, line);
        continue;
      }
      pass();
      graph[file].push(target);

      // 页面禁止直接 require mock/request（规范第 2 节）
      if (file.indexOf(path.join(MINI_ROOT, 'pages') + path.sep) === 0) {
        const relTarget = path.relative(MINI_ROOT, target).replace(/\\/g, '/');
        if (relTarget === 'utils/mock.js' || relTarget === 'utils/request.js') {
          error('页面禁止直接 require ' + relTarget + '（应通过 utils/api.js）', file, line);
        }
      }
    }
    // 模板字符串 / 动态 require 提示
    if (/require\s*\(\s*`/.test(text)) {
      warn('存在模板字符串形式的动态 require，无法静态校验', file);
    }
  });

  // 循环依赖检测（DFS）
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = {};
  const stack = [];
  let reportedCycles = 0;

  function dfs(node) {
    color[node] = GRAY;
    stack.push(node);
    const deps = graph[node] || [];
    for (let i = 0; i < deps.length; i++) {
      const dep = deps[i];
      if (color[dep] === GRAY) {
        const startIdx = stack.indexOf(dep);
        const cycle = stack.slice(startIdx).concat([dep]).map(function (p) {
          return rel(p);
        });
        error('存在循环依赖：' + cycle.join(' -> '), node);
        reportedCycles += 1;
        if (reportedCycles >= 10) return;
      } else if (!color[dep]) {
        dfs(dep);
      }
    }
    stack.pop();
    color[node] = BLACK;
  }

  files.forEach(function (file) {
    if (!color[file]) dfs(file);
  });
  if (!reportedCycles) pass();
  console.log('  JS 模块：' + files.length);
}

/* ============================== 8. assets ============================== */

function pngInfo(file) {
  let buf;
  try {
    buf = fs.readFileSync(file);
  } catch (e) {
    return { ok: false, reason: '文件不可读' };
  }
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (buf.length < 24) return { ok: false, reason: '文件过小（' + buf.length + ' 字节）' };
  for (let i = 0; i < sig.length; i++) {
    if (buf[i] !== sig[i]) return { ok: false, reason: 'PNG 文件头不符' };
  }
  const ihdr = buf.toString('ascii', 12, 16);
  if (ihdr !== 'IHDR') return { ok: false, reason: '缺少 IHDR 块' };
  return { ok: true, width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function resolveAssetRef(ref) {
  if (!ref) return null;
  if (/^(https?:)?\/\//.test(ref) || ref.indexOf('data:') === 0) return null;
  if (ref.indexOf('/') === 0) return path.join(MINI_ROOT, ref.slice(1));
  return null; // 相对路径引用暂按相对于引用文件处理，这里只处理绝对 /assets 路径与 app.json 路径
}

function checkAssets() {
  section('资源文件');
  const assetsDir = path.join(MINI_ROOT, 'assets');
  const assetsExist = isDir(assetsDir);
  if (!assetsExist) {
    wip('assets/ 目录尚未生成（素材任务进行中）', assetsDir);
    return;
  }

  // 全量 PNG 文件头校验
  const pngFiles = walkByExt(assetsDir, 'png').sort();
  const pngMap = {};
  pngFiles.forEach(function (file) {
    const info = pngInfo(file);
    if (!info.ok) {
      error('PNG 文件无效：' + info.reason, file);
      return;
    }
    pass();
    pngMap[path.relative(assetsDir, file).replace(/\\/g, '/')] = info;
  });

  // app.json / WXML 引用的静态资源
  assetRefs.forEach(function (item) {
    const refPath = item.ref.indexOf('/') === 0 ? item.ref : '/' + item.ref;
    let abs = refPath.indexOf('/') === 0 ? path.join(MINI_ROOT, refPath.slice(1)) : item.ref;
    if (item.kind === 'WXML 图片' && item.ref.indexOf('/') !== 0) {
      abs = path.resolve(path.dirname(item.file), item.ref);
    }
    if (!isFile(abs)) {
      error(item.kind + '引用的文件不存在：' + item.ref, item.file, item.line);
      return;
    }
    pass();
    if (abs.toLowerCase().endsWith('.png')) {
      const info = pngInfo(abs);
      if (!info.ok) {
        error(item.kind + '引用的 PNG 无效：' + info.reason, item.file, item.line);
        return;
      }
      if (item.isTabIcon && (info.width !== 81 || info.height !== 81)) {
        warn('tabBar 图标建议 81x81，当前 ' + info.width + 'x' + info.height + '：' + item.ref, item.file, item.line);
      }
    }
  });

  // 规范要求的资源清单
  const expected = [
    'assets/images/share-cover.png',
    'assets/demo/placeholder.png'
  ];
  ['tab-plan', 'tab-plan-active', 'tab-checkin', 'tab-checkin-active', 'tab-feedback', 'tab-feedback-active', 'tab-diet', 'tab-diet-active'].forEach(function (name) {
    expected.push('assets/icons/' + name + '.png');
  });

  // 动作库 demo 帧资源（与 data/actions.js 一致性）
  let demoActions = [];
  try {
    const actionsMod = require(path.join(MINI_ROOT, 'data', 'actions.js'));
    demoActions = actionsMod.ACTIONS.filter(function (a) {
      return Number(a.demo_frames) > 0;
    });
  } catch (e) {
    error('无法加载 data/actions.js 以校验关键帧资源：' + firstLine(e.message), path.join(MINI_ROOT, 'data', 'actions.js'));
  }
  demoActions.forEach(function (action) {
    const frames = Number(action.demo_frames);
    for (let i = 1; i <= frames; i++) {
      expected.push('assets/demo/' + action.action_id + '/frame-' + i + '.png');
    }
  });

  expected.forEach(function (relPath) {
    const abs = path.join(MINI_ROOT, relPath);
    if (!isFile(abs)) {
      error('规范要求的资源文件缺失：' + relPath, abs);
    } else {
      pass();
    }
  });
  console.log('  PNG 文件：' + pngFiles.length + '，资源引用：' + assetRefs.length);
}

/* ============================== 9. usingComponents ============================== */

function checkUsingComponents() {
  section('usingComponents');
  const jsonFiles = walkByExt(MINI_ROOT, 'json').sort();
  jsonFiles.forEach(function (file) {
    const cfg = readJson(file);
    if (!cfg || !cfg.usingComponents) return;
    if (typeof cfg.usingComponents !== 'object') {
      error('usingComponents 必须是对象', file);
      return;
    }
    Object.keys(cfg.usingComponents).forEach(function (name) {
      const target = cfg.usingComponents[name];
      if (!/^[a-z][a-z0-9-]*$/.test(name)) {
        warn('组件标签名建议使用小写连字符：' + name, file);
      }
      if (typeof target !== 'string' || !target) {
        error('usingComponents["' + name + '"] 路径为空', file);
        return;
      }
      if (target.indexOf('plugin://') === 0) {
        warn('usingComponents["' + name + '"] 使用了插件组件（' + target + '），需确认插件已配置', file);
        return;
      }
      // usingComponents 允许相对路径，也允许以 / 开头的项目根绝对路径
      const abs = target.indexOf('/') === 0
        ? path.join(MINI_ROOT, target.slice(1))
        : path.resolve(path.dirname(file), target);
      const missing = [];
      ['js', 'json', 'wxml'].forEach(function (ext) {
        if (!isFile(abs + '.' + ext)) missing.push(ext);
      });
      if (missing.length) {
        error('usingComponents["' + name + '"] 指向的组件文件缺失（缺 ' + missing.join('/') + '）：' + target, file);
      } else {
        pass();
      }
    });
  });
}

/* ============================== 10. 数据资产 ============================== */

const VALID_PATTERNS = ['squat', 'hinge', 'lunge', 'push', 'pull', 'core', 'cardio', 'jump', 'mobility'];

function checkDataAssets() {
  section('数据资产');
  const req = function (relPath) {
    return require(path.join(MINI_ROOT, relPath));
  };
  let actionsMod, options, standards, rules, foods, config;
  try {
    actionsMod = req('data/actions.js');
    options = req('data/options.js');
    standards = req('data/testStandards.js');
    rules = req('data/rules.js');
    foods = req('data/foods.js');
    config = req('utils/config.js');
  } catch (e) {
    error('数据模块加载失败：' + firstLine(e.message));
    return;
  }

  /* ---- 动作库 ---- */
  const ACTIONS = actionsMod.ACTIONS || [];
  const actionMap = {};
  check(ACTIONS.length === 35, '动作库数量应为 35，当前 ' + ACTIONS.length, path.join(MINI_ROOT, 'data/actions.js'));
  const dimKeys = (standards.ABILITY_DIMENSIONS || []).reduce(function (m, d) {
    m[d.key] = true;
    return m;
  }, {});
  const equipmentValues = options.EQUIPMENT_OPTIONS.map(function (o) {
    return o.value;
  });
  const spaceValues = options.SPACE_OPTIONS.map(function (o) {
    return o.value;
  });
  const limitValues = options.BODY_LIMIT_OPTIONS.map(function (o) {
    return o.value;
  });
  const DATA_FILE = path.join(MINI_ROOT, 'data/actions.js');

  ACTIONS.forEach(function (a, index) {
    const label = '动作[' + (a.action_id || '#' + index) + ']';
    if (!a.action_id || typeof a.action_id !== 'string') {
      error(label + ' 缺少 action_id', DATA_FILE);
      return;
    }
    if (actionMap[a.action_id]) error('动作 action_id 重复：' + a.action_id, DATA_FILE);
    actionMap[a.action_id] = a;

    if (!a.name) error(label + ' 缺少 name', DATA_FILE);
    if (VALID_PATTERNS.indexOf(a.pattern) < 0) error(label + ' pattern 非法：' + a.pattern, DATA_FILE);
    if (!Array.isArray(a.ability_dimensions) || !a.ability_dimensions.length) {
      error(label + ' 缺少 ability_dimensions', DATA_FILE);
    } else {
      const weightSum = a.ability_dimensions.reduce(function (s, d) {
        if (!dimKeys[d.key]) error(label + ' 引用了未知能力维度：' + d.key, DATA_FILE);
        if (!(Number(d.weight) > 0)) error(label + ' 维度权重非法：' + d.key + '=' + d.weight, DATA_FILE);
        return s + (Number(d.weight) || 0);
      }, 0);
      if (Math.abs(weightSum - 1) > 0.05) warn(label + ' ability_dimensions 权重和 ' + weightSum.toFixed(2) + '，期望 1', DATA_FILE);
    }
    if (!Array.isArray(a.equipment) || !a.equipment.length) {
      error(label + ' 缺少 equipment', DATA_FILE);
    } else {
      a.equipment.forEach(function (e) {
        if (equipmentValues.indexOf(e) < 0) error(label + ' equipment 取值非法：' + e, DATA_FILE);
      });
    }
    if (!Array.isArray(a.space) || !a.space.length) {
      error(label + ' 缺少 space', DATA_FILE);
    } else {
      a.space.forEach(function (s) {
        if (spaceValues.indexOf(s) < 0) error(label + ' space 取值非法：' + s, DATA_FILE);
      });
    }
    if (!(a.capability_level >= 1 && a.capability_level <= 3)) {
      error(label + ' capability_level 应为 1-3，当前 ' + a.capability_level, DATA_FILE);
    }
    if (!Array.isArray(a.contraindications)) {
      error(label + ' 缺少 contraindications 数组', DATA_FILE);
    } else {
      a.contraindications.forEach(function (c) {
        if (limitValues.indexOf(c) < 0 || c === 'none') error(label + ' contraindications 取值非法：' + c, DATA_FILE);
      });
    }
    if (!a.sets_template || !a.sets_template.sets || !a.sets_template.reps || !a.sets_template.unit) {
      error(label + ' sets_template 不完整', DATA_FILE);
    }
    ['key_points', 'steps', 'common_errors', 'correct_vs_wrong'].forEach(function (field) {
      if (!Array.isArray(a[field]) || !a[field].length) warn(label + ' 缺少教学字段 ' + field + '（动作页内容会为空）', DATA_FILE);
    });
    if (!a.breathing) warn(label + ' 缺少 breathing（动作页呼吸提示为空）', DATA_FILE);
    if (!a.safety_note) warn(label + ' 缺少 safety_note', DATA_FILE);
    if (a.regression_id) {
      if (a.regression_id === a.action_id) error(label + ' regression_id 指向自身', DATA_FILE);
    }
    if (a.progression_id && a.progression_id === a.action_id) {
      error(label + ' progression_id 指向自身', DATA_FILE);
    }
    if (a.demo_frames !== undefined && (Number(a.demo_frames) < 0 || Number(a.demo_frames) % 1 !== 0)) {
      error(label + ' demo_frames 应为非负整数：' + a.demo_frames, DATA_FILE);
    }
  });

  // regression / progression 引用存在性
  ACTIONS.forEach(function (a) {
    ['regression_id', 'progression_id'].forEach(function (field) {
      const target = a[field];
      if (target && !actionMap[target]) {
        error('动作[' + a.action_id + '] ' + field + ' 指向不存在的动作：' + target, DATA_FILE);
      }
    });
  });

  /* ---- demo 示范资源一致性 ---- */
  const demoActionIds = ACTIONS.filter(function (a) {
    return Number(a.demo_frames) > 0;
  })
    .map(function (a) {
      return a.action_id;
    })
    .sort();
  const declaredDemo = (actionsMod.DEMO_FRAME_ACTIONS || []).slice().sort();
  check(
    demoActionIds.join(',') === declaredDemo.join(','),
    'DEMO_FRAME_ACTIONS 与 demo_frames>0 的动作不一致：声明 [' + declaredDemo.join(',') + ']，实际 [' + demoActionIds.join(',') + ']',
    DATA_FILE
  );
  ACTIONS.forEach(function (a) {
    const frames = Number(a.demo_frames) || 0;
    if (frames > 0) {
      const expectedResource = 'demo.' + a.action_id;
      if (a.demo_resource_id !== expectedResource) {
        error(
          '动作[' + a.action_id + '] demo_resource_id 与关键帧目录不一致：期望 "' + expectedResource + '"，实际 ' + JSON.stringify(a.demo_resource_id),
          DATA_FILE
        );
      }
      if (frames !== 4) {
        warn('动作[' + a.action_id + '] demo_frames 期望 4 帧，当前 ' + frames, DATA_FILE);
      }
    } else if (a.demo_resource_id) {
      warn('动作[' + a.action_id + '] 无关键帧却配置了 demo_resource_id=' + a.demo_resource_id, DATA_FILE);
    }
  });

  /* ---- 体测标准 ---- */
  const STANDARDS_FILE = path.join(MINI_ROOT, 'data/testStandards.js');
  const events = standards.EVENTS || [];
  check(events.length === 6, '体测项目应为 6 项，当前 ' + events.length, STANDARDS_FILE);
  const eventIds = options.EVENT_OPTIONS.map(function (o) {
    return o.value;
  });
  events.forEach(function (ev) {
    const label = '体测项目[' + ev.event_id + ']';
    if (!ev.weight || ev.weight <= 0) error(label + ' weight 非法', STANDARDS_FILE);
    if (!ev.tiers || ev.tiers.length !== 4) error(label + ' 档位应为 4 档', STANDARDS_FILE);
    if (ev.tiers) {
      const tierKeys = ev.tiers.map(function (t) {
        return t.key;
      });
      ['fail', 'pass', 'good', 'excellent'].forEach(function (k) {
        if (tierKeys.indexOf(k) < 0) error(label + ' 缺少档位 ' + k, STANDARDS_FILE);
      });
      for (let i = 1; i < ev.tiers.length; i++) {
        if (ev.tiers[i].score <= ev.tiers[i - 1].score) {
          error(label + ' 档位分数未递增', STANDARDS_FILE);
        }
      }
      ev.tiers.forEach(function (t) {
        if (!t.threshold) error(label + ' 档位 ' + t.key + ' 缺少 threshold 文案', STANDARDS_FILE);
      });
    }
    if (!ev.dimensions || !ev.dimensions.length) {
      error(label + ' 缺少 dimensions', STANDARDS_FILE);
    } else {
      const sum = ev.dimensions.reduce(function (s, d) {
        if (!dimKeys[d.key]) error(label + ' 引用未知维度：' + d.key, STANDARDS_FILE);
        return s + (Number(d.weight) || 0);
      }, 0);
      if (Math.abs(sum - 1) > 0.05) warn(label + ' dimensions 权重和 ' + sum.toFixed(2) + '，期望 1', STANDARDS_FILE);
    }
    if (eventIds.indexOf(ev.event_id) < 0) {
      warn(label + ' 未出现在 options.EVENT_OPTIONS 中', STANDARDS_FILE);
    }
  });
  eventIds.forEach(function (id) {
    if (!standards.getEvent(id)) error('options.EVENT_OPTIONS 中的项目在体测标准表缺失：' + id, path.join(MINI_ROOT, 'data/options.js'));
  });

  /* ---- 规则表 ---- */
  const RULES_FILE = path.join(MINI_ROOT, 'data/rules.js');
  const adj = rules.WEEKLY_ADJUSTMENT_TABLE;
  if (!adj || !Array.isArray(adj.rules)) {
    error('WEEKLY_ADJUSTMENT_TABLE.rules 缺失', RULES_FILE);
  } else {
    const ruleIds = adj.rules.map(function (r) {
      return r.rule_id;
    });
    ['ADJ-01', 'ADJ-02', 'ADJ-03', 'ADJ-04', 'ADJ-05', 'ADJ-06'].forEach(function (id) {
      if (ruleIds.indexOf(id) < 0) error('周反馈规则缺少 ' + id, RULES_FILE);
    });
    adj.rules.forEach(function (r) {
      if (['progress', 'reduce', 'rest', 'upgrade'].indexOf(r.type) < 0) {
        error('规则 ' + r.rule_id + ' 的 type 非法：' + r.type, RULES_FILE);
      }
      if (!adj.adjustments[r.next_week_action]) {
        error('规则 ' + r.rule_id + ' 的 next_week_action 缺少 adjustments 配置：' + r.next_week_action, RULES_FILE);
      }
    });
  }
  if (!rules.DIET_RULE_TABLE || !rules.DIET_RULE_TABLE.disclaimer) {
    error('DIET_RULE_TABLE.disclaimer 缺失', RULES_FILE);
  } else {
    ['strength', 'cardio', 'mobility', 'rest'].forEach(function (t) {
      if (!rules.DIET_RULE_TABLE.targets[t]) error('DIET_RULE_TABLE.targets 缺少训练类型：' + t, RULES_FILE);
    });
  }
  if (!rules.SAFETY_TABLE || !Array.isArray(rules.SAFETY_TABLE.rules) || rules.SAFETY_TABLE.rules.length !== 4) {
    error('SAFETY_TABLE.rules 应包含 4 类硬过滤规则', RULES_FILE);
  }
  const period = rules.PERIODIZATION_TABLE;
  if (!period) {
    error('PERIODIZATION_TABLE 缺失', RULES_FILE);
  } else {
    ['15', '30', '45'].forEach(function (t) {
      if (!period.action_count_by_time[t]) error('PERIODIZATION_TABLE.action_count_by_time 缺少时长 ' + t, RULES_FILE);
    });
    ['2', '3', '4', '5'].forEach(function (f) {
      if (!period.day_offsets[f]) error('PERIODIZATION_TABLE.day_offsets 缺少频次 ' + f, RULES_FILE);
    });
  }

  /* ---- 食物表 ---- */
  const FOOD_FILE = path.join(MINI_ROOT, 'data/foods.js');
  const foodList = foods.FOODS || [];
  if (foodList.length < 20) error('食物简表不少于 20 条，当前 ' + foodList.length, FOOD_FILE);
  const foodIds = {};
  foodList.forEach(function (f) {
    if (!f.food_id || foodIds[f.food_id]) error('食物 food_id 缺失或重复：' + JSON.stringify(f.food_id), FOOD_FILE);
    foodIds[f.food_id] = true;
    const expectedCats = ['protein', 'carb', 'veg', 'other'];
    if (expectedCats.indexOf(f.category) < 0) error('食物[' + f.food_id + '] category 非法：' + f.category, FOOD_FILE);
    ['protein_g', 'carb_g', 'kcal'].forEach(function (k) {
      if (typeof f[k] !== 'number' || f[k] < 0) error('食物[' + f.food_id + '] ' + k + ' 非法', FOOD_FILE);
    });
    if (!f.unit) error('食物[' + f.food_id + '] 缺少 unit', FOOD_FILE);
  });

  /* ---- 配置 ---- */
  const CONFIG_FILE = path.join(MINI_ROOT, 'utils/config.js');
  if (config.useMock !== true) warn('config.useMock 应为 true（演示模式）', CONFIG_FILE);
  ['llmParse', 'planExplain', 'demoFrames', 'diet'].forEach(function (key) {
    if (!config.features || config.features[key] === undefined) error('config.features 缺少开关：' + key, CONFIG_FILE);
  });
  if (!Array.isArray(config.subscribeTmplIds)) error('config.subscribeTmplIds 应为数组', CONFIG_FILE);
  if (config.schemaVersion !== '1.0') warn('config.schemaVersion 与接口契约 v1.0 不一致：' + config.schemaVersion, CONFIG_FILE);
}

/* ============================== 11. 页面规范抽查 ============================== */

const PAGE_SPEC = {
  constraints: { title: '填写训练约束', navColor: '#FF6B2C', hero: 'hero-orange', pullDown: false, tab: false },
  plan: { title: '训练计划', navColor: '#172033', hero: 'hero-dark', pullDown: true, tab: true },
  action: { title: '动作示范', navColor: '#172033', hero: 'hero-dark', pullDown: false, tab: false },
  checkin: { title: '提醒与打卡', navColor: '#FF6B2C', hero: 'hero-orange', pullDown: true, tab: true },
  feedback: { title: '周反馈', navColor: '#2F5BEA', hero: 'hero-blue', pullDown: true, tab: true },
  diet: { title: '饮食提示', navColor: '#12B76A', hero: 'hero-green', pullDown: true, tab: true }
};

function checkPageSpec() {
  section('页面规范抽查');
  pageList.forEach(function (page) {
    const name = path.basename(page.pagePath);
    const spec = PAGE_SPEC[name];
    if (!spec) return;
    const jsonFile = page.base + '.json';
    const jsFile = page.base + '.js';
    const wxmlFile = page.base + '.wxml';
    if (!isFile(jsonFile) || !isFile(jsFile) || !isFile(wxmlFile)) return; // 四件套检查已覆盖

    const cfg = readJson(jsonFile) || {};
    check(
      cfg.navigationBarTitleText === spec.title,
      '[' + name + '] 页面标题期望「' + spec.title + '」，当前「' + cfg.navigationBarTitleText + '」',
      jsonFile,
      0,
      'warn'
    );
    check(
      cfg.navigationBarBackgroundColor === spec.navColor,
      '[' + name + '] 导航栏颜色期望 ' + spec.navColor + '，当前 ' + cfg.navigationBarBackgroundColor,
      jsonFile,
      0,
      'warn'
    );
    if (spec.pullDown) {
      check(cfg.enablePullDownRefresh === true, '[' + name + '] 应开启 enablePullDownRefresh: true', jsonFile, 0, 'warn');
    }

    const js = readText(jsFile) || '';
    check(/\bPage\s*\(/.test(js), '[' + name + '] 页面 js 缺少 Page(...) 注册', jsFile);
    if (spec.pullDown) {
      check(/\bonPullDownRefresh\b/.test(js), '[' + name + '] 开启了下拉刷新但缺少 onPullDownRefresh 方法', jsFile);
      check(/wx\.stopPullDownRefresh\s*\(/.test(js), '[' + name + '] 下拉刷新未调用 wx.stopPullDownRefresh', jsFile);
    }
    if (spec.tab) {
      check(/\bonShow\s*\(/.test(js), '[' + name + '] tab 页缺少 onShow 生命周期（规范要求 onShow 中刷新角标/数据）', jsFile, 0, 'warn');
      check(/\brefreshBadge\s*\(/.test(js), '[' + name + '] tab 页未调用 reminder.refreshBadge()（应用内提醒兜底）', jsFile);
      check(/require\s*\(\s*['"][^'"]*reminder['"]\s*\)/.test(js), '[' + name + '] tab 页未 require utils/reminder', jsFile, 0, 'warn');
    }
    check(
      /require\s*\(\s*['"][^'"]*utils\/api['"]\s*\)/.test(js),
      '[' + name + '] 页面未通过 require 引入 utils/api.js（数据必须来自接口层）',
      jsFile,
      0,
      'warn'
    );
    check(/\bviewState\b/.test(js), '[' + name + '] 页面未实现 viewState 三态（loading/error/done）', jsFile, 0, 'warn');

    const wxml = readText(wxmlFile) || '';
    const heroRe = new RegExp('class="[^"]*\\bhero\\b[^"]*\\b' + spec.hero + '\\b');
    check(heroRe.test(wxml), '[' + name + '] hero 配色期望 ' + spec.hero + '（规范 3.1）', wxmlFile, 0, 'warn');
    check(/<state-view\b/.test(wxml), '[' + name + '] 未使用 <state-view> 三态容器（规范 3.2）', wxmlFile, 0, 'warn');
    check(/<empty-state\b/.test(wxml), '[' + name + '] 未使用 <empty-state> 空状态（规范 3.2）', wxmlFile, 0, 'warn');

    if (name === 'action') {
      check(/setInterval\s*\(/.test(js), '动作示范页未使用关键帧 setInterval 播放（规范 7.3）', jsFile, 0, 'warn');
      check(/clearInterval\s*\(/.test(js), '动作示范页使用播放定时器但未清空（clearInterval 缺失）', jsFile);
      check(/\bonUnload\b/.test(js) || /\bonHide\b/.test(js), '动作示范页缺少 onUnload/onHide 定时器清理生命周期', jsFile);
      check(/getAction\s*\(/.test(js), '动作示范页未调用 api.getAction', jsFile, 0, 'warn');
    }
  });
}

/* ============================== 12. 编码约定 ============================== */

function checkCodeConventions() {
  section('编码约定');
  // 页面 / 组件 js 的通用规范（规范第 8、9 节）
  const targets = []
    .concat(
      pageList.map(function (page) {
        return page.base + '.js';
      })
    )
    .concat(
      walk(path.join(MINI_ROOT, 'components'), [], function (p) {
        return p.toLowerCase().endsWith('.js');
      })
    )
    .filter(isFile);

  targets.forEach(function (file) {
    const text = readText(file) || '';
    const clean = stripJsCommentsAndStrings(text);
    // 旧基础库兼容：禁止可选链 / 空值合并（规范 8.1）
    if (/\?\./.test(clean)) warn('使用了可选链 ?.（规范 8.1 要求兼容旧基础库，禁止使用）', file);
    if (/\?\?/.test(clean)) warn('使用了空值合并 ??（规范 8.1 要求兼容旧基础库，禁止使用）', file);
    // 页面禁止直接操作 storage（规范第 2 节：统一走 store）
    if (file.indexOf(path.join(MINI_ROOT, 'pages') + path.sep) === 0 && /wx\.(get|set|remove)StorageSync\s*\(/.test(clean)) {
      warn('页面直接操作本地缓存（应通过 utils/store.js，禁止手写 storage key）', file);
    }
    // 验收清单：无 console.error / console.warn（mock/request 层调试图除外）
    if (/console\.(error|warn)\s*\(/.test(text)) {
      warn('页面/组件内存在 console.error/warn（验收清单要求无 console.error）', file);
    }
  });

  // app.js 入口
  const appJs = path.join(MINI_ROOT, 'app.js');
  if (isFile(appJs)) {
    const text = readText(appJs) || '';
    check(/\bApp\s*\(/.test(text), 'app.js 缺少 App(...) 注册', appJs);
    check(/\bonLaunch\s*\(/.test(text), 'app.js 缺少 onLaunch 生命周期', appJs);
  }
  // 每个组件 js 必须是 Component(...)
  walk(path.join(MINI_ROOT, 'components'), [], function (p) {
    return p.toLowerCase().endsWith('.js');
  }).forEach(function (file) {
    check(/\bComponent\s*\(/.test(readText(file) || ''), '组件 js 缺少 Component(...) 注册：' + rel(file), file);
  });
  // 全局不得出现 require('mock') / require('request') 的页面硬依赖（已在 require 检查覆盖）
}

/* ============================== 13. 文档与工具 ============================== */

function checkDocsAndTools() {
  section('文档与工具');
  const expect = [
    { p: path.join(REPO_ROOT, 'docs', '01-前端', '前端实现规范.md'), name: '前端实现规范' },
    { p: path.join(REPO_ROOT, 'docs', '02-接口', '接口契约.md'), name: '接口契约' },
    { p: path.join(REPO_ROOT, 'tools', 'smoke_test.js'), name: 'mock 流程自测脚本' }
  ];
  expect.forEach(function (item) {
    check(isFile(item.p), '缺少' + item.name + '：' + rel(item.p));
  });
  const projectConfig = path.join(MINI_ROOT, 'project.config.json');
  if (isFile(projectConfig)) {
    const cfg = readJson(projectConfig) || {};
    check(cfg.appid === 'wx9c4aac9029c3e66e', 'project.config.json appid 期望 wx9c4aac9029c3e66e，当前 ' + cfg.appid, projectConfig, 0, 'warn');
    check(cfg.compileType === 'miniprogram', 'project.config.json compileType 应为 miniprogram', projectConfig, 0, 'warn');
  } else {
    error('缺少 project.config.json', projectConfig);
  }
}

/* ============================== 输出 ============================== */

function printReport() {
  const errors = issues.filter(function (i) {
    return i.level === 'error';
  });
  const warns = issues.filter(function (i) {
    return i.level === 'warn';
  });
  const wips = issues.filter(function (i) {
    return i.level === 'wip';
  });

  function printGroup(title, list, icon) {
    if (!list.length) return;
    console.log('\n' + title + '（' + list.length + '）');
    list.forEach(function (item) {
      const loc = item.file ? ' [' + item.file + (item.line ? ':' + item.line : '') + ']' : '';
      console.log('  ' + icon + ' [' + item.section + '] ' + item.message + loc);
    });
  }

  console.log('\n========== 结果汇总 ==========');
  console.log('通过检查项：' + stats.passed);
  console.log('错误（ERROR）：' + errors.length);
  console.log('建议（WARN）：' + warns.length);
  console.log('进行中（WIP，暂缺/并行开发中）：' + wips.length);
  printGroup('错误（ERROR）', errors, '✗');
  printGroup('建议（WARN）', warns, '!');
  printGroup('进行中（WIP）', wips, '…');

  const failed = errors.length > 0 || (STRICT && wips.length > 0);
  if (failed) {
    console.log('\n校验未通过' + (STRICT ? '（--strict 模式：WIP 计为失败）' : '') + '，退出码 1');
    return 1;
  }
  if (wips.length) {
    console.log('\n校验通过（存在进行中的暂缺项，终检请使用 --strict 复跑），退出码 0');
  } else {
    console.log('\n校验通过，退出码 0');
  }
  return 0;
}

/* ============================== 主流程 ============================== */

function main() {
  console.log('===== 「校练」小程序静态校验 =====');
  console.log('项目根：' + REPO_ROOT);
  console.log('小程序目录：' + MINI_ROOT);
  if (STRICT) console.log('模式：--strict（WIP 计为失败）');
  console.log('');

  if (!isDir(MINI_ROOT)) {
    console.error('找不到 mini-program 目录：' + MINI_ROOT);
    process.exit(2);
  }

  checkJsSyntax();
  checkJson();
  checkAppJson();
  checkPageFourPiece();
  checkUsingComponents();
  checkWxml();
  checkWxss();
  checkRequires();
  checkAssets();
  checkDataAssets();
  checkPageSpec();
  checkCodeConventions();
  checkDocsAndTools();

  console.log('');
  process.exit(printReport());
}

try {
  main();
} catch (e) {
  console.error('\n[validate] 脚本异常：', e && e.stack ? e.stack : e);
  process.exit(2);
}
