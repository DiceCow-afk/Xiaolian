# 「校练」QA 终检报告（六页面验收 · 跨页闭环 · 边界回归）

> 项目：校练 · 面向校园约束场景的大学生体测训练计划小程序（微信原生 + mock 数据层）
> 报告类型：task-7 QA 终检报告
> 编写：QA（qa-review） · 日期：2026-11-08 · 快照时间：2026-11-08 16:30（Asia/Shanghai，含「终检后变更」最终复验）
> 配套：[前端实现规范](../01-前端/前端实现规范.md) · [接口契约](../02-接口/接口契约.md) · [QA 基线报告](./QA基线报告.md)
> 验收对象：6 个页面（24 个文件）、8 个公共组件（32 个文件）、`app.*` / `project.config.json` / `sitemap.json`、`assets/`（34 PNG）、`utils/`、`data/`、`docs/`。
> 说明：本轮只写 `docs/03-测试/`（报告 + UI 预览产物来自 task-8 工具）；顺带增强了 `tools/simulate.js` 的回归断言（新增 §11 计划重算数据隔离、OBS-05/08 回归项）；**未修改任何业务代码**。

---

## 1. 结论摘要

| # | 检查项 | 结果 | 退出码 |
|---|---|---|---|
| 1 | 静态校验 `tools/validate-miniprogram.js --strict` | **456 项通过 / 0 ERROR / 0 WARN / 0 WIP** | 0 |
| 2 | mock 页面级闭环 `tools/simulate.js` | **339 项断言通过 / 0 失败 / 1 条已知限制（观察）** | 0 |
| 3 | mock 服务层回归 `tools/smoke_test.js` | **67 / 67 通过** | 0 |
| 4 | 页面级运行时 harness `tools/page_harness.js` | **58 / 58 通过** | 0 |
| 5 | QA 补充页面边界验证（ad-hoc，基于 page_harness stub） | **115 / 115 通过**（5 组场景） | 0 |
| 6 | UI 近似预览（task-8/9 工具，page-b 主责，QA 辅助） | **14 / 14 场景渲染成功；横向溢出 0、破图 0、截断 0、undefined 文本 0** | 0 |

**终检结论：通过，可进入演示/答辩交付。**

- 6 个页面全部存在并通过静态校验；规范第 7/9 节逐项验收通过（详见第 3 节）；
- 跨页闭环「约束→诊断→计划→示范→打卡→周反馈→饮食」全链路数据与跳转正确；
- 边界路径（无计划/休息日/空周/stale/重复打卡/无打卡反馈/3001/1003/2001 代码路径/错误态重试/计划重算数据隔离）均未白屏、未抛未捕获异常；
- **终检期间发现并修复 1 个 P2（计划重算后旧打卡/周反馈跨计划污染）**，Lead 修复后 QA 复验通过，并已加入 simulate 回归锚点（§11，13 项断言）与页面级边界断言（场景 E）；
- **P3 共 7 项修复**（定时器清理 ×2 页、空周文案、返回按钮文案、OBS-05 权重残差、OBS-08 日期格式、OBS-09 打卡按计划 upsert、OBS-10 今日打卡按计划回显），另有 Lead/page-b 的 4 项视觉与文档修复（打卡勾选对比度、饮食数值层级、计划解释弹层体验、动作 hero 空间文案收敛）；
- **P1 = 0，P2 = 0（已修复）**；剩余 1 条文案级建议 + 2 条 Lead 决定保留的建议 + 3 条已知限制/已批准偏差，均不阻塞演示（详见第 7 节与第 10 节「终检后变更」）。

---

## 2. 验收范围与方法

### 2.1 范围

| 层面 | 文件 | 验收内容 |
|---|---|---|
| 页面 | `pages/constraints`、`plan`、`action`、`checkin`、`feedback`、`diet` 各 4 件套 | 规范 §7 页面规格 + §9 验收清单、三态/校验/跳转/降级/下拉刷新/定时器/素材/配色/事件绑定/数据来源 |
| 组件 | `components/` 8 个公共组件 | 规范 §4 API（properties/events/styleIsolation）与页面调用一致性 |
| 全局 | `app.js/app.json/app.wxss`、`project.config.json`、`sitemap.json`、`assets/` | 页面清单、tabBar、设计系统、启动逻辑、资源完整性 |
| 数据/工具 | `utils/`、`data/`（仅验收，不改） | 接口契约、错误码、安全不变量、重算隔离等回归 |
| 文档 | `docs/01`、`docs/02` | 实现与规范/契约一致性 |

### 2.2 依据

- `docs/01-前端/前端实现规范.md` 第 7 节（6 页面详细规格）与第 9 节（每页验收清单）；
- `docs/02-接口/接口契约.md`（15 接口、错误码、Schema v1.0）；
- `docs/03-测试/QA基线报告.md`（基线结论与已知限制）；
- 微信小程序 WXML/WXSS/JSON 语法与页面生命周期约束。

### 2.3 方法

1. **静态校验**：`validate-miniprogram.js --strict`（14 类检查，含 JS 语法、JSON、四件套、usingComponents、WXML 闭合/事件处理函数、WXSS、require 依赖、PNG/资源、动作库数据、页面规范抽查、编码约定）；
2. **API 层闭环回归**：`simulate.js`（10+1 章断言，stub wx 后只经 `utils/api.js`）；
3. **服务层回归**：`smoke_test.js`；
4. **页面级运行时**：`page_harness.js`（直接 require 页面并驱动生命周期/交互）；
5. **QA 补充边界验证**（临时 ad-hoc 脚本，不入库，基于 page_harness 的 wx/Page stub）：空数据、跨页闭环、stale/休息日/空周、重复提交、降级路径、错误态重试、计划重算数据隔离等 115 项页面级断言；
6. **视觉近似验收**：task-8/9 的 `tools/ui_preview/render.js`（page-b 主责）在 375×812@2x 下渲染 **14 个页面场景 + overview**（最终复跑 16:27，含计划解释弹层底部场景），QA 辅助执行并读取 `checks.json`（横向溢出/破图/undefined 文本/文本截断）作为布局自检证据。

### 2.4 环境与边界

- Node `v24.21.0 / win32`（DSH 运行时自带 Node），无微信开发者工具；
- **真机/开发者工具视觉未验证**（本机无 DevTools；UI 近似预览不等同真机，见 7.3 已知限制）；
- 真机风险项（订阅消息弹窗、安全区、字体缩放、360dp 窄屏、图片真实加载失败）列入第 9 节演示前检查清单。

---

## 3. 逐页验收结果（规范 §7 / §9）

> 图例：✓ 通过；△ 通过但有备注；— 不适用。每页均满足：数据来自 `utils/api.js`、无页面 require mock/request、无直连 storage、无 `?.`/`??`、无 console.error、事件绑定全部可对应 JS 方法（静态校验 456 项覆盖）。

### 3.1 约束输入页 `pages/constraints`（入口页，非 tab）

| 验收项 | 结论 | 证据 / 备注 |
|---|---|---|
| 页面 json：标题/导航色/白字 | ✓ | 「填写训练约束」/ `#FF6B2C` |
| hero-orange + kicker/title/sub/meta | ✓ | meta「4 周 / 4 类 / 安全」与规范一致 |
| 三态（loading/error+重试/done） | ✓ | `<state-view bindretry="loadProfile">`；ad-hoc 空数据场景通过 |
| AI 自然语言卡（300 字、字数、示例、解析 loading、成功回填+高亮+toast） | ✓ | border 场景：示例文本解析 6 项回填（含「每周次数」）、高亮 6 秒定时器、onHide/onUnload 清理 |
| AI 解析失败 3001 内联降级不阻塞 | ✓ | ad-hoc D 组：`parseFailText` 展示、表单仍可提交（done 态） |
| 6 类表单卡：性别/基础/项目≤3+档位+阈值/目标/日期(picker 7-180)/器械互斥/空间/时长/频次 stepper/身体限制互斥 | ✓ | WXML/JSON/组件调用逐项核对；tag-picker `exclusive-value` 与 `max` 使用正确 |
| 表单内联校验（validators.validateProfile + 逐字段错误 + 首错滚动） | ✓ | ad-hoc D：空表单提交产生 ≥8 个字段错误、无请求、toast+pageScrollTo |
| 吸底提交栏（loading 禁用、免费/无需手机号文案） | ✓ | `.bottom-bar` + `.bottom-placeholder`，提交中 `btn-disabled` |
| 提交流程：submitProfile→getDiagnosis→generatePlan→switchTab plan | ✓ | page_harness §16 与 ad-hoc B 组：画像/计划落库且切到计划 tab |
| 已有画像：edit=1 预填 / 冷启动回计划页 / 无计划留在本页 | ✓ | ad-hoc B/D：编辑态预填、冷启动 switchTab、无计划冷启动 coldTip |
| 2001 降级（modal「返回修改 / 仅保存画像」+ 空态出口） | ✓（代码路径） | ad-hoc D 直接驱动 `handleSubmitError(2001)`：modal 弹出、确认后 `planBlocked` 空态、可收起定位器械；**mock 数据不可达（见已知限制）** |
| 下拉刷新 | — | 规范未要求（非 tab 入口页） |

### 3.2 计划展示页 `pages/plan`（tab 0）

| 验收项 | 结论 | 证据 / 备注 |
|---|---|---|
| json：标题/导航色/`enablePullDownRefresh:true` | ✓ | 「训练计划」/ `#172033` |
| hero-dark：距体测 D-N、第 N 周·阶段、本周重点、4 项 meta | ✓ | 4weeks 场景：D-35 / 第 1 周·进展期 / 3 练·30 分钟·0/3 次·18 条 |
| 三态 + 无计划 empty-state + 出口 | ✓ | 空态场景通过；`<empty-state bindaction="goConstraints">` |
| stale 提示条 + 重新生成出口 | ✓ | ad-hoc C：stale=true/daysOld=2、内容不白屏；stale 场景截图 |
| 约束已改未重算提示（store.isProfileDirty） | ✓ | 场景 `page-plan-stale` 同时展示两条提示条 |
| 4 周切换器（阶段短标签 + 当前周圆点） | ✓ | 周切换交互通过（activeWeek 0→1） |
| 周概览卡（阶段徽标/日期范围/目标完成/重点/说明） | ✓ | `date_range_text` 回归锚点（Lead 修复过 dateRangeText） |
| plan-card 列表 + actiontap 跳动作页 + checkin 写 pendingCheckinSessionId 后 switchTab | ✓ | page_harness §11 + ad-hoc B：跳转 URL、跨页状态、switchTab 全部正确 |
| safety-banner（有拦截展示、可折叠） | ✓ | 膝盖画像 18 条拦截正常展示 |
| 计划解释弹层（只读、loading/error+重试、按 \n 分段、缓存、失败不阻塞） | ✓ | ad-hoc D：monkeypatch 解释 3001 → 弹层降级文案 + 可重试 + 可关闭；正常路径 checks.plan_unchanged=true（simulate §3）；task-9 视觉修复：内容区渐隐 + 「下滑查看完整解释」提示 + 底部留白（plan.wxml:174-194 / plan.js:76-77） |
| 重新生成计划（确认 modal → 诊断+生成 → 刷新；2001/1003 引导） | ✓ | ad-hoc C：确认后调用；2001 分支弹「可用动作不足」引导 |
| 空周兜底（体测日截断 3/1/0/0） | ✓ | 7 天计划切到第 4 周：`session_count=0`，展示「本周没有训练安排（体测日临近时…）」不崩 |
| 下拉刷新 + stopPullDownRefresh | ✓ | ad-hoc C：刷新后 stop 调用、无异常 |
| 定时器清理 | ✓ | 本页无 setInterval/setTimeout |

### 3.3 动作示范页 `pages/action`（详情页）

| 验收项 | 结论 | 证据 / 备注 |
|---|---|---|
| json：标题/导航色 | ✓ | 「动作示范」/ `#172033` |
| onLoad 取 id → getAction；缺 id / 1003 错误态 + 返回出口 | ✓ | ad-hoc A：缺 id/不存在均 error 态 + 文案；错误态「返回」按钮 + 重试 |
| hero-dark：kicker 难度、动作名、能力维度、器械/空间/组次 meta | ✓ | frames 场景截图逐项核对；task-9 视觉修复：多空间动作 hero 收敛为「宿舍 / 室内 等多场景」（action.js:229-248） |
| 关键帧播放器：自动播放 500ms、播放/暂停、帧指示 1/N、圆点切帧、`binderror` 两级兜底 | ✓ | ad-hoc B：播放推进、圆点、onHide 暂停/清理、onShow 恢复、onUnload 清理；图文动作（lunge/pushup）无播放控件 |
| 图文兜底类型（占位图 + 「暂无视频示范」） | ✓ | action-text 场景截图通过 |
| 当前画像禁忌警示 + 降阶入口 | ✓ | 膝盖画像 squat：conflict/conflict_labels 正确、降阶按钮可跳转；无降阶动作（chair_squat）toast 提示 |
| 动作信息（维度彩点/器械/空间/难度/组次） | ✓ | 信息行完整，无 undefined |
| 5 分段内容（要点+呼吸+安全提示/步骤时间线/常见错误/正误对比/替代动作） | ✓ | 事件切换通过；替代动作 pill 可跳转 |
| 底部吸底：返回 + 去打卡 | ✓ | 「返回」navigateBack + fail 兜底 switchTab（已按 Lead 修复文案）；去打卡 switchTab 正确 |
| 图片兜底、无破图 | ✓ | UI 预览 brokenImages=0；binderror 逻辑 ad-hoc 验证 |
| 播放定时器清理（规范 8.6 / §9） | ✓ | onHide/onUnload 双清理；无泄漏 |
| 下拉刷新 | — | 规范未要求 |

### 3.4 提醒打卡页 `pages/checkin`（tab 1）

| 验收项 | 结论 | 证据 / 备注 |
|---|---|---|
| json：标题/导航色/`enablePullDownRefresh:true` | ✓ | 「提醒与打卡」/ `#FF6B2C` |
| hero-orange：今日训练/休息日、sub、连续打卡/本周完成/订阅额度 | ✓ | today 场景截图核对；meta 3 项 |
| 三态 + 无计划 empty-state | ✓ | ad-hoc A：无计划 done + 空状态、无异常 |
| 提醒设置卡：switch、时间 picker、订阅授权、模板未配置兜底说明、服务端 cron、下一训练日 | ✓ | page_harness §13：开关/时间写入 store；ad-hoc C：`onSubscribeTap` 降级不卡住、modal 兜底说明 |
| 今日训练卡：训练信息、动作逐行勾选、计数、已有打卡回显（更新打卡）、休息日卡+出口 | ✓ | ad-hoc B：勾选/提交/回显/更新；C：休息日 hero + 下一训练日 + goPlan |
| 打卡表单：状态 cards、RPE slider、不适互斥+说明 input、备注 100 字、validators 校验、提交 loading | ✓ | ad-hoc D：缺状态内联错误 + toast、不落库；不适提交展示安全复查卡；勾选对比度已提升（Lead 视觉 P3，checkin.wxss:165-182） |
| 提交后 safety_review 展示、100% 完成去写反馈入口 | ✓ | checkin-checked 场景：安全提示卡 + 标签；`weekCompletionTip` 逻辑核对 |
| 打卡历史最近 10 条 + 空态 | ✓ | 场景核对；重算后历史按当前计划过滤（Lead 设计取舍，见 7.2） |
| pendingCheckinSessionId 消费（今日定位/非今日定位卡/失效提示） | ✓ | page_harness §5 + ad-hoc C/D：三种分支均验证 |
| 重复提交打卡（同 session upsert，不产生重复记录/统计不虚高） | ✓ | page_harness §13 + ad-hoc C：二次提交仍 1 条、状态更新 |
| 下拉刷新 + stopPullDownRefresh | ✓ | ad-hoc C：刷新 stop 正常 |
| 定时器清理 | ✓ | `_scrollTimer` 在 onHide/onUnload 清理（终检期间修复） |
| tab 页 onShow refreshBadge | ✓ | 静态校验 + 运行期无异常 |

### 3.5 周反馈页 `pages/feedback`（tab 2）

| 验收项 | 结论 | 证据 / 备注 |
|---|---|---|
| json：标题/导航色/`enablePullDownRefresh:true` | ✓ | 「周反馈」/ `#2F5BEA` |
| hero-blue：kicker 周次·阶段·状态、title/sub、完成率/RPE/不适/连续打卡 meta | ✓ | feedback-form 场景截图核对（33% / 7 / 0 / 1） |
| 三态 + 无计划 empty-state | ✓ | ad-hoc A：无计划 done + empty-state |
| 周切换器（1-4 周，已反馈/待反馈） | ✓ | page_harness §14 + ad-hoc B：切换、已反馈标记正确 |
| 统计卡（完成率进度、完成/部分/跳过/不适、平均 RPE、无打卡文案） | ✓ | 卡片数据与 mock 统计一致（completion_rate 两位小数 0.33→33%） |
| 反馈表单：完成率（有打卡只读/无打卡估算 tag-picker）、RPE、感受 cards、恢复 1-5、不适（有/无+自动）、备注 120、validators | ✓ | ad-hoc C：无打卡估算模式提交成功；D 组校验分支通过 |
| 调整结果卡：分支徽标、rule_id+condition_text、预设规则说明、摘要、下周预览 plan-card compact、available=false 文案、safety_changes/空文案、CTA | ✓ | feedback-result 场景：ADJ-01 减量徽标/规则/预览；7 条规则分支由 simulate §6 覆盖 |
| 已反馈周：结果卡展示 + 更新反馈（表单收起/展开回填） | ✓ | ad-hoc B：更新展开、重复提交记录仍 1 条、下周计划幂等 |
| 历史调整记录 + 空态 | ✓ | 场景核对；无记录时「还没有提交过周反馈…」 |
| 提交失败/校验降级 | ✓ | 内联 formErrors；无 plan 提交 1003（simulate） |
| 下拉刷新 + stop | ✓ | ad-hoc C：正常 |
| 定时器清理 | ✓ | `_scrollTimer` 在 onHide/onUnload 清理（终检期间修复） |
| tab 页 onShow refreshBadge | ✓ | 静态校验 + 运行期无异常 |

### 3.6 饮食提示页 `pages/diet`（tab 3，拓展）

| 验收项 | 结论 | 证据 / 备注 |
|---|---|---|
| json：标题/导航色/`enablePullDownRefresh:true` | ✓ | 「饮食提示」/ `#12B76A` |
| hero-green：kicker/title/sub、训练类型/蛋白/碳水/免责入口 meta | ✓ | diet-tips 场景截图核对 |
| 三态 + 空提示 empty-state | ✓ | 静态校验 + ad-hoc 空数据场景（无 plan 也能出基础提示） |
| 今日训练类型卡（训练日/休息日、关联 session、随类型变化说明、出口） | ✓ | 力量训练日 + session 标题；无 plan → 休息日、无白屏 |
| 食物选择卡（4 分类分组 tag-picker、多选、已选数、粗略摄入汇总、份数明细） | ✓ | page_harness §15 + ad-hoc B：选 egg/rice 后蛋白/碳水/热量与食物表一致 |
| 两维度提示卡（level 徽标、实际/目标/百分比、message、建议食物可加入） | ✓ | 10g/25g→40% 偏少；43g/90g→48% 偏少；建议食物一键加入并刷新；数值层级已提升（Lead 视觉 P3） |
| 免责声明卡 | ✓ | 含「不构成营养处方」；hero 免责入口 modal |
| 空选择也展示基础提示、局部刷新不整页 loading、下拉刷新 | ✓ | ad-hoc B/C：选择后局部刷新、下拉 stop 正常 |
| 未知食物 id 容错 | ✓ | simulate §7：忽略未知 id、不报错 |

---

## 4. 组件与全局验收

| 对象 | 结论 | 说明 |
|---|---|---|
| `plan-card` / `action-tag` / `rpe-slider` / `tag-picker` / `stepper` / `state-view` / `empty-state` / `safety-banner` | ✓ | properties/events 与规范 §4 冻结 API 一致；`styleIsolation: isolated`；事件 detail 字段与页面消费一致；WXML 内部事件与组件 JS 方法全部对应 |
| `app.js` | ✓ | onLaunch 初始化系统信息/匿名用户/globalData；onShow `reminder.refreshBadge()` 兜底 |
| `app.json` | ✓ | 6 页面顺序（入口 constraints）、4 tab（计划/打卡/反馈/饮食）、窗口色、sitemap；所有 tab 图标存在且 81×81 |
| `app.wxss` | ✓ | 设计令牌/hero/卡片/表单/按钮/底部栏/动画与规范 3.1 一致；页面/组件复用正常 |
| `project.config.json` / `sitemap.json` | ✓ | appid `wx9c4aac9029c3e66e`、compileType miniprogram、全部页面 allow |
| `assets/` | ✓ | 34 个 PNG 文件头有效；6 动作 ×4 关键帧 + 占位图 + 8 图标 + 分享封面齐全；WXML/app.json 引用均可解析（静态校验） |

---

## 5. 跨页闭环验收

链路：**约束输入 → 诊断 → 计划 → 动作示范 → 打卡 → 周反馈 → 饮食**（ad-hoc B 组 + page_harness §3-16 交叉验证）

| 步骤 | 期望 | 结果 |
|---|---|---|
| 约束表单提交 | submitProfile→getDiagnosis→generatePlan→toast→switchTab 计划页 | ✓ 画像/计划落库、跳转正确 |
| 计划页 | 4 周数据、hero/meta、周切换、plan-card 渲染 | ✓ 4 周/3 练/拦截数正确 |
| 计划页 → 示范页 | `navigateTo /pages/action/action?id=squat` | ✓ URL 正确、squat 详情/关键帧加载 |
| 计划页 → 打卡页 | 写 `globalData.pendingCheckinSessionId` + `switchTab`，打卡页消费并定位今日 | ✓ pending 消费/清空、今日训练卡定位 |
| 打卡提交 | done/partial/skipped、RPE、不适 → 统计/安全复查/计划内 session 状态回写 | ✓ 统计 0.33、safety_review、计划页 onShow 刷新后状态同步 |
| 打卡 → 周反馈 | stats/plan_summary 正确、完成率 33%、表单默认值取自打卡 | ✓ 提交命中 ADJ-02、结果卡/下周预览展示 |
| 周反馈 → 计划页 | 下周计划按调整写回；计划页可查看 | ✓ `is_preview` 写回、切换周可见 |
| 打卡/反馈 → 饮食 | 训练类型由计划推断（strength）、训练日卡关联今日 session | ✓ 饮食页训练日/维度/摄入联动 |
| 示范页 ↔ 打卡页 | 示范页「去打卡」switchTab 打卡页 | ✓ |

---

## 6. 边界与降级验收（含 P2 回归）

| # | 场景 | 期望 | 结果 |
|---|---|---|---|
| 1 | 无计划（4 数据页 + 约束页） | done+空态/引导，可回到约束页，不白屏 | ✓ ad-hoc A：计划/打卡/反馈/饮食/约束全部正常 |
| 2 | 计划 stale | stale 提示 + 重新生成出口，内容仍可读 | ✓ ad-hoc C |
| 3 | 休息日（今日无训练） | 打卡页休息卡、下一训练日、查看计划；饮食页休息类型 | ✓ ad-hoc C |
| 4 | 体测日 7 天（周训练日 3/1/0/0） | 空周不崩、周反馈空周可估算、无下周预览判定正确 | ✓ ad-hoc C：计划页空周提示、反馈页预览 available=false |
| 5 | 重复提交打卡（同 session） | 记录不重复、统计不虚高、状态更新 | ✓ page_harness §13 + ad-hoc C |
| 6 | 无打卡提交周反馈 | 估算完成率/tag-picker，可提交并生成调整结果 | ✓ ad-hoc C |
| 7 | 周反馈重复提交（更新） | 记录仍 1 条、下周计划不重复叠加（幂等） | ✓ simulate §6 + ad-hoc B（页面级） |
| 8 | AI 解析失败 3001 | 内联降级提示、表单不阻塞 | ✓ ad-hoc D |
| 9 | 解释失败 3001 | 弹层降级文案 + 重试，不阻塞 | ✓ ad-hoc D |
| 10 | 2001（无可用动作） | 约束页 modal 引导 + 空态出口；计划页重算引导；接口契约保留 | ✓ 代码路径验证（ad-hoc D）；mock 数据不可达（已知限制） |
| 11 | 1003 invalid id | 动作页错误态+返回；无计划接口空数据 | ✓ ad-hoc A / simulate §10 |
| 12 | 接口失败 → error 态 → 重试恢复 | 页面 error 态 + 重试后 done | ✓ ad-hoc C（计划页，GET 重试 1 次后降级 5000） |
| 13 | 下拉刷新（4 tab 页） | 重新拉取并 stopPullDownRefresh | ✓ ad-hoc C |
| 14 | **计划重算后旧记录隔离（P2 回归）** | 旧打卡/周反馈不污染新计划；新计划首次打卡正常 | ✓ 见 7.1；simulate §11 + ad-hoc E 双回归 |

---

## 7. 问题清单

### 7.1 终检期间发现并已修复（Lead 修复 → QA 复验通过）

| ID | 级别 | 问题 | 位置 | 修复 | 复验证据 |
|---|---|---|---|---|---|
| QA-FIX-06 | **P2** | **计划重算后旧计划打卡/周反馈跨计划污染**：新计划今日 session 为 pending，但打卡页回显旧「已打卡」、本周统计沿用旧记录（done=1/0.33）；周反馈页展示旧计划的已反馈结果卡且新计划第 2 周未按该反馈调整 | 根因：`mock.js:846` session_id 跨计划重复；`mock.js` computeWeekStats/AfterUpdate 仅按 week_no 过滤；`mock.js:1623/1685` + `store.js:183` 周反馈未按 plan 过滤；`checkin.js:196-204` 历史/回显未按 plan 过滤 | mock 打卡统计加 `c.plan_id === plan.plan_id`（兼容旧记录）；`getFeedbackByWeek/removeFeedbackByWeek(weekNo, planId)` 按计划过滤（history 同步过滤）；checkin 页 records 先按 plan_id 过滤再匹配 | 修复后：`GET /checkin` done=0/rate=0/records=0；`GET /feedback/weekly` record=null/history=0；plan2 第 2 周未被旧反馈调整；新计划首次打卡正常 1/3。**回归锚点**：`tools/simulate.js` §11（13 项断言）+ ad-hoc 场景 E（13 项页面级断言） |
| QA-FIX-07 | P3 | `checkin.js` scrollTo 的 setTimeout、`feedback.js` 两处 pageScrollTo 的 setTimeout 未清理（规范 8.6） | `checkin.js:405-413`、`feedback.js:435-442/545-552`（修复前） | 记录 `_scrollTimer`，新增 `clearScrollTimer()` 并在 onHide/onUnload 清理（现 `checkin.js:129-142/428-429`、`feedback.js:451-464/562-563`） | 静态校验 + ad-hoc 生命周期验证通过 |
| QA-FIX-08 | P3 | 计划页空周提示「下拉刷新试试」在体测日截断场景会误导 | `plan.wxml:116-118` | 改为「本周没有训练安排（体测日临近时，体测后的训练日已不再排布）」 | ad-hoc C 7 天场景确认文案 |
| QA-FIX-09 | P3 | 动作页「返回计划」使用 navigateBack，从打卡页等入口进入时实际返回上一页（文案/语义不一致） | `action.wxml:216/223` | 底部与错误态按钮文案改为「返回」（保持 navigateBack + fail 兜底 switchTab） | 静态校验 + ad-hoc 跳转验证通过 |
| QA-FIX-10 | P3 | 诊断 allocation 逐项 round1 后权重和可能为 0.9/1.1（OBS-05） | `mock.js:394-402` | 首项残差修正，权重合计严格 =1 | simulate §2 断言改为严格 =1 并通过 |
| QA-FIX-11 | P3 | 非法日期字符串提示「至少距今天 7 天」而非格式错误（OBS-08） | `validators.js:115-122` | 先判断日期可解析，非法格式提示「体测日期格式不正确（应为 YYYY-MM-DD）」 | simulate §2 新增回归断言通过 |
| QA-FIX-12 | P3 | `store.upsertCheckin` 仅按 session_id 去重（OBS-09）：重算计划后新计划同训练日打卡会覆盖旧计划历史记录 | `store.js:142-152`（修复前） | 去重键改为「plan_id + session_id」（兼容无 plan_id 的旧记录）；mock `latestCheckins` 去重键同步改为 `plan_id\|session_id`（mock.js:1145 起） | simulate §11：plan1 done + plan2 partial 后 records=2（历史保留）、当前计划统计 done=0/partial=1 |
| QA-FIX-13 | P3 | `store.getTodayCheckin` 仅按日期匹配（OBS-10）：重算后 tab 角标/今日回显仍误用旧计划记录 | `store.js:152-166`（修复前） | getTodayCheckin 内部读取当前计划并增加 plan_id 过滤（store.js:154-168） | simulate §11：重算后未打卡时返回 null、新计划打卡后返回新计划记录 |

### 7.2 剩余建议 / 观察（P3，不阻塞演示）

| ID | 问题 | 位置 | 建议 |
|---|---|---|---|
| QA-OBS-11 | 动作页「替代动作」为空时 empty-state 的 action-text 仍为「返回计划」 | `action.wxml:204` | 与底部按钮统一为「返回」；极小文案问题，可后续顺手改 |
| QA-OBS-04 | 动作升降阶引用非严格对称（13 处，已在基线报告记录） | `data/actions.js` | Lead 决定保留不改；动作页跳转不受影响 |
| QA-OBS-06 | `GET /diet/tips` 的 foods 数组序列化方式真实后端需确认 | `docs/02-接口/接口契约.md:122` | Lead 决定保留不改；联调时确认 |

### 7.3 已知限制 / 已批准偏差（不需要修复，但需在交付说明中注明）

| 项 | 说明 | 处置 |
|---|---|---|
| 2001「无可用动作」不可达 | 遍历 180 种 UI 可选约束组合，mock 动作库始终存在安全动作；约束页 2001 降级路径无法演示/自动化触发（真实后端动作库扩充或更严约束时会出现） | Lead 已判定：mock 数据量下已知限制，不修；**2001 降级逻辑已由请求层/约束页代码实现，接口契约保留**（QA 已直接驱动页面错误分支验证代码可用） |
| 动作示范播放器背景 | 规范 7.3 写「深色渐变」，实际改为浅色以匹配透明底关键帧素材 | Lead 已批准偏差；预览截图效果正常 |
| 真机视觉未验证 | 本机无微信开发者工具；UI 近似预览为 HTML 近似渲染（task-8/9，page-b 主责），375×812@2x 固定视口，未覆盖 360dp、字体缩放、安全区、iOS/Android 差异 | 已在第 9 节列出演示前真机检查清单；本报告结论基于静态+逻辑+近似预览三重证据 |
| UI 预览产物归属 | `docs/03-测试/UI预览/` 由 task-8/9（page-b）负责生成与维护（含 README 与修复对比图）；QA 本轮仅辅助执行并取 `checks.json` 作为布局自检证据 | 后续以 page-b 最终产出为准 |
| 重算后打卡历史展示口径 | 计划重算后旧计划打卡记录保留在缓存（历史对账可用），但打卡页「打卡历史」按当前计划过滤展示（Lead 设计取舍） | 已知设计决策，不视为缺陷；页面文案「记录会保留」指引数据不丢 |

**P1 = 0；P2 = 0（QA-FIX-06 已修复并回归）；P3 剩余 3 条建议/观察（QA-OBS-11 / OBS-04 / OBS-06，不阻塞）。**

---

## 8. 通过项统计

| 层面 | 数量 | 失败 | 说明 |
|---|---|---|---|
| 静态校验通过项 | 456 | 0 | `validate-miniprogram.js --strict`（14 类检查；JS 39 / JSON 17 / WXML 14 / WXSS 15 / PNG 34 / 引用 8） |
| mock 闭环断言 | 339 | 0 | `simulate.js` 11 章（§11 重算隔离回归，13 项断言） |
| mock 服务层断言 | 67 | 0 | `smoke_test.js` |
| 页面级 harness 断言 | 58 | 0 | `page_harness.js` |
| QA 页面边界断言 | 115 | 0 | ad-hoc 5 组场景（A 空数据 / B 跨页闭环 / C 边界 / D 降级 / E 重算隔离） |
| **自动化断言合计** | **1035** | **0** | 不含 UI 预览的 14 场景/布局检查 |
| UI 近似预览 | 14 场景 + overview | 0 | 横向溢出 0、破图 0、undefined 文本 0、截图 0 失败（task-8/9 工具） |

---

## 9. 交付结论与演示前检查清单

**结论：6 页面验收通过，跨页闭环与边界回归全绿，无 P1/P2 阻塞问题；含 Lead 终检后修复（数据隔离细化 + task-9 视觉修复）复验通过，可交付演示。** 剩余 1 条文案级建议 + 2 条 Lead 保留建议 + 3 条已知限制/已批准偏差已在 7.2/7.3 记录，均不影响演示主流程。

演示前建议人工确认（真机/开发者工具）：

- [ ] 微信开发者工具「清缓存 → 清除数据缓存」后冷启动：约束页 → 提交 → 计划页；
- [ ] 4 个 tab 切换与下拉刷新手感；tab 角标（今日未打卡/已打卡）；
- [ ] 动作页关键帧播放与暂停、图片加载失败兜底（可临时改坏资源路径验证）；
- [ ] 打卡 → 周反馈 → 计划页下周调整的完整讲解路径；
- [ ] 订阅消息授权弹窗与「应用内提醒」兜底文案（真机模板未配置时的降级）；
- [ ] 375pt/360dp 窄屏、字体放大、安全区（iPhone 底部手势条）；
- [ ] 计划 stale / 约束修改后重算的讲解分支（演示时间充裕时）。

---

## 10. 终检后变更与最终复验（16:24-16:30）

> QA 首轮终检报告（16:22）之后，Lead 与 page-b 完成了最后一轮修复/视觉打磨；QA 按 Lead 要求做最终复验，本节记录增量变更与最终结论。**第 1-9 节数据已同步为该最终版本。**

### 10.1 变更清单

| 时间 | 变更方 | 变更 | QA 验证 |
|---|---|---|---|
| 16:20 | Lead | 规范文档同步（`docs/01`）；checkin/diet 两处 WXSS 样式微调 | validate --strict 456/0/0 |
| 16:21-16:25 | page-b | task-8/9 视觉修复：计划解释弹层内容区渐隐 + 「下滑查看完整解释」提示 + 底部留白；动作 hero 多空间文案收敛为「… 等多场景」；周切换标签样式打磨；UI 预览新增 `page-plan-explain-bottom` 场景（共 14 个）+ README/修复对比图 | UI 预览 14 场景全 0 告警（16:27 重跑） |
| 16:27 | Lead | 数据隔离细化（QA-OBS-09/10）：`store.upsertCheckin` 去重键改为 plan_id+session_id、`store.getTodayCheckin` 按当前 plan 过滤、`mock.latestCheckins` 去重键同步为 plan_id\|session_id | simulate §11 扩到 13 项断言全过：plan1 done + plan2 partial → records=2（历史保留）、todayCheckin 指向 plan2、当前计划 stats done=0/partial=1 |
| 16:28 | QA | 增强 `tools/simulate.js` §11 回归断言（新增 records 保留、角标 plan 过滤断言） | simulate 339/0/1 |
| 16:30 | QA | 最终复验：四件套 + 页面边界 ad-hoc 115 项 + UI 预览 14 场景 + 报告更新 | 全绿（见 10.2） |

### 10.2 最终复验结果（2026-11-08 16:30）

| 检查 | 结果 | 退出码 |
|---|---|---|
| `validate-miniprogram.js --strict` | **456 / 0 ERROR / 0 WARN / 0 WIP** | 0 |
| `simulate.js` | **339 / 0 失败 / 1 已知限制（2001）** | 0 |
| `smoke_test.js` | **67 / 0** | 0 |
| `page_harness.js` | **58 / 0** | 0 |
| QA 页面边界 ad-hoc | **115 / 0** | 0 |
| UI 近似预览 | **14 场景 + overview；overflow/broken/clipped/undefined 全 0** | 0 |

### 10.3 最终结论

- **P1 = 0、P2 = 0**（已修复并回归）；**P3 修复 7 项**（QA-FIX-07~13）+ Lead/page-b 视觉与文档修复 4 项（打卡勾选对比度、饮食数值层级、计划解释弹层体验、动作 hero 空间文案收敛）；
- 剩余：QA-OBS-11（动作页替代动作空态文案，极小）、QA-OBS-04/06（Lead 决定保留，联调确认）；
- 已知限制：2001 在 mock 数据不可达（降级逻辑已实现、契约保留）、动作播放器浅色背景（已批准偏差）、真机视觉未验证（演示前按第 9 节清单人工确认）；
- **可交付**：功能、数据、跳转、降级路径与近似视觉均通过终检。

---

## 附录 A：复验命令与退出码

```powershell
$node = "C:\Users\LENOVO\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"
& $node tools\validate-miniprogram.js --strict   # 456/0/0 → exit 0
& $node tools\simulate.js                        # 339/0/1 已知限制 → exit 0
& $node tools\smoke_test.js                      # 67/0 → exit 0
& $node tools\page_harness.js                    # 58/0 → exit 0
& $node tools\ui_preview\render.js               # task-8/9：14 场景 + overview（可选，需本机 Edge/Chrome）
```

- `validate-miniprogram.js`：`0` 通过 / `1` 存在 ERROR（或 --strict 下 WIP）/ `2` 脚本异常；
- 其余脚本：`0` 全通过 / `1` 存在失败 / `2` 未捕获异常。
- QA 补充边界脚本为临时 ad-hoc（未入库，基于 page_harness stub，115 项断言）；如需长期保留，可由 Lead 决定转为 `tools/qa_page_boundary.js`。

## 附录 B：问题索引（本轮）

| ID | 级别 | 状态 | 文件 / 行号（修复后） |
|---|---|---|---|
| QA-FIX-06 | P2 | 已修复复验 | `mock.js:1213-1216,1336-1338,1623,1685,1737-1738`；`store.js:183-203`；`checkin.js:196-204` |
| QA-FIX-07 | P3 | 已修复 | `checkin.js:129-142,428-429`；`feedback.js:451-464,562-563` |
| QA-FIX-08 | P3 | 已修复 | `plan.wxml:117` |
| QA-FIX-09 | P3 | 已修复 | `action.wxml:214-223` |
| QA-FIX-10 | P3 | 已修复 | `mock.js:394-402` |
| QA-FIX-11 | P3 | 已修复 | `validators.js:115-122` |
| QA-FIX-12 | P3 | 已修复 | `store.js:143-152`；`mock.js:1145`（latestCheckins 去重键） |
| QA-FIX-13 | P3 | 已修复 | `store.js:154-168` |
| QA-OBS-11 | P3 | 观察（建议） | `action.wxml:204` |
| QA-OBS-04 / 06 | P3 | Lead 保留不改 | `data/actions.js`；`docs/02-接口/接口契约.md:122` |

## 附录 C：变更记录（本轮终检）

| 时间 | 变更 | 说明 |
|---|---|---|
| 16:06 | 认领 task-7，复跑四件套 + 补页面边界 ad-hoc 脚本 | 发现 0.3→0.33 硬编码差异并同步更新 simulate |
| 16:12 | 终检发现 P2（重算后旧打卡/周反馈跨计划污染）并报 Lead，附根因行号与修复建议 | 同步报 3 条 P3 |
| 16:15 | Lead 修复 P2（mock/store/checkin/feedback 等 9 文件）+ P3（定时器/文案）+ OBS-05/08 | — |
| 16:18 | QA 复验：simulate 336/0（新增 §11 回归）、validate 452/0/0、smoke 67/0、page_harness 58/0、ad-hoc 115/0 | 重算隔离 4 条回归断言通过 |
| 16:19 | 重跑 task-8 UI 近似预览：13 场景 + overview，overflow/broken/clipped/undefined 全 0 | 作为布局自检辅助证据 |
| 16:20-16:22 | 最终样式微调（checkin/diet 两处 WXSS）；QA 复跑 validate --strict 与 UI 预览 | 待 Lead 最后一轮修复 |
| 16:24-16:25 | page-b task-8/9 视觉修复（计划解释弹层/动作 hero/周切换标签）+ README/修复对比图；Lead 同步规范文档 | UI 预览 14 场景全 0 告警 |
| 16:27 | Lead 修复 QA-OBS-09/10（upsertCheckin plan+session、getTodayCheckin plan 过滤、latestCheckins 去重键） | — |
| 16:28 | QA 增强 simulate §11 回归断言至 13 项 | simulate 339/0/1 |
| 16:30 | QA 最终复验：validate 456/0/0、simulate 339/0/1、smoke 67/0、page_harness 58/0、ad-hoc 115/0、UI 14 场景全 0；报告更新 | **task-7 完成，可交付** |

## 附录 D：UI 近似预览产物（task-8/9，page-b 主责）

- 生成工具：`tools/ui_preview/render.js`（page-b 主责，task-8/9）；
- 输出目录：`docs/03-测试/UI预览/`（`README.md` 说明 + `overview.png` + **14 张** `page-*.png` + `checks.json` + 修复对比图 `fix-compare.png`），最终复跑时间 2026-11-08 16:27；
- 场景覆盖：约束表单/解析回填、计划 4 周/空态/stale/解释弹层（含底部渐隐场景 `page-plan-explain-bottom`）、动作 frames/text、打卡今日/已打卡+不适、周反馈表单/结果卡、饮食提示（含已选食物）；
- 布局自检（checks.json，14 场景汇总）：`overflowCount=0`、`brokenImages=0`、`undefinedText 场景=0`、`clippedText=0`；`heroContentOverlap=24px` 为设计预期的内容上浮（`.content { margin-top: -48rpx }`），非缺陷；
- 说明：近似预览只还原静态布局与样式，不执行小程序运行时，**不等同于真机/开发者工具截图**；真机视觉仍按第 9 节清单人工确认。

---

*本报告基于 2026-11-08 16:30 快照；工具结果以实际输出为准。*
