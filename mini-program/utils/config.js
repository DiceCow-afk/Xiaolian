/**
 * 校练小程序全局配置
 *
 * 联调真实后端时：
 *  1. 把 useMock 改为 false；
 *  2. baseURL 换成已完成 ICP 备案的 HTTPS 域名；
 *  3. 在微信公众平台「开发管理-服务器域名」中配置 request 合法域名；
 *  4. subscribeTmplIds 填入审核通过的订阅消息模板 ID。
 */
const config = {
  appName: '校练',
  version: '1.0.0',
  env: 'mock', // mock | dev | prod

  // 是否使用本地 mock 服务层（后端未就绪时保证可演示闭环）
  useMock: true,
  baseURL: 'https://api.xiaolian.example.com/api/v1',
  requestTimeout: 8000,

  // mock 模拟耗时（毫秒），让 loading / 降级态可以被观察到
  mockLatency: { min: 180, max: 520 },
  // 模拟大模型调用的耗时
  llmLatency: 1000,

  // 一次性订阅消息模板 ID（体育类个人主体通常只能拿到一次性订阅）
  // 为空时前端自动降级为「应用内提醒」，不会阻断打卡流程
  subscribeTmplIds: [],

  // 功能开关
  features: {
    llmParse: true, // 自然语言约束解析（失败自动降级表单）
    planExplain: true, // 计划解释（只读，不改动计划）
    demoFrames: true, // 关键帧示范播放
    demoVideo: false, // 短视频示范（资源就绪后开启）
    diet: true // 轻量饮食提示（拓展功能）
  },

  // 默认体测日期：今天 + 35 天（约 5 周，覆盖准备/进展/减量三个周期）
  defaultTestDateOffset: 35,

  // Schema 版本：前后端接口契约版本，冻结后变更需同步接口文档
  schemaVersion: '1.0',
  rulesVersion: '1.0'
};

module.exports = config;
