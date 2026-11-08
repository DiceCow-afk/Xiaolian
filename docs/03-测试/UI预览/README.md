# 「校练」小程序 UI 近似预览

> **重要声明：本目录的 PNG 不是真机截图，也不是微信开发者工具截图。**
> 它们由 `tools/ui_preview/render.js` 把页面的 WXML/WXSS 近似渲染成 HTML，再用本机 headless
> Edge/Chrome 按 **375×812 逻辑分辨率 @2x（实际 750×1624 px）** 截取，只用于**布局与视觉自检**
> 以及无开发者工具环境下的交付预览。最终验收请以真机 / 微信开发者工具为准。

- 生成脚本：`tools/ui_preview/render.js`
- 生成环境：Windows 11 · Node v24.21.0 · Microsoft Edge 157.0.4341.42（headless / CDP）· 2026-11-08（task-9 视觉修复后重跑）
- 数据来源：仓库内 `mini-program/utils/mock.js` 本地 mock 层（真实页面 JS + mock 数据，非手写假数据）
- 视口：375×812 @2x（`deviceScaleFactor=2`，输出 750×1624）；顶部/底部为模拟的原生状态栏、导航栏、tabBar

## 一、如何重新生成

```bash
# 在仓库根目录执行（默认输出到本目录）
node tools/ui_preview/render.js

# 只渲染名字包含 plan / action 的场景
node tools/ui_preview/render.js --only plan,action

# 指定输出目录（调试用）
node tools/ui_preview/render.js --out ./.tmp/ui-preview

# 无浏览器环境：只生成 HTML（用于人工在浏览器打开检查）
node tools/ui_preview/render.js --no-browser
```

依赖与降级：

- Node ≥ 18（脚本使用 `fetch`）；CDP 截图需要 Node ≥ 22（全局 `WebSocket`）。
- 自动探测本机 Edge / Chrome（常见安装路径 + `PATH`）；也可显式指定：

  ```bash
  node tools/ui_preview/render.js --browser "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
  # 或设置环境变量
  set UI_PREVIEW_BROWSER=C:\Program Files\Google\Chrome\Application\chrome.exe
  ```

- 找不到浏览器 / Node 不支持 WebSocket / CDP 启动失败时：脚本仍会把自包含 HTML 预览写到系统临时目录
  并打印路径（不生成 PNG），可用任意浏览器打开人工检查；不会联网下载任何东西。
- 脚本只写入本目录（`*.png`、`checks.json`）与系统临时目录；**不改动任何业务代码**。

## 二、截图清单（14 张页面 + 1 张总览）

| 文件 | 页面 | 状态 / 场景 |
|---|---|---|
| `page-constraints-form.png` | 约束输入（入口页） | 无画像首次进入：橙色 hero + AI 一句话填表 + 基本信息表单 |
| `page-constraints-parsed.png` | 约束输入 | AI 解析成功：示例文本回填表单，显示「已识别」与置信度、高亮字段 |
| `page-plan-4weeks.png` | 计划展示（tab 0） | 正常 4 周计划：深色 hero（距体测/4 项统计）+ 8 周切换器 + 周概览 + 训练日列表 |
| `page-plan-empty.png` | 计划展示 | 无计划空态：empty-state + 「去填写约束」出口 |
| `page-plan-stale.png` | 计划展示 | stale 提示条 + 「约束已修改，当前计划待重算」提示条（含重新生成/重算按钮） |
| `page-plan-explain.png` | 计划展示 | 「为什么这样安排？」AI 解释底部弹层（只读声明、loading 后按段渲染），底部渐隐 +「↓ 下滑查看完整解释」提示 |
| `page-plan-explain-bottom.png` | 计划展示 | 解释弹层滚到底：最后一行完整可见，底部渐隐与「下滑查看」提示已收起（P2-1 修复验证） |
| `page-action-frames.png` | 动作示范（详情页） | frames 类型：透明底关键帧播放器（暂停按钮/帧计数/圆点）+ 膝盖禁忌提示；hero 空间只显示「宿舍 / 室内 等多场景」 |
| `page-action-text.png` | 动作示范 | text 类型：placeholder + 「暂无视频示范，以下为图文要点」，无播放控件 |
| `page-checkin-today.png` | 提醒打卡（tab 1） | 今日训练卡（动作勾选清单）+ 打卡表单（滚动至今日训练卡） |
| `page-checkin-checked.png` | 提醒打卡 | 已打卡回显：勾选全部动作 + RPE/膝盖不适提交后的安全复查卡、打卡历史（滚动至提交区） |
| `page-feedback-form.png` | 周反馈（tab 2） | 本周数据统计 + 反馈表单（蓝色 hero、周切换器） |
| `page-feedback-result.png` | 周反馈 | 提交后调整结果卡：命中规则 ADJ-01、预设规则分支说明、下周预览 plan-card（滚动至结果卡） |
| `page-diet-tips.png` | 饮食提示（tab 3） | 已选食物后的蛋白质/碳水两个维度提示（滚动至提示卡） |
| `overview.png` | 总览 | 8 个关键页面拼图（1160×1400，含标题与场景说明） |
| `fix-compare.png` | - | task-9 修复前后对照：解释弹层截断 / 动作 hero 空间信息 / 周切换字号（三组 before-after） |
| `checks.json` | - | 每个场景的自动布局检查原始结果（横向溢出 / 破图 / 疑似截断 / hero 重叠 / 吸底栏位置） |

`overview.png` 选取：约束解析、计划正常/空态/stale、动作关键帧、打卡今日、反馈结果、饮食提示，共 8 格。

## 三、自动自检结果（本轮生成）

脚本在截图前会在页面内执行一次布局检查，结果同时写入 `checks.json`：

| 检查项 | 结果 |
|---|---|
| 375pt 下横向溢出（`.pv-page` 内元素超出内容视口） | **14/14 场景 0 处** |
| 破图（`img.complete && naturalWidth === 0`） | **0 张** |
| 疑似文字截断（`overflow:hidden` + `nowrap/ellipsis` 且内容超宽） | **0 处** |
| 页面出现 `undefined` / `NaN` 文本 | **0 处** |
| hero 与 content 重叠量 | **24 px**（设计值：`app.wxss .content { margin-top: -48rpx }`，即 -24px，符合预期） |
| 吸底栏（`.bottom-bar`）位置 | 约束输入/动作示范：`top≈747~749 / bottom=812`（内容视口底部），并且页面末尾有 `.bottom-placeholder` 留白，未遮挡内容 |
| 图片资源 | 关键帧 / placeholder / tabBar 图标全部加载成功（file:// 本地资源） |

> 自动检查只覆盖「几何溢出/资源加载/文本缺失」这类硬问题；颜色对比、层级、留白等仍需人工看图。

## 四、视觉问题清单（task-9 修复后更新）

> 逐张检查 14 张截图后的结论。**P1 = 阻断（破版/遮挡/不可读）；P2 = 明显瑕疵，建议修；P3 = 可选优化。**
> 本工具不改页面代码；修复由对应页面 owner 在 `pages/` 内完成。

- **P1：无。**
- **已修复（task-9，page-b）**
  - **P2-1 计划解释弹层正文截断无提示** → 修复为：滚动区底部渐隐遮罩 + 「↓ 下滑查看完整解释」提示 + 正文
    `padding-bottom: 96rpx`；滚动后提示收起，滚到底后渐隐收起、最后一行完整可见。
    证据：`page-plan-explain.png`（顶部态：渐隐+提示）、`page-plan-explain-bottom.png`（滚到底：末行完整）。
  - **P2-2 动作示范页 hero「空间」元信息过长** → hero 只展示 1 个代表空间（优先当前画像空间，动作不支持时
    退回动作首个空间）并加「等多场景」，完整 `space_labels` 保留在下方「动作信息」卡，375pt 下 hero 三个
    元信息块可同行展示，「组次」不再换行。证据：`page-action-frames.png` / `page-action-text.png`。
  - **P3-2 周切换器阶段短标签字号偏小** → 20rpx → 22rpx。证据：`page-plan-4weeks.png`。
- **仍待处理（由 Lead / 其它页面 owner 处理）**
  - **P3-1 打卡页动作勾选圆圈对比度偏低**（checkin 页）：未勾选圆圈白底浅描边，在 `#f7f9fc` 卡片上几乎不可见。
  - **P3-3 饮食提示页「实际 vs 目标」数值层级不突出**（diet 页）：建议实际值用品牌色/加粗。
  - **P3-4 周反馈调整结果卡信息层级可再强化**（feedback 页）：命中规则、摘要、下周预览之间可加色条/分隔。
  - **P3-5 动作页底部左按钮文案「返回」与规范 7.3「返回计划」不一致**：Lead 已确认保留「返回」（更符合
    navigateBack 语义），规范文档将同步更新，不再作为问题。

## 五、近似渲染的限制 / 无法覆盖的状态

本工具不是小程序运行时，以下内容与真机存在差异，看图时请勿据此判定缺陷：

1. **原生控件是近似画出来的**：`switch` / `picker` / `slider`（RPE 滑条）/ `input` / `textarea` 用 HTML 近似，
   字体、默认高度、iOS/Android 差异与真机不同；RPE 滑条仅静态还原当前值。
2. **不执行交互与动画**：下拉刷新动画、toast、loading 蒙层、showModal、组件内部动画（如 skeleton）不渲染；
   `fade-in` / `slide-up` 会等待动画结束后再截图；`scroll-view` 用 `overflow:auto` 近似，弹层内部滚动通过
   场景 `scriptAfter` 注入脚本模拟（见 `page-plan-explain-bottom.png`）。
3. **组件样式隔离被合并**：预览把 `app.wxss`、页面 wxss、组件 wxss 合并进同一份 CSS（真机组件是 `styleIsolation: isolated`），
   因此组件内部可能继承到少量全局样式；本轮未发现因此产生的可见差异。
4. **安全区 env() 统一按 0 处理**：底部 home indicator 是模拟绘制，真机 iPhone 的 `env(safe-area-inset-bottom)` 会把
   吸底按钮再抬高约 34px；预览里 home indicator 与按钮的叠压属于预览差异。
5. **字体不同**：Windows 下中文回退字体与 iOS PingFang SC / Android 字体不同，字宽会产生 ±几 px 差异。
6. **导航栏 / tabBar 是模拟的**：标题、返回箭头、tabBar 图标取自 `app.json` 与 `assets/icons`；约束输入页作为入口页
   在真机冷启动时没有返回箭头，预览统一画了返回箭头。
7. **未覆盖的动态态**（本轮跳过，如需可在 `tools/ui_preview/lib/scenarios.js` 增加）：
   - 打卡页「休息日」卡（需要伪造系统日期；本轮改用「已打卡态」覆盖打卡后逻辑）。
   - 约束输入页 AI 解析失败降级态、计划页/动作页接口错误态（需要注入 mock 失败，避免改动 mock 数据逻辑）。
   - 周反馈「已反馈周回显/更新反馈」中间态、多条历史记录态。
   - 首次加载 loading 态、空数据以外的骨架屏。
8. **mock 数据固定**：画像为「男生 / 1000m+跳远+引体 / 弱基础 / 弹力带 / 宿舍 / 30 分钟 / 每周 3 次 / 膝盖限制」，
   体测日 = 今天 + 35 天，因此计划阶段为「进展→进展→减量→减量」；真机换画像后内容会不同，仅用于布局检查。

## 六、维护说明

- 页面 WXML/WXSS 改动后，重新运行 `node tools/ui_preview/render.js` 即可刷新截图。
- 新增预览场景：在 `tools/ui_preview/lib/scenarios.js` 里追加场景对象
  （`prepare` 构造 mock 数据、`args` 传给 `onLoad`、`ready/settle` 轮询页面状态、`scrollTo` 截图前滚动位置）。
- 组件 WXML 结构大改时：同步更新 `tools/ui_preview/lib/components.js` 中对应组件的近似渲染。
- `checks.json` 结构：`{ generatedAt, viewport, checks: { <场景名>: { overflowX, overflowCount, brokenImages, clippedText,
  undefinedText, heroContentOverlap, bottomBar, pageHeight, viewportHeight, scrollTop, ... } } }`。
