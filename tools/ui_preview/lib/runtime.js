/**
 * 页面运行时桩：在小程序之外用 Node 真实 require 页面 JS，并用 wx/Page/getApp 桩驱动生命周期。
 * 只用于「UI 近似预览」脚本，不参与小程序运行。
 */
'use strict';

const path = require('path');

function sleep(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function setByPath(target, keyPath, value) {
  const parts = String(keyPath).split('.');
  let cursor = target;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    if (cursor[key] === null || typeof cursor[key] !== 'object') cursor[key] = {};
    cursor = cursor[key];
  }
  cursor[parts[parts.length - 1]] = value;
}

/**
 * 安装全局桩并返回运行时工具
 * @param {Object} options { root: Xiaolian 仓库根目录 }
 */
function createRuntime(options) {
  const root = options.root;
  const miniRoot = path.join(root, 'mini-program');
  const storage = {};
  const calls = {
    navigateTo: [],
    switchTab: [],
    navigateBack: [],
    redirectTo: [],
    reLaunch: [],
    showToast: [],
    showModal: [],
    pageScrollTo: [],
    stopPullDownRefresh: 0
  };

  function record(list, payload) {
    list.push(payload);
  }

  global.wx = {
    getStorageSync(key) {
      return Object.prototype.hasOwnProperty.call(storage, key) ? storage[key] : '';
    },
    setStorageSync(key, value) {
      storage[key] = value;
    },
    removeStorageSync(key) {
      delete storage[key];
    },
    clearStorageSync() {
      Object.keys(storage).forEach(function (key) {
        delete storage[key];
      });
    },
    getStorageInfoSync() {
      return { keys: Object.keys(storage), currentSize: 0, limitSize: 10240 };
    },
    showToast(options) {
      record(calls.showToast, options || {});
    },
    hideToast() {},
    showLoading() {},
    hideLoading() {},
    showModal(options) {
      record(calls.showModal, options || {});
      // 预览脚本不模拟用户确认：异步走取消分支，避免依赖弹窗结果的逻辑挂起
      if (options && typeof options.success === 'function') {
        setTimeout(function () {
          options.success({ confirm: false, cancel: true });
        }, 0);
      }
    },
    navigateTo(options) {
      record(calls.navigateTo, (options && options.url) || '');
    },
    redirectTo(options) {
      record(calls.redirectTo, (options && options.url) || '');
    },
    reLaunch(options) {
      record(calls.reLaunch, (options && options.url) || '');
    },
    switchTab(options) {
      record(calls.switchTab, (options && options.url) || '');
    },
    navigateBack(options) {
      record(calls.navigateBack, options || {});
    },
    stopPullDownRefresh() {
      calls.stopPullDownRefresh += 1;
    },
    pageScrollTo(options) {
      record(calls.pageScrollTo, options || {});
    },
    setTabBarBadge() {},
    removeTabBarBadge() {},
    nextTick(fn) {
      setTimeout(fn, 0);
    }
    // 注意：不提供 requestSubscribeMessage，用于走「订阅消息不可用 → 应用内提醒兜底」分支
  };

  const app = { globalData: { appName: '校练', version: '1.0.0' } };
  global.getApp = function () {
    return app;
  };

  let capturedPage = null;
  global.Page = function (pageObject) {
    capturedPage = pageObject;
  };
  global.Component = function () {};
  global.App = function () {};

  const pageCache = {};

  function requireMini(relPath) {
    return require(path.join(miniRoot, relPath));
  }

  /** 加载页面模块（返回 Page({...}) 捕获到的对象） */
  function loadPageObject(pageRel) {
    const jsPath = path.join(miniRoot, pageRel + '.js');
    delete require.cache[require.resolve(jsPath)];
    capturedPage = null;
    require(jsPath);
    if (!capturedPage) throw new Error('页面未调用 Page(): ' + pageRel);
    pageCache[pageRel] = capturedPage;
    return capturedPage;
  }

  /** 用页面对象创建可 setData 的实例（支持 'form.status' 这类路径 key） */
  function createPageInstance(pageObject) {
    const instance = {};
    Object.keys(pageObject).forEach(function (key) {
      if (key === 'data') return;
      instance[key] = pageObject[key];
    });
    instance.data = deepClone(pageObject.data || {});
    instance.setData = function (patch, callback) {
      Object.keys(patch || {}).forEach(function (key) {
        if (key.indexOf('.') >= 0) setByPath(instance.data, key, patch[key]);
        else instance.data[key] = patch[key];
      });
      if (typeof callback === 'function') callback();
    };
    return instance;
  }

  return {
    root: root,
    miniRoot: miniRoot,
    storage: storage,
    calls: calls,
    app: app,
    sleep: sleep,
    deepClone: deepClone,
    requireMini: requireMini,
    loadPageObject: loadPageObject,
    createPageInstance: createPageInstance,
    /** 清空 mock 存储（每个场景开始前调用，保证数据确定性） */
    clearStorage() {
      Object.keys(storage).forEach(function (key) {
        delete storage[key];
      });
    }
  };
}

module.exports = {
  createRuntime: createRuntime,
  sleep: sleep,
  deepClone: deepClone
};
