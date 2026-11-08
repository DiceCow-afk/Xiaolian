/**
 * 统一请求封装
 *  - 统一 baseURL / 超时 / loading / 错误码处理
 *  - 统一解析后端 { code, data, msg }：code === 0 时 resolve(data)，否则 reject({ code, msg, data })
 *  - useMock = true 时走本地 mock 服务层，保证无后端也能演示完整闭环
 *  - 网络错误自动重试 1 次（仅 GET）
 */
const config = require('./config');
const mock = require('./mock');

const LLM_PATHS = ['/profile/parse', '/plan/explain'];
let loadingCount = 0;

function isLlmPath(url) {
  return LLM_PATHS.some(function (prefix) {
    return String(url).indexOf(prefix) === 0;
  });
}

function randomBetween(min, max) {
  return Math.round(min + Math.random() * (max - min));
}

function showLoading(text) {
  loadingCount += 1;
  try {
    wx.showLoading({ title: text || '加载中', mask: true });
  } catch (e) {}
}

function hideLoading() {
  loadingCount = Math.max(0, loadingCount - 1);
  if (loadingCount === 0) {
    try {
      wx.hideLoading();
    } catch (e) {}
  }
}

function toastError(err) {
  const msg = (err && (err.msg || err.message)) || '请求失败，请稍后重试';
  try {
    wx.showToast({ title: msg, icon: 'none', duration: 2400 });
  } catch (e) {}
}

/**
 * @param {Object} options
 * @param {string} options.url 相对路径，如 /plan/generate
 * @param {string} [options.method] GET/POST
 * @param {Object} [options.data]
 * @param {boolean} [options.loading] 是否展示 loading
 * @param {string} [options.loadingText]
 * @param {boolean} [options.silent] 是否静默处理错误（由页面自行降级）
 * @param {number} [options.retry] 网络错误重试次数，默认 GET 1 次
 */
function request(options) {
  const opts = Object.assign(
    {
      url: '',
      method: 'GET',
      data: null,
      header: {},
      loading: false,
      loadingText: '加载中',
      silent: false
    },
    options
  );
  const method = String(opts.method || 'GET').toUpperCase();

  return new Promise(function (resolve, reject) {
    if (opts.loading) showLoading(opts.loadingText);
    let settled = false;
    let loadingHidden = false;

    function finishLoading() {
      if (opts.loading && !loadingHidden) {
        loadingHidden = true;
        hideLoading();
      }
    }

    function settle(type, payload) {
      if (settled) return;
      settled = true;
      finishLoading();
      if (type === 'resolve') resolve(payload);
      else reject(payload);
    }

    function failWith(err) {
      if (!opts.silent) toastError(err);
      settle('reject', err);
    }

    /* ---------- mock 分支 ---------- */
    if (config.useMock) {
      const latency = isLlmPath(opts.url)
        ? config.llmLatency + randomBetween(0, 300)
        : randomBetween(config.mockLatency.min, config.mockLatency.max);
      setTimeout(function () {
        let resp = null;
        try {
          resp = mock.handle(method, opts.url, opts.data);
        } catch (e) {
          console.error('[mock] handler error', e);
          resp = { code: 5000, msg: '本地 mock 服务异常：' + (e && e.message ? e.message : '未知错误'), data: null };
        }
        if (!resp || typeof resp !== 'object') {
          resp = { code: 5000, msg: 'mock 返回格式错误', data: null };
        }
        if (resp.code === 0) {
          settle('resolve', resp.data);
        } else {
          failWith({ code: resp.code, msg: resp.msg || '操作失败', data: resp.data || null });
        }
      }, latency);
      return;
    }

    /* ---------- 真实网络分支 ---------- */
    const retryTimes = opts.retry !== undefined ? opts.retry : method === 'GET' ? 1 : 0;
    function doRequest(attempt) {
      wx.request({
        url: config.baseURL + opts.url,
        method: method,
        data: opts.data || {},
        timeout: config.requestTimeout,
        header: Object.assign(
          {
            'content-type': 'application/json',
            'X-Client': 'miniprogram',
            'X-Client-Version': config.version,
            'X-Schema-Version': config.schemaVersion
          },
          opts.header
        ),
        success: function (res) {
          const body = res && res.data;
          if (res.statusCode === 200 && body && typeof body === 'object' && body.code === 0) {
            settle('resolve', body.data);
            return;
          }
          // 后端统一错误码
          if (body && typeof body === 'object' && body.code !== undefined) {
            if (body.code === 1002) {
              // 未登录：清理本地会话，由页面引导重新进入
              console.warn('[request] 未登录或登录过期');
            }
            failWith({ code: body.code, msg: body.msg || '服务返回异常', data: body.data || null });
            return;
          }
          failWith({ code: res.statusCode >= 500 ? 5000 : 1001, msg: '服务异常（HTTP ' + res.statusCode + '）', data: null });
        },
        fail: function (err) {
          if (attempt < retryTimes) {
            setTimeout(function () {
              doRequest(attempt + 1);
            }, 600);
            return;
          }
          console.error('[request] network fail', opts.url, err);
          failWith({ code: 5000, msg: '网络连接失败，请检查网络后重试', data: null });
        }
      });
    }
    doRequest(0);
  });
}

function get(url, data, options) {
  return request(Object.assign({ url: url, method: 'GET', data: data }, options || {}));
}

function post(url, data, options) {
  return request(Object.assign({ url: url, method: 'POST', data: data }, options || {}));
}

/** 统一错误提示工具（页面降级时使用） */
function showError(err, fallback) {
  const msg = (err && (err.msg || err.message)) || fallback || '操作失败，请稍后重试';
  try {
    wx.showToast({ title: msg, icon: 'none', duration: 2400 });
  } catch (e) {}
}

module.exports = {
  request: request,
  get: get,
  post: post,
  showError: showError
};
