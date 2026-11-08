/**
 * headless 浏览器探测与 CDP 截图封装
 *
 * 优先方案：本机已安装的 Edge / Chrome（headless 模式 + DevTools Protocol）
 *  - 通过 --remote-debugging-port 起一个临时无头浏览器
 *  - 用 Emulation.setDeviceMetricsOverride 固定 375×812 / deviceScaleFactor=2 视口
 *  - Page.captureScreenshot 得到 750×1624 的 @2x 截图
 *
 * 降级方案（找不到浏览器 / Node 不支持 WebSocket / CDP 启动失败）：
 *  - render.js 仍会把自包含 HTML 预览文件写到系统临时目录并打印路径，
 *    可在任意浏览器中打开人工检查；此时不生成 PNG 与 overview.png。
 *
 * 不联网：只访问本机 127.0.0.1 的调试端口与本地 file:// 文件。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

function sleep(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

function existsFile(filePath) {
  try {
    return !!filePath && fs.existsSync(filePath) && fs.statSync(filePath).isFile();
  } catch (e) {
    return false;
  }
}

/** 在 PATH 中查找可执行文件 */
function findInPath(names) {
  const pathValue = process.env.PATH || '';
  const dirs = pathValue.split(path.delimiter).filter(Boolean);
  const exts = process.platform === 'win32'
    ? (process.env.PATHEXT || '.EXE;.CMD;.BAT').split(';').map(function (ext) {
        return ext.toLowerCase();
      })
    : [''];
  for (let i = 0; i < dirs.length; i++) {
    for (let j = 0; j < names.length; j++) {
      for (let k = 0; k < exts.length; k++) {
        const candidate = path.join(dirs[i], names[j] + exts[k]);
        if (existsFile(candidate)) return candidate;
      }
    }
  }
  return '';
}

/**
 * 探测本机可用的 Chromium 系浏览器
 * 优先级：命令行参数 > UI_PREVIEW_BROWSER 环境变量 > 常见安装路径 > PATH
 */
function findBrowser(explicitPath) {
  const candidates = [];
  if (explicitPath) candidates.push(explicitPath);
  if (process.env.UI_PREVIEW_BROWSER) candidates.push(process.env.UI_PREVIEW_BROWSER);

  if (process.platform === 'win32') {
    const programFiles = process.env.PROGRAMFILES || 'C:\\Program Files';
    const programFilesX86 = process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)';
    const localAppData = process.env.LOCALAPPDATA || '';
    const edges = [
      path.join(programFilesX86, 'Microsoft\\Edge\\Application\\msedge.exe'),
      path.join(programFiles, 'Microsoft\\Edge\\Application\\msedge.exe')
    ];
    const chromes = [
      path.join(programFiles, 'Google\\Chrome\\Application\\chrome.exe'),
      path.join(programFilesX86, 'Google\\Chrome\\Application\\chrome.exe')
    ];
    if (localAppData) {
      chromes.push(path.join(localAppData, 'Google\\Chrome\\Application\\chrome.exe'));
      edges.push(path.join(localAppData, 'Microsoft\\Edge\\Application\\msedge.exe'));
    }
    candidates.push.apply(candidates, edges);
    candidates.push.apply(candidates, chromes);
  } else if (process.platform === 'darwin') {
    candidates.push(
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    );
  }

  for (let i = 0; i < candidates.length; i++) {
    if (existsFile(candidates[i])) return candidates[i];
  }
  return findInPath(['msedge', 'chrome', 'chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable', 'microsoft-edge']);
}

/* ================= CDP 客户端 ================= */

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    const self = this;
    ws.addEventListener('message', function (event) {
      let message = null;
      try {
        message = JSON.parse(event.data);
      } catch (e) {
        return;
      }
      if (message.id && self.pending.has(message.id)) {
        const handlers = self.pending.get(message.id);
        self.pending.delete(message.id);
        if (message.error) handlers.reject(new Error(message.error.message || 'CDP error'));
        else handlers.resolve(message.result);
      }
    });
  }

  send(method, params) {
    const id = ++this.id;
    const payload = JSON.stringify({ id: id, method: method, params: params || {} });
    const self = this;
    return new Promise(function (resolve, reject) {
      self.pending.set(id, { resolve: resolve, reject: reject });
      try {
        self.ws.send(payload);
      } catch (e) {
        self.pending.delete(id);
        reject(e);
      }
    });
  }
}

async function waitForTarget(port, timeoutMs) {
  const started = Date.now();
  let lastError = null;
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch('http://127.0.0.1:' + port + '/json/list');
      const list = await response.json();
      const page = list.filter(function (target) {
        return target.type === 'page' && target.webSocketDebuggerUrl;
      })[0];
      if (page) return page;
    } catch (e) {
      lastError = e;
    }
    await sleep(250);
  }
  throw new Error('浏览器调试端口未就绪（' + (lastError && lastError.message) + '）');
}

class BrowserSession {
  constructor(options) {
    this.browserPath = options.browserPath;
    this.tmpDir = options.tmpDir;
    this.width = options.width || 375;
    this.height = options.height || 812;
    this.dpr = options.dpr || 2;
    this.child = null;
    this.cdp = null;
  }

  async start() {
    if (typeof WebSocket === 'undefined' || typeof fetch === 'undefined') {
      throw new Error('当前 Node 版本不支持 WebSocket/fetch（需要 Node >= 22），无法走 CDP 截图');
    }
    const profileDir = path.join(this.tmpDir, 'browser-profile-' + process.pid);
    fs.mkdirSync(profileDir, { recursive: true });
    let lastError = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const port = 20000 + Math.floor(Math.random() * 20000);
      try {
        await this.launchAt(port, profileDir);
        return this;
      } catch (e) {
        lastError = e;
        this.cleanupChild();
      }
    }
    throw new Error('浏览器启动失败：' + (lastError && lastError.message));
  }

  async launchAt(port, profileDir) {
    const args = [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--mute-audio',
      '--disable-background-networking',
      '--allow-file-access-from-files',
      '--remote-debugging-port=' + port,
      '--user-data-dir=' + profileDir,
      'about:blank'
    ];
    this.child = spawn(this.browserPath, args, {
      stdio: 'ignore',
      windowsHide: true
    });
    this.child.on('error', function () {});
    this.port = port;
    const target = await waitForTarget(port, 20000);
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise(function (resolve, reject) {
      ws.addEventListener('open', resolve);
      ws.addEventListener('error', function () {
        reject(new Error('DevTools WebSocket 连接失败'));
      });
      setTimeout(function () {
        reject(new Error('DevTools WebSocket 连接超时'));
      }, 8000);
    });
    this.cdp = new CDP(ws);
    await this.cdp.send('Page.enable');
    await this.cdp.send('Runtime.enable');
    await this.setViewport(this.width, this.height, this.dpr);
  }

  async setViewport(width, height, dpr) {
    return this.cdp.send('Emulation.setDeviceMetricsOverride', {
      width: width,
      height: height,
      deviceScaleFactor: dpr,
      mobile: true
    });
  }

  async evaluate(expression, options) {
    const result = await this.cdp.send('Runtime.evaluate', {
      expression: expression,
      returnByValue: true,
      awaitPromise: !!(options && options.awaitPromise)
    });
    if (result && result.exceptionDetails) {
      throw new Error('页面脚本异常：' + JSON.stringify(result.exceptionDetails.exception || result.exceptionDetails));
    }
    return result ? result.result.value : undefined;
  }

  /** 打开本地 HTML 并等待首屏渲染稳定（load + CSS 动画） */
  async navigate(fileUrl, waitMs) {
    await this.cdp.send('Page.navigate', { url: fileUrl });
    const readyExpression =
      'new Promise(function (resolve) {' +
      '  function done() {' +
      '    requestAnimationFrame(function () {' +
      '      requestAnimationFrame(function () { resolve(true); });' +
      '    });' +
      '  }' +
      '  if (document.readyState === "complete") { done(); }' +
      '  else { window.addEventListener("load", done); }' +
      '})';
    await this.evaluate(readyExpression, { awaitPromise: true });
    // 等待图片解码与淡入动画（.fade-in 0.32s / .slide-up 0.36s）结束
    await sleep(waitMs || 650);
  }

  /** 滚动内容视口到指定元素（等价于页面 wx.pageScrollTo） */
  async scrollTo(selector) {
    if (!selector) return 0;
    const expression =
      '(function(sel){' +
      'var vp = document.querySelector(".pv-viewport");' +
      'var el = sel ? document.querySelector(sel) : null;' +
      'if (!vp || !el) return -1;' +
      'var vr = vp.getBoundingClientRect();' +
      'var er = el.getBoundingClientRect();' +
      'vp.scrollTop = Math.max(0, vp.scrollTop + (er.top - vr.top) - 8);' +
      'return vp.scrollTop;' +
      '})(' +
      JSON.stringify(selector) +
      ')';
    const value = await this.evaluate(expression);
    await sleep(280);
    return value;
  }

  async screenshot() {
    const result = await this.cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    return Buffer.from(result.data, 'base64');
  }

  cleanupChild() {
    if (this.child) {
      try {
        this.child.kill();
      } catch (e) {}
      this.child = null;
    }
  }

  async close() {
    try {
      if (this.cdp) await this.cdp.send('Browser.close');
    } catch (e) {}
    this.cleanupChild();
    await sleep(150);
  }
}

async function launchBrowser(options) {
  const session = new BrowserSession(options);
  await session.start();
  return session;
}

module.exports = {
  findBrowser: findBrowser,
  launchBrowser: launchBrowser,
  BrowserSession: BrowserSession,
  sleep: sleep
};
