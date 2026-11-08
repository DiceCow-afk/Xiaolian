# tools/ui_preview —— 小程序 UI 近似预览工具

在没有微信开发者工具的环境下，把 `mini-program/` 的 WXML/WXSS 近似渲染成 HTML，用本机
headless Edge/Chrome（DevTools Protocol）按 **375×812 @2x** 截图，用于布局自检与交付预览。

> ⚠️ 这是近似预览，不是真机/开发者工具截图；渲染限制见 `docs/03-测试/UI预览/README.md`。

## 使用

```bash
# 在仓库根目录（Xiaolian/）执行
node tools/ui_preview/render.js

# 只渲染匹配关键字的场景
node tools/ui_preview/render.js --only plan,action

# 指定输出目录 / 浏览器 / 仅生成 HTML（无浏览器降级）
node tools/ui_preview/render.js --out ./.tmp/ui-preview
node tools/ui_preview/render.js --browser "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
node tools/ui_preview/render.js --no-browser
```

- 输出：`docs/03-测试/UI预览/page-*.png`、`overview.png`、`checks.json`
- 依赖：Node ≥ 18（fetch）；截图需 Node ≥ 22（WebSocket）。浏览器自动探测 Edge/Chrome，
  也可用 `--browser` 或环境变量 `UI_PREVIEW_BROWSER` 指定；找不到时降级为输出 HTML 到系统临时目录。
- 不联网：只访问本机 127.0.0.1 调试端口与 `file://` 本地资源。
- 本工具只写 `docs/03-测试/UI预览/` 与系统临时目录，不改动业务代码。

## 结构

```
tools/ui_preview/
├── render.js            # CLI 入口：场景驱动 → HTML 组装 → CDP 截图 → overview/checks
├── lib/
│   ├── runtime.js       # wx/Page/getApp 桩 + 页面实例 + setData 路径支持
│   ├── scenarios.js     # 14 个预览场景（mock 数据准备 + 页面交互驱动）
│   ├── wxml.js          # WXML 解析与近似渲染（wx:if/for/插值 + 原生标签近似，scroll-view 用 overflow:auto）
│   ├── components.js    # 8 个公共组件的近似渲染（按组件 WXML 结构 + 自有类名）
│   ├── css.js           # WXSS→CSS：rpx→px（1rpx=0.5px）、page→body、env() 归零
│   └── browser.js       # 浏览器探测 + 启动/关闭 + CDP 截图/滚动/执行脚本
└── README.md
```

## 扩展

- 新增页面状态：在 `lib/scenarios.js` 增加场景对象（`page/args/prepare/ready/drive/settle/scrollTo/scriptAfter`）。
- 组件结构大改：同步更新 `lib/components.js` 的近似渲染。
- 页面新增 WXML 语法：在 `lib/wxml.js` 中补充标签/指令支持（当前只覆盖项目实际用到的子集）。
- 需要滚动弹层/scroll-view 内部时：用场景的 `scriptAfter` 注入一小段 JS（示例见 `page-plan-explain-bottom`）。
