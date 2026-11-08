#!/usr/bin/env node
/**
 * 「校练」小程序 UI 近似预览工具
 *
 * 作用：在没有微信开发者工具的环境下，把 6 个页面的 WXML/WXSS 近似渲染成 HTML，
 *       用本机 headless Edge/Chrome（DevTools Protocol）按 375×812 @2x 截图，
 *       输出到 docs/03-测试/UI预览/，用于布局自检与交付预览。
 *
 * 注意：这是「近似预览」——只还原静态布局与样式，不执行小程序运行时，
 *       不等同于真机/开发者工具截图（详见 docs/03-测试/UI预览/README.md）。
 *
 * 用法：
 *   node tools/ui_preview/render.js                  # 渲染全部场景到默认目录
 *   node tools/ui_preview/render.js --only plan      # 只渲染名字包含 plan 的场景
 *   node tools/ui_preview/render.js --no-browser     # 只生成 HTML（无浏览器环境降级）
 *   node tools/ui_preview/render.js --browser "C:\\...\\msedge.exe"
 *
 * 依赖：Node >= 18（fetch）/ >= 22（WebSocket，用于 CDP 截图）；本机 Edge 或 Chrome。
 * 不联网，只访问本机调试端口与本地 file:// 文件。
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const { createRuntime, sleep } = require('./lib/runtime');
const { createScenarios } = require('./lib/scenarios');
const { createComponents } = require('./lib/components');
const { buildCSS } = require('./lib/css');
const { findBrowser, launchBrowser } = require('./lib/browser');

const ROOT = path.resolve(__dirname, '..', '..');
const MINI_ROOT = path.join(ROOT, 'mini-program');
const DEFAULT_OUT = path.join(ROOT, 'docs', '03-测试', 'UI预览');
const VIEWPORT = { width: 375, height: 812, dpr: 2 };

/* ================= 预览外壳样式（手机框 + 表单控件近似） ================= */

const PREVIEW_CSS = `
html, body { margin: 0; padding: 0; }
/* 小程序对 view/text/image 等元素统一 border-box；预览里用全局近似，避免 100% 宽度 + padding 溢出 */
*, *::before, *::after { box-sizing: border-box; }
body {
  width: 375px; height: 812px; overflow: hidden;
  background: #dfe4ec;
  font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', 'PingFang SC', 'Microsoft YaHei', sans-serif;
  -webkit-font-smoothing: antialiased;
}
.pv-phone { position: relative; width: 375px; height: 812px; overflow: hidden; background: #fff; }
.pv-top { position: absolute; top: 0; left: 0; right: 0; height: 88px; z-index: 10; }
.pv-status {
  height: 44px; box-sizing: border-box; display: flex; align-items: flex-end;
  justify-content: space-between; padding: 0 24px 7px; font-size: 13px; font-weight: 600;
  letter-spacing: .2px;
}
.pv-status-right { font-size: 11px; letter-spacing: 1px; opacity: .92; }
.pv-nav {
  position: relative; height: 44px; display: flex; align-items: center;
  justify-content: center; font-size: 17px; font-weight: 600;
}
.pv-nav-title { max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pv-nav-back { position: absolute; left: 14px; top: 0; bottom: 0; display: flex; align-items: center; font-size: 24px; font-weight: 400; }
.pv-viewport {
  position: absolute; left: 0; right: 0; top: 88px; bottom: 0;
  overflow-y: auto; overflow-x: hidden; background: #F4F6FA;
}
.pv-has-tabbar .pv-viewport { bottom: 83px; }
.pv-page { min-height: 100%; }
.pv-tabbar {
  position: absolute; left: 0; right: 0; bottom: 0; height: 83px; z-index: 20;
  display: flex; box-sizing: border-box; padding: 4px 0 0;
  background: #fff; border-top: 1px solid #e8ecf3;
}
.pv-tab { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 2px; padding-top: 2px; }
.pv-tab img { width: 27px; height: 27px; display: block; }
.pv-tab-label { font-size: 10px; line-height: 1.3; color: #8A94A6; }
.pv-tab--active .pv-tab-label { color: #FF6B2C; }
.pv-home {
  position: absolute; left: 50%; transform: translateX(-50%); bottom: 8px;
  width: 134px; height: 5px; border-radius: 3px;
  background: rgba(23, 32, 51, .3); z-index: 80; pointer-events: none;
}
.pv-has-tabbar .pv-home { display: none; }
/* tab 页的遮罩弹层只覆盖内容视口（真机上 tabBar 是原生的、在页面之上） */
.pv-has-tabbar .ex-mask { top: 88px !important; bottom: 83px !important; }
/* input / textarea 近似 */
.pv-field { display: flex; align-items: center; }
.pv-field--textarea { display: block; }
.pv-placeholder { color: #a6adbb; }
.pv-field-value { color: #172033; }
/* switch 近似 */
.pv-switch { position: relative; width: 52px; height: 32px; border-radius: 999px; background: #e8ecf3; flex-shrink: 0; }
.pv-switch--on { background: #ff6b2c; }
.pv-switch-knob {
  position: absolute; top: 2px; left: 2px; width: 28px; height: 28px; border-radius: 50%;
  background: #fff; box-shadow: 0 1px 3px rgba(0, 0, 0, .22);
}
.pv-switch--on .pv-switch-knob { left: 22px; }
/* rpe-slider 近似滑轨 */
.pv-rpe-track { position: relative; height: 6px; border-radius: 999px; background: #E8ECF3; margin: 16px 2px 12px; }
.pv-rpe-fill { height: 100%; border-radius: 999px; background: #FF6B2C; }
.pv-rpe-knob {
  position: absolute; top: -5px; width: 16px; height: 16px; border-radius: 50%;
  background: #fff; border: 1px solid #e8ecf3; box-shadow: 0 2px 6px rgba(23, 32, 51, .18);
}
/* overview 拼图 */
.ov-body { width: 1160px; min-height: 1360px; margin: 0; padding: 28px 32px 32px; box-sizing: border-box;
  background: #eef1f6; font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif; }
.ov-header { display: flex; align-items: baseline; gap: 16px; margin-bottom: 18px; }
.ov-title { font-size: 26px; font-weight: 700; color: #172033; }
.ov-note { font-size: 13px; color: #7b8496; }
.ov-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 18px; }
.ov-card { background: #fff; border-radius: 12px; padding: 8px 8px 10px; box-shadow: 0 6px 18px rgba(23, 32, 51, .08); }
.ov-card img { display: block; width: 100%; border-radius: 8px; border: 1px solid #e8ecf3; }
.ov-caption { margin-top: 8px; font-size: 13px; font-weight: 600; color: #172033; }
.ov-desc { margin-top: 2px; font-size: 11px; line-height: 1.5; color: #7b8496; }
`;

/* ================= 小工具 ================= */

function readJSON(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

const COMPONENT_LIST = [
  'plan-card',
  'action-tag',
  'rpe-slider',
  'empty-state',
  'state-view',
  'tag-picker',
  'stepper',
  'safety-banner'
];

let componentCSSCache = null;

function readComponentCSS() {
  if (componentCSSCache !== null) return componentCSSCache;
  componentCSSCache = COMPONENT_LIST.map(function (name) {
    const filePath = path.join(MINI_ROOT, 'components', name, 'index.wxss');
    try {
      return fs.readFileSync(filePath, 'utf8');
    } catch (e) {
      return '';
    }
  }).join('\n');
  return componentCSSCache;
}

/** app.wxss + 页面 wxss + 组件 wxss（组件样式在真机上是隔离的，这里合并渲染并在 README 说明局限） */
function buildPageCSS(pageRel) {
  const parts = [];
  try {
    parts.push(fs.readFileSync(path.join(MINI_ROOT, 'app.wxss'), 'utf8'));
  } catch (e) {}
  try {
    parts.push(fs.readFileSync(path.join(MINI_ROOT, pageRel + '.wxss'), 'utf8'));
  } catch (e) {}
  parts.push(readComponentCSS());
  return buildCSS(parts);
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function escapeHTML(value) {
  return String(value === undefined || value === null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 小程序包内绝对路径 /assets/... → file:/// 本地绝对路径 */
function resolveAsset(assetPath) {
  const value = String(assetPath || '');
  if (!value) return '';
  if (/^(https?:|file:|data:)/.test(value)) return value;
  const absolute = value.charAt(0) === '/'
    ? path.join(MINI_ROOT, value.slice(1))
    : path.join(MINI_ROOT, value);
  return 'file:///' + absolute.replace(/\\/g, '/');
}

function findTabIndex(appJson, pageRel) {
  const list = (appJson.tabBar && appJson.tabBar.list) || [];
  for (let i = 0; i < list.length; i++) {
    if (list[i].pagePath === pageRel) return i;
  }
  return -1;
}

/* ================= 页面 HTML 组装 ================= */

function buildPageHTML(runtime, scenario, pageData) {
  const appJson = readJSON(path.join(MINI_ROOT, 'app.json'));
  const pageJson = readJSON(path.join(MINI_ROOT, scenario.page + '.json'));
  const wxml = fs.readFileSync(path.join(MINI_ROOT, scenario.page + '.wxml'), 'utf8');

  const options = runtime.requireMini('data/options.js');
  const components = createComponents({ options: options, resolveAsset: resolveAsset });

  const pageHtml = require('./lib/wxml').renderWXML(wxml, pageData, {
    components: components,
    resolveAsset: resolveAsset
  });

  const tabIndex = findTabIndex(appJson, scenario.page);
  const isTabPage = tabIndex >= 0;
  const navBg = pageJson.navigationBarBackgroundColor || '#FF6B2C';
  const navFg = pageJson.navigationBarTextStyle === 'black' ? '#172033' : '#ffffff';
  const navTitle = pageJson.navigationBarTitleText || scenario.title;

  let tabbarHtml = '';
  if (isTabPage) {
    const list = appJson.tabBar.list;
    tabbarHtml =
      '<div class="pv-tabbar">' +
      list
        .map(function (item, index) {
          const active = index === tabIndex;
          const icon = resolveAsset(active ? item.selectedIconPath : item.iconPath);
          return (
            '<div class="pv-tab ' + (active ? 'pv-tab--active' : '') + '">' +
            '<img src="' + escapeHTML(icon) + '" alt="">' +
            '<span class="pv-tab-label">' + escapeHTML(item.text) + '</span></div>'
          );
        })
        .join('') +
      '</div>';
  }

  const navBack = isTabPage ? '' : '<div class="pv-nav-back">‹</div>';

  return (
    '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">' +
    '<title>' + escapeHTML(scenario.title) + '</title>' +
    '<style>' + buildPageCSS(scenario.page) + '\n' + PREVIEW_CSS + '</style></head>' +
    '<body><div class="pv-phone ' + (isTabPage ? 'pv-has-tabbar' : '') + '">' +
    '<div class="pv-top" style="background:' + escapeHTML(navBg) + ';color:' + escapeHTML(navFg) + ';">' +
    '<div class="pv-status"><span>9:41</span><span class="pv-status-right">●●● 5G ▮▮▮</span></div>' +
    '<div class="pv-nav">' + navBack + '<div class="pv-nav-title">' + escapeHTML(navTitle) + '</div></div>' +
    '</div>' +
    '<div class="pv-viewport"><div class="pv-page">' + pageHtml + '</div></div>' +
    tabbarHtml +
    '<div class="pv-home"></div>' +
    '</div></body></html>'
  );
}

/* ================= 布局自检脚本（在页面里执行） ================= */

const CHECKS_EXPRESSION = `
(function () {
  function tagClass(el) {
    var name = el.tagName.toLowerCase();
    var cls = (el.className && typeof el.className === 'string') ? el.className.split(/\\s+/).filter(Boolean)[0] : '';
    return cls ? name + '.' + cls : name;
  }
  function hiddenByAncestor(el) {
    var parent = el.parentElement;
    while (parent && parent !== document.body) {
      if (parent.classList && (parent.classList.contains('pv-viewport') || parent.classList.contains('pv-page'))) break;
      var cs = getComputedStyle(parent);
      if (cs.overflow !== 'visible' || cs.overflowX !== 'visible' || cs.overflowY !== 'visible') return true;
      parent = parent.parentElement;
    }
    return false;
  }
  var vp = document.querySelector('.pv-viewport');
  var vr = vp ? vp.getBoundingClientRect() : { left: 0, right: innerWidth, top: 0, bottom: innerHeight, height: innerHeight };
  var result = {
    overflowX: [],
    clippedText: [],
    brokenImages: [],
    undefinedText: false,
    heroContentOverlap: null,
    bottomBar: null,
    tabBarVisible: !!document.querySelector('.pv-tabbar'),
    pageHeight: 0,
    viewportHeight: +vr.height.toFixed(1)
  };
  var nodes = document.querySelectorAll('.pv-page *');
  var overflowCount = 0;
  for (var i = 0; i < nodes.length; i++) {
    var el = nodes[i];
    var rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;
    var cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    if (rect.right > vr.right + 1 || rect.left < vr.left - 1) {
      if (cs.position === 'fixed') continue;
      if (hiddenByAncestor(el)) continue;
      overflowCount += 1;
      if (result.overflowX.length < 10) {
        result.overflowX.push({ el: tagClass(el), left: +rect.left.toFixed(1), right: +rect.right.toFixed(1) });
      }
    }
    if (cs.overflow === 'hidden' && (cs.whiteSpace === 'nowrap' || cs.textOverflow === 'ellipsis') &&
        el.scrollWidth > el.clientWidth + 2 && (el.textContent || '').trim().length > 0) {
      if (result.clippedText.length < 10) {
        result.clippedText.push({ el: tagClass(el), clientWidth: el.clientWidth, scrollWidth: el.scrollWidth });
      }
    }
  }
  result.overflowCount = overflowCount;
  var images = document.querySelectorAll('.pv-page img');
  for (var j = 0; j < images.length; j++) {
    if (images[j].complete && images[j].naturalWidth === 0) {
      result.brokenImages.push(images[j].getAttribute('src'));
    }
  }
  var text = document.body.innerText || '';
  result.undefinedText = /undefined|NaN/.test(text);
  var hero = document.querySelector('.pv-page .hero');
  var content = document.querySelector('.pv-page .content');
  if (hero && content) {
    result.heroContentOverlap = +(hero.getBoundingClientRect().bottom - content.getBoundingClientRect().top).toFixed(1);
  }
  var bar = document.querySelector('.pv-page .bottom-bar');
  if (bar) {
    var barRect = bar.getBoundingClientRect();
    result.bottomBar = {
      top: +barRect.top.toFixed(1),
      bottom: +barRect.bottom.toFixed(1),
      viewportBottom: +vr.bottom.toFixed(1)
    };
  }
  result.hasBottomPlaceholder = !!document.querySelector('.pv-page .bottom-placeholder');
  var page = document.querySelector('.pv-page');
  result.pageHeight = page ? page.scrollHeight : 0;
  result.scrollTop = vp ? Math.round(vp.scrollTop) : 0;
  return JSON.stringify(result);
})()
`;

/* ================= 场景驱动 ================= */

async function waitUntil(predicate, timeoutMs, label) {
  const started = Date.now();
  while (Date.now() - started < (timeoutMs || 8000)) {
    try {
      if (predicate()) return true;
    } catch (e) {
      // 页面数据还没就绪时忽略
    }
    await sleep(80);
  }
  throw new Error('等待场景状态超时：' + (label || ''));
}

async function runScenario(runtime, scenario) {
  runtime.clearStorage();
  if (typeof scenario.prepare === 'function') await scenario.prepare();

  const pageObject = runtime.loadPageObject(scenario.page);
  const page = runtime.createPageInstance(pageObject);
  page.onLoad(scenario.args || {});
  try {
    await waitUntil(function () {
      return scenario.ready ? scenario.ready(page) : page.data.viewState === 'done';
    }, 9000, scenario.name + ' 数据就绪');
    if (typeof scenario.drive === 'function') await scenario.drive(page);
    if (typeof scenario.settle === 'function') {
      await waitUntil(function () {
        return scenario.settle(page);
      }, 9000, scenario.name + ' 交互完成');
    }
  } finally {
    // 快照必须在清理生命周期之前（onUnload 可能改 data / 清理定时器）
    scenario.__snapshot = JSON.parse(JSON.stringify(page.data));
    try {
      if (typeof page.onHide === 'function') page.onHide();
      if (typeof page.onUnload === 'function') page.onUnload();
    } catch (e) {}
  }
  return scenario.__snapshot;
}

/* ================= overview 拼图 ================= */

const OVERVIEW_KEYS = [
  'page-constraints-parsed',
  'page-plan-4weeks',
  'page-plan-empty',
  'page-action-frames',
  'page-checkin-today',
  'page-feedback-result',
  'page-diet-tips',
  'page-plan-stale'
];

function buildOverviewHTML(results, generatedAt) {
  const cards = OVERVIEW_KEYS.map(function (name) {
    const item = results[name];
    if (!item) return '';
    return (
      '<div class="ov-card"><img src="' + escapeHTML(item.fileUrl) + '" alt="' + escapeHTML(item.title) + '">' +
      '<div class="ov-caption">' + escapeHTML(item.title) + '</div>' +
      '<div class="ov-desc">' + escapeHTML(item.description) + '</div></div>'
    );
  }).join('');
  return (
    '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>校练 UI 预览总览</title>' +
    '<style>' + PREVIEW_CSS + '</style></head><body class="ov-body">' +
    '<div class="ov-header"><div class="ov-title">「校练」小程序 · UI 近似预览总览</div>' +
    '<div class="ov-note">近似预览，非真机截图 · 生成于 ' + escapeHTML(generatedAt) + ' · 375×812 @2x</div></div>' +
    '<div class="ov-grid">' + cards + '</div></body></html>'
  );
}

/* ================= 主流程 ================= */

function parseArgs(argv) {
  const args = {
    out: DEFAULT_OUT,
    only: [],
    browser: '',
    noBrowser: false,
    keepTemp: false
  };
  for (let i = 2; i < argv.length; i++) {
    const token = argv[i];
    if (token === '--out') args.out = argv[++i];
    else if (token === '--only') args.only = String(argv[++i] || '').split(',').map(function (item) { return item.trim(); }).filter(Boolean);
    else if (token === '--browser') args.browser = argv[++i];
    else if (token === '--no-browser') args.noBrowser = true;
    else if (token === '--keep-temp') args.keepTemp = true;
    else if (token === '--help' || token === '-h') args.help = true;
    else throw new Error('未知参数：' + token);
  }
  return args;
}

function printHelp() {
  console.log(
    [
      '用法：node tools/ui_preview/render.js [options]',
      '',
      '  --out <dir>       截图输出目录（默认 docs/03-测试/UI预览）',
      '  --only <names>    只渲染名字包含这些关键字的场景，逗号分隔',
      '  --browser <path>  指定 Chrome/Edge 可执行文件',
      '  --no-browser      仅生成 HTML 预览，不截图（无浏览器环境降级）',
      '  --keep-temp       保留临时 HTML 构建目录（便于排查渲染问题）',
      '  -h, --help        显示帮助'
    ].join('\n')
  );
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    return;
  }
  const outDir = path.resolve(args.out);
  const stamp = new Date()
    .toISOString()
    .replace(/[:.]/g, '-')
    .replace('T', '_')
    .slice(0, 19);
  const buildDir = path.join(os.tmpdir(), 'xl-ui-preview-' + stamp);
  ensureDir(buildDir);

  const runtime = createRuntime({ root: ROOT });
  const scenarios = createScenarios(runtime).filter(function (scenario) {
    if (!args.only.length) return true;
    return args.only.some(function (keyword) {
      return scenario.name.indexOf(keyword) >= 0;
    });
  });

  console.log('==============================================');
  console.log(' 「校练」小程序 UI 近似预览');
  console.log(' 仓库：' + ROOT);
  console.log(' 输出：' + outDir);
  console.log(' 临时构建：' + buildDir);
  console.log(' 场景数：' + scenarios.length);
  console.log('==============================================\n');

  if (!scenarios.length) throw new Error('没有匹配的场景，请检查 --only 参数');

  /* ---- 1. 生成各场景页面 HTML ---- */
  const htmlFiles = [];
  for (const scenario of scenarios) {
    const pageData = await runScenario(runtime, scenario);
    const html = buildPageHTML(runtime, scenario, pageData);
    const htmlPath = path.join(buildDir, scenario.name + '.html');
    fs.writeFileSync(htmlPath, html, 'utf8');
    htmlFiles.push({ scenario: scenario, htmlPath: htmlPath });
    console.log('[HTML] ' + scenario.name + '  (' + (html.length / 1024).toFixed(1) + ' KB)');
  }

  /* ---- 2. 浏览器截图 ---- */
  if (args.noBrowser) {
    console.log('\n已指定 --no-browser：仅生成 HTML，未截图。');
    console.log('可用任意浏览器打开：' + buildDir);
    return;
  }

  let browserPath = findBrowser(args.browser);
  if (!browserPath) {
    console.log('\n[降级] 未找到 headless Edge/Chrome，跳过截图。');
    console.log('  - 可安装 Microsoft Edge / Google Chrome 后重跑；');
    console.log('  - 或设置环境变量 UI_PREVIEW_BROWSER=<浏览器可执行文件路径>；');
    console.log('  - 生成的 HTML 预览在：' + buildDir + '（可用任意浏览器打开人工检查）');
    return;
  }
  console.log('\n浏览器：' + browserPath);

  let browser = null;
  const results = {};
  const checks = {};
  let failed = 0;

  try {
    browser = await launchBrowser({
      browserPath: browserPath,
      tmpDir: buildDir,
      width: VIEWPORT.width,
      height: VIEWPORT.height,
      dpr: VIEWPORT.dpr
    });
    console.log('已启动 headless 浏览器（CDP 端口 ' + browser.port + '）\n');

    for (const item of htmlFiles) {
      const scenario = item.scenario;
      const fileUrl = 'file:///' + item.htmlPath.replace(/\\/g, '/');
      try {
        await browser.navigate(fileUrl, 700);
        if (scenario.scrollTo) {
          await browser.scrollTo(scenario.scrollTo);
        }
        // 可选：在页面内执行一段脚本（例如把弹层内部滚动区滚到底），用于补充预览态
        if (scenario.scriptAfter) {
          await browser.evaluate(scenario.scriptAfter);
          await sleep(280);
        }
        const rawChecks = await browser.evaluate(CHECKS_EXPRESSION);
        const layoutChecks = JSON.parse(rawChecks || '{}');
        const png = await browser.screenshot();
        const pngPath = path.join(outDir, scenario.name + '.png');
        ensureDir(outDir);
        fs.writeFileSync(pngPath, png);
        results[scenario.name] = {
          title: scenario.title,
          description: scenario.description,
          png: pngPath,
          fileUrl: 'file:///' + pngPath.replace(/\\/g, '/'),
          checksFile: scenario.name + '.png'
        };
        checks[scenario.name] = layoutChecks;
        const issues =
          layoutChecks.overflowCount +
          layoutChecks.brokenImages.length +
          (layoutChecks.undefinedText ? 1 : 0);
        console.log(
          '[PNG ] ' + scenario.name + '.png  (' + (png.length / 1024).toFixed(0) + ' KB)' +
          '  横向溢出:' + layoutChecks.overflowCount +
          '  破图:' + layoutChecks.brokenImages.length +
          '  疑似截断:' + layoutChecks.clippedText.length +
          '  hero重叠:' + (layoutChecks.heroContentOverlap === null ? '-' : layoutChecks.heroContentOverlap + 'px') +
          (issues ? '  ⚠' : '  ✓')
        );
      } catch (e) {
        failed += 1;
        console.error('[FAIL] ' + scenario.name + '：' + (e && e.message));
      }
    }

    /* ---- 3. overview 拼图 ---- */
    if (Object.keys(results).length) {
      ensureDir(outDir);
      const generatedAt = new Date().toLocaleString('zh-CN', { hour12: false });
      const overviewHtml = buildOverviewHTML(results, generatedAt);
      const overviewHtmlPath = path.join(buildDir, 'overview.html');
      fs.writeFileSync(overviewHtmlPath, overviewHtml, 'utf8');
      await browser.setViewport(1160, 1400, 1);
      await browser.navigate('file:///' + overviewHtmlPath.replace(/\\/g, '/'), 700);
      const overviewPng = await browser.screenshot();
      const overviewPath = path.join(outDir, 'overview.png');
      fs.writeFileSync(overviewPath, overviewPng);
      console.log('\n[PNG ] overview.png  (' + (overviewPng.length / 1024).toFixed(0) + ' KB)');
      results.__overview = { png: overviewPath };
    }
  } finally {
    if (browser) await browser.close();
    if (!args.keepTemp && !args.noBrowser) {
      try {
        fs.rmSync(buildDir, { recursive: true, force: true });
      } catch (e) {}
    } else {
      console.log('\n临时 HTML 目录：' + buildDir);
    }
  }

  /* ---- 4. 写入自检结果 ---- */
  ensureDir(outDir);
  fs.writeFileSync(
    path.join(outDir, 'checks.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), viewport: VIEWPORT, checks: checks }, null, 2),
    'utf8'
  );
  console.log('\n[自检] checks.json 已写入：' + path.join(outDir, 'checks.json'));

  const summary = Object.keys(checks).map(function (name) {
    const item = checks[name];
    return {
      name: name,
      overflow: item.overflowCount || 0,
      brokenImages: (item.brokenImages || []).length,
      clippedText: (item.clippedText || []).length,
      undefinedText: !!item.undefinedText
    };
  });
  const bad = summary.filter(function (item) {
    return item.overflow || item.brokenImages || item.undefinedText;
  });
  console.log('\n==============================================');
  console.log(' 完成：' + Object.keys(results).filter(function (key) { return key !== '__overview'; }).length +
    ' 张页面截图 + overview.png，失败 ' + failed + ' 个场景');
  if (bad.length) {
    console.log(' 需要人工确认的布局告警：');
    bad.forEach(function (item) {
      console.log('  - ' + item.name + '：横向溢出 ' + item.overflow + '，破图 ' + item.brokenImages + '，undefined 文本 ' + item.undefinedText);
    });
  }
  console.log('==============================================');
  if (failed) process.exitCode = 1;
}

main().catch(function (error) {
  console.error('\n[ui_preview] 运行失败：', error && error.stack ? error.stack : error);
  process.exit(1);
});
