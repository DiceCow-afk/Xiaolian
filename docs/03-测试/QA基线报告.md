# 「校练」QA 基线报告（mock 阶段 v1.0）

> 项目：校练 · 面向校园约束场景的大学生体测训练计划小程序（微信原生 + mock 数据层）
> 报告类型：基础框架 / mock 数据层 QA 基线审查
> 编写：QA（qa-review） · 日期：2026-11-08 · 快照时间：2026-11-08 16:15（Asia/Shanghai，Lead 修复后复跑）
> 配套：[前端实现规范](../01-前端/前端实现规范.md) · [接口契约](../02-接口/接口契约.md)
> 审查对象：`mini-program/{app.js, app.json, app.wxss, project.config.json, sitemap.json}`、`utils/`、`data/`、`components/`（8 个）、`docs/01`、`docs/02`；同时对 6 个页面做静态快照（页面由 3 位 teammate 并行开发，终检见 task-7）。
> 约束：本轮只新增 `tools/validate-miniprogram.js`、`tools/simulate.js` 与本报告，**未修改任何业务代码**。

---

## 1. 结论摘要

| # | 检查项 | 工具 / 方式 | 结果 | 退出码 |
|---|---|---|---|---|
| 1 | 小程序静态校验（严格模式） | `node tools/validate-miniprogram.js --strict` | **445 项通过 / 0 ERROR / 0 WARN / 0 WIP** | 0 |
| 2 | mock 页面级闭环模拟 | `node tools/simulate.js` | **325 项断言通过 / 0 失败 / 1 条已知限制（观察）** | 0 |
| 3 | mock 服务层全流程自测（Lead 基线） | `node tools/smoke_test.js` | **67 项通过 / 0 失败**（本轮修复后无回归） | 0 |
| 4 | 页面级 harness（Lead 基线，QA 复跑交叉验证） | `node tools/page_harness.js` | **58 项通过 / 0 失败** | 0 |
| 5 | 基础框架人工审查（app / utils / data / components / docs） | 逐文件审查 + 上述工具交叉验证 | P1=0，P2=0（5 项已修复并回归），P3=8 条建议/观察（其中 1 条已由 Lead 判定为已知限制） | — |

**基线结论：基础框架达到“无后端可完整演示闭环”的质量基线。**

- 15 个接口与《接口契约》一致，页面只依赖 `utils/api.js`；
- 计划生成满足“4 周 / 不越时长 / 四类硬过滤 / 安全拦截可追溯 / 解释只读”等关键不变量（已独立复核）；
- 打卡 / 周反馈 / 饮食 / 订阅提醒的错误码与降级路径均可走通；
- 无阻塞级问题；剩余 1 条“2001 不可达”为 mock 数据量下的已知限制（Lead 已确认不修，终检报告注明）；
- 页面侧静态快照全部通过，页面团队仍在收尾，最终验收在 task-7 用 `--strict` 复跑。

---

## 2. 审查范围与依据

### 2.1 范围

| 模块 | 文件 | 审查重点 |
|---|---|---|
| 入口 / 配置 | `app.js`、`app.json`、`app.wxss`、`project.config.json`、`sitemap.json` | 页面清单、tabBar、窗口样式、设计令牌、启动逻辑 |
| 工具层 | `utils/{config,util,validators,store,request,api,mock,reminder}.js` | 契约一致性、错误码、数据持久化、mock 规则引擎、LLM 降级、订阅提醒 |
| 数据层 | `data/{options,testStandards,actions,rules,foods}.js` | 35 动作 / 6 体测项目 / 6+1 调整规则 / 4 类安全规则 / 26 食物；引用完整性 |
| 组件层 | `components/` 8 个公共组件 | 规范第 4 节 API（properties / events / styleIsolation） |
| 文档 | `docs/01-前端/前端实现规范.md`、`docs/02-接口/接口契约.md` | 实现与规范/契约的偏差 |
| 页面（快照） | `pages/{constraints,plan,action,checkin,feedback,diet}` | 四件套、事件绑定、usingComponents、资源、导航配色等静态项 |

### 2.2 依据

- `docs/01-前端/前端实现规范.md` 第 2/4/5/8/9 节（可复用依赖、组件 API、接口层、编码约定、验收清单）；
- `docs/02-接口/接口契约.md`（15 个接口、错误码 1001/1002/1003/2001/3001/4040/5000、Schema v1.0）；
- 微信小程序 WXML/WXSS/JSON 基础语法规则；
- 项目设计系统（`app.wxss` 色彩令牌/页面主色分配表）。

### 2.3 环境与边界

- Node：`v24.21.0 / win32`（DSH 运行时自带 Node，绝对路径调用，避免全局 node 不可用）；
- 无微信开发者工具：用 Node stub `wx` 运行时做无头验证（静态校验 + mock 闭环）；
- 真机 / 开发者工具中的 WXSS 渲染、订阅消息真实弹窗、真机窄屏适配不在本轮自动化范围（终检人工抽查）；
- 不修改业务代码；发现问题先报 Lead，由 Lead 决策修复。

---

## 3. 工具说明

### 3.1 `tools/validate-miniprogram.js`（静态校验器）

14 类检查，全部只读：

| # | 类别 | 检查内容 |
|---|---|---|
| 1 | JS 语法 | 全部 `.js`（mini-program 28 个 + tools 4 个）通过 `node --check` |
| 2 | JSON 结构 | 全部 17 个 `.json` 可 `JSON.parse` |
| 3 | app.json | `pages`（去重/无扩展名/无需前导 `/`）、`tabBar`（2-5 项、pagePath 在 pages、顺序与文案、图标资源）、`window` 颜色、`sitemapLocation` |
| 4 | 四件套 | 6 个页面与 8 个组件的 `js/json/wxml/wxss` 齐全 |
| 5 | usingComponents | 路径存在（支持相对路径与 `/` 根路径）、组件命名、WXML 使用自定义组件必须已声明 |
| 6 | WXML 结构 | 标签闭合（引号内 `>` 正确处理）、`wx:if/elif/else` 相邻合法性、`{{ }}` 配平、`wx:for` 建议 `wx:key` |
| 7 | 事件绑定 | `bind*/catch*/capture-*/mut-bind` 处理函数在对应 `.js` 中存在（先剥离注释/字符串再提取方法名） |
| 8 | WXSS | 花括号配平、`@import` 路径存在 |
| 9 | require 依赖 | 相对路径存在、禁止绝对路径/裸模块、循环依赖检测、**页面禁止 require mock/request** |
| 10 | 资源 | assets 全部 PNG 文件头（签名 + IHDR）、规范要求资源清单、tabBar 图标 81×81、WXML 静态图片引用 |
| 11 | 动作库数据 | 35 动作、必填字段、枚举合法、维度权重、升降阶引用存在、`demo_resource_id === "demo."+action_id`、`frame-N.png` 与 `demo_frames` 一致 |
| 12 | 页面规范抽查 | 导航标题/颜色、下拉刷新、`refreshBadge`、`Page/Component` 注册、hero 配色、`state-view/empty-state`、动作页定时器清理 |
| 13 | 编码约定 | 禁用 `?.` / `??`（兼容旧基础库）、页面禁止直连 storage、页面/组件无 `console.error/warn` |
| 14 | 文档与工具 | 规范/契约/smoke_test 存在、`project.config.json` appid 与 compileType |

- **WIP 机制**：页面/素材在并行开发期缺失时归入「进行中（WIP）」，默认不计失败；页面团队可先跑通；**终检必须加 `--strict`**，WIP 计为失败。
- 退出码：`0` 通过；`1` 存在 ERROR（或 `--strict` 下存在 WIP）；`2` 脚本自身异常。
- 本轮输出：JS 32、JSON 17、WXML 14、WXSS 15、PNG 34、资源引用 8、JS 模块 28。

### 3.2 `tools/simulate.js`（mock 页面级闭环模拟）

stub `wx`（storage / loading / toast / modal / badge / 导航 / `requestSubscribeMessage` / `request`）后，**只经 `utils/api.js`** 走 mock 完整流程，更偏“页面渲染所需数据”的断言；与 `smoke_test.js`（服务层直调）互补：

| 章节 | 覆盖 | 通过/失败 |
|---|---|---|
| 1 数据契约与环境自检 | 15 个 api 函数、35 动作、6 体测项、6+1 规则、食物表、validators | 12 / 0 |
| 2 约束输入页 | 冷启动空画像、空表单 10 项内联错误、AI 解析（含中文数字“每周三次”）、3001 降级、1001、保存/回读、诊断、4 周计划、约束变更 needs_replan + dirty 标记、1003 | 53 / 0 |
| 3 计划页 | hero/周概览/plan-card 字段、今日训练日、不越时长（≤5 动作）、无重复动作、角色（热身/主项/放松）、周日期范围文案（dateRangeText 回归锚点）、解释只读（weeks 不变 + plan_unchanged）、3001 解释降级、stale 提示、1003、拦截日志 | 36 / 0 |
| 4 动作示范页 | 35 个动作详情字段完整、6 个关键帧路径 `/assets/demo/<id>/frame-N.png`、其余图文兜底、降阶/进阶跳转、膝盖禁忌警示、1003 | 8 / 0 |
| 5 提醒打卡页 | 空统计、提醒状态、tab 角标 set/remove、表单校验、done/partial/skipped、更新打卡不重复、周状态回写、安全复查、错误码、无计划空态 | 38 / 0 |
| 6 周反馈页 | 初始 stats/plan_summary、7 条规则分支（ADJ-01/02/03/04/05/06/DEFAULT）、下周预览、安全变更结构、更新反馈幂等、第 4 周无预览、1001/1003、无计划 | 81 / 0 |
| 7 饮食提示页 | 训练类型推断、两维度 level、摄入汇总（独立重算）、高蛋白/未知食物、训练类型覆盖、休息日、功能开关降级 | 19 / 0 |
| 8 提醒/订阅 | 模板未配置/同意/拒绝/接口失败四态、额度消耗、提醒时间校验、关闭提醒/无计划角标降级 | 14 / 0 |
| 9 多画像安全不变量 | 4 类画像 × 独立复核禁忌/器械/空间/门槛/时长/周范围、2001 可达性探针、体测日 7 天边界截断 | 50 / 0 |
| 10 错误码与请求层 | 4040、silent 不重复 toast、真实网络分支（成功/业务码/HTTP500/网络失败+GET 重试）、loading 无泄漏、1001/1003/3001 | 14 / 0 |

**合计 325 项断言通过、0 失败**；另有 1 条观察项（2001 不可达，Lead 已确认为 mock 数据量下的已知限制，见 6.2 QA-OBS-01）。

### 3.3 运行方式

```powershell
# 说明：DSH 环境全局 node 可能不可用，使用运行时自带 Node 绝对路径
& "C:\Users\LENOVO\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe" tools\validate-miniprogram.js
& "C:\Users\LENOVO\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe" tools\validate-miniprogram.js --strict   # 终检
& "C:\Users\LENOVO\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe" tools\simulate.js
& "C:\Users\LENOVO\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe" tools\smoke_test.js
```

建议执行时机：页面提交前自跑 `validate-miniprogram.js`（WIP 不阻塞）；功能联调后跑 `simulate.js`；**task-7 终检**按 `--strict` + 两个流程脚本 + smoke_test 三连跑，并要求全 0 退出。

---

## 4. 静态校验结果（快照：`validate-miniprogram.js --strict`）

| 类别 | 结果 | 备注 |
|---|---|---|
| JS 语法 | 32/32 通过 | mini-program 28 + tools 4 |
| JSON 结构 | 17/17 通过 | app/project/sitemap/6 页面/8 组件 json |
| app.json | 通过 | 6 页面顺序正确（入口 constraints）；4 tab 顺序 计划/打卡/反馈/饮食；图标存在 |
| 页面/组件四件套 | 6 页面 + 8 组件全部齐全 | — |
| usingComponents | 通过 | 页面使用 `/components/...` 根路径（微信合法），组件内部 `../action-tag/index` 正常 |
| WXML 结构 | 14/14 通过 | 标签闭合、条件链、插值配平均正常 |
| WXML 事件绑定 | 79 处绑定全部能在对应 JS 找到方法 | 含组件内部 `bindtap/bindchange/catchtap` |
| WXSS | 15/15 通过 | 花括号配平、无 @import 断链 |
| require 依赖 | 28 个模块通过 | 无循环依赖、无绝对路径/裸模块、页面未 require mock/request |
| 资源 | 34 个 PNG 全部有效（文件头 + IHDR） | 8 个 tab 图标均 81×81；24 张关键帧 + 占位图 + 分享封面存在 |
| 动作库数据 | 通过 | 35 动作 / 6 个关键帧动作；`demo_resource_id = demo.<action_id>` 与目录一致；升降阶引用全部存在 |
| 页面规范抽查 | 通过 | 6 页导航色/标题/下拉刷新/refreshBadge/hero 配色/三态/timer 清理均符合规范 |
| 编码约定 | 通过 | 无 `?.`/`??`；页面无直连 storage、无 console.error/warn |
| 文档与工具 | 通过 | 规范/契约/smoke_test 存在；appid `wx9c4aac9029c3e66e` 正确 |

**统计：445 项通过，0 ERROR，0 WARN，0 WIP，退出码 0。**

---

## 5. 问题清单

### 5.1 已修复并回归确认（本轮 QA 期间发现 / 确认，Lead 已修复）

| ID | 问题（修复前） | 位置（修复前） | 修复内容 | 回归验证 |
|---|---|---|---|---|
| QA-FIX-01 | 同一训练日重复提交打卡会**追加重复记录**，且周状态滞后一格（首次打卡后 week.status 仍为 pending） | `utils/mock.js` `handleCheckin` 旧 1266-1272；`utils/store.js` | 新增 `store.upsertCheckin()`（按 session_id upsert），并改为**先 upsert 再重算周状态**（mock.js:1282-1287） | simulate 第 5 章「更新打卡后仍只有 1 条记录 / 统计不虚高 / 周状态回写」通过 |
| QA-FIX-02 | 自然语言解析不识别中文数字频次：规范 7.1 的示例「**每周三次**」解析不出 `weekly_frequency` | `utils/mock.js:276`（旧正则 `/每周\s*(\d)\s*次/`） | 正则支持 `每?周\s*([一二两三四五1-5])\s*[次练]` 并做数字映射（mock.js:277-284） | simulate 第 2 章「解析出每周次数 3 次」通过 |
| QA-FIX-03 | 周反馈「更新反馈」非幂等：同一周重复提交会把下周调整**重复叠加**（2 组×13 次 → 1 组×11 次） | `utils/mock.js` `handleSubmitWeeklyFeedback` | 新增 `plan.meta.week_baselines` 周基线 + `ensureWeekBaseline/restoreWeekBaseline`，更新反馈时先还原目标周基线再应用调整（mock.js:1635-1660、1684-1686） | simulate 第 6 章「更新反馈不重复叠加（幂等）」通过 |
| QA-FIX-04 | 体测日期距今 7 天时，4 周计划会有训练日排在**体测之后** | `utils/mock.js` `generatePlanInternal` | 生成后按体测日截断 `sessionsBeforeTest`，同步修正 `target_completion` 并在周 `note` 标注“已过体测日”（mock.js:914-943） | simulate 第 9 章「体测日 7 天边界」通过 |
| QA-FIX-05 | `util.dateRangeText` 拼接 bug：运算符优先级导致周日期范围文案异常 | `utils/util.js` `dateRangeText` | 补全括号，输出「11月8日 - 11月14日」 | simulate 第 3 章新增「周日期范围文案与起止日期一致（dateRangeText 回归）」锚点通过 |

> 说明：QA-FIX-01 由 Lead 在 QA 工具开发期间同步修复，QA 回归确认；QA-FIX-02/03/04 为 QA 工具发现后报告 Lead 并由 Lead 修复，均已回归通过；`tools/smoke_test.js` 67 项在修复后无回归。

### 5.2 待确认建议 / 观察项（P3，不阻塞基线）

| ID | 级别 | 问题 | 位置 | 建议 |
|---|---|---|---|---|
| QA-OBS-01 | 已知限制（不修） | **2001（无可用动作）在 mock 数据下不可达**：遍历 180 种 UI 可选约束组合（器械×空间×基础×身体限制），`filterActions` 始终存在安全动作，约束页的 2001 降级路径无法演示/自动化触发 | `utils/mock.js` 数据与过滤逻辑 | Lead 已判定：mock 数据量下的已知限制，不修（真实后端在动作库扩充/更严约束下会出现）。**终检报告需写明**：演示环境不可达，2001 降级逻辑已由请求层/约束页代码实现，接口契约保留该错误码 |
| QA-OBS-02 | 建议（代码一致性） | mock 在提交周反馈更新时**直接 `wx.setStorageSync`** 绕过 store 封装，与“所有业务模块只通过 store 读写缓存”的约定不一致 | `utils/mock.js:1679` | 建议 store 增加 `upsertFeedback(record)` / `removeFeedbackByWeek(weekNo)`，保持单一数据出口 |
| QA-OBS-03 | 建议（文档） | 体测项目注释写“当前覆盖 **5** 项”，实际 `EVENT_OPTIONS` 为 **6** 项 | `data/options.js:11` | 注释更新为 6 项 |
| QA-OBS-04 | 建议（数据一致性） | 动作升降阶关系**非严格对称**（13 处，如 `lunge.progression_id=jump_squat`，而 `jump_squat.regression_id=squat`） | `data/actions.js`（如 34/66/130 行附近） | 动作页“替代动作”跳转不受影响；若产品要求可逆映射，建议统一补齐 |
| QA-OBS-05 | 建议（展示精度） | 弱项权重逐项 `round1` 后总和可能为 0.9/1.0/1.1，不严格 =1 | `utils/mock.js:389` | 当前页面按百分比展示、容差内可接受；若需精确，建议保留原始权重或末项做差修正 |
| QA-OBS-06 | 建议（联调风险） | `GET /diet/tips` 的 `foods` 为数组，真实后端 query 序列化方式需确认（契约已注明“联调时确认”） | `docs/02-接口/接口契约.md:122` | 建议后端改为 POST，或前端统一 JSON 字符串序列化 |
| QA-OBS-07 | 观察（页面终检关注） | 体测日期临近（7 天）时，截断后的周训练日数为 **3/1/0/0**（第 3/4 周 `sessions=[]`） | `utils/mock.js:914-943` | 截断逻辑已由 Lead 修复并有 note 标注；**计划页/周反馈页的周切换器需对“空周”做兜底**，task-7 重点检查 |
| QA-OBS-08 | 建议（校验体验） | `validateProfile` 对非法日期字符串（如 `abc`）会落到“体测日期至少距今天 7 天”提示，而非“格式不正确”（`util.diffDays` 对非法日期返回 0） | `utils/validators.js:116-127` | 建议先判 `isNaN(new Date(p.test_date).getTime())` 再给格式错误 |

### 5.3 严重级问题

**无（P1 = 0）。** 当前不存在会导致白屏、数据错乱、安全规则失效或演示阻断的缺陷（QA-FIX-01 修复前属于 P1 级数据错乱，已修复回归）。

---

## 6. 基础框架审查明细

### 6.1 入口与配置

| 文件 | 结论 | 说明 |
|---|---|---|
| `app.json` | 通过 | 6 页面（入口 constraints，tab 页 plan/checkin/feedback/diet）；tabBar 4 项文案与顺序符合规范；窗口色 `#FF6B2C`/`#F4F6FA`；`sitemapLocation` 正确；`lazyCodeLoading` 合理 |
| `app.js` | 通过 | `onLaunch` 初始化系统信息/匿名用户/refreshGlobal；`onShow` 调 `reminder.refreshBadge()` 做应用内提醒兜底；globalData 仅存轻量运行时状态 |
| `app.wxss` | 通过 | 设计令牌（品牌/中性/语义色、圆角、阴影）与规范 3.1 一致；hero/卡片/表单/按钮/底部栏/动画等类齐全，页面复用正常 |
| `project.config.json` | 通过 | appid `wx9c4aac9029c3e66e`、compileType miniprogram、ES6/增强编译开启 |
| `sitemap.json` | 通过 | 全部页面 allow，功能型工具合理 |

### 6.2 工具层（utils/）

| 文件 | 结论 | 要点 |
|---|---|---|
| `config.js` | 通过 | `useMock=true`；features 四开关；订阅模板默认空（触发应用内兜底）；Schema/Rules v1.0；默认体测日 +35 天 |
| `util.js` | 通过 | 日期/相对日期/时长/百分比/深拷贝/uuid/clamp 等 24 个工具函数；无外部依赖；`dateRangeText` 拼接 bug 已修复并有 simulate 回归锚点 |
| `validators.js` | 通过 | 画像/自然语言/打卡/周反馈/提醒设置五类校验，与 mock Schema 同口径；错误信息可读并用于内联展示（见 QA-OBS-08 小建议） |
| `store.js` | 通过 | 统一 `xl_` 前缀缓存键；profileDirty 机制；新增 `upsertCheckin` 解决重复打卡；订阅/提醒设置读写完整 |
| `request.js` | 通过 | 统一 `{code,data,msg}` 解析；mock/真实网络双分支；LLM 路径独立延迟；错误码归一（5000/1001）；GET 自动重试 1 次；loading 计数无泄漏（模拟验证） |
| `api.js` | 通过 | 15 个函数与契约逐条对应；页面唯一数据入口；`parseNaturalLanguage`/`explainPlan` silent 降级设计正确 |
| `mock.js` | 通过（修复后） | 15 路由；4 周周期化（准备/进展/减量按距体测天数）；四类硬过滤 + 降阶替换 + 安全拦截日志；解释只读（weeks 不变）；打卡 upsert；周反馈表驱动 6 规则 + 默认；饮食两维度；错误码 1001/1003/2001/3001/4040 齐备（2001 见 QA-OBS-01） |
| `reminder.js` | 通过 | 训练日角标计算；订阅授权三种降级（模板未配置/拒绝/接口失败）；提醒状态汇总字段齐全 |

### 6.3 数据层（data/）

| 文件 | 结论 | 要点 |
|---|---|---|
| `actions.js` | 通过 | 35 动作，9 种 pattern、7 个能力维度；教学字段（要点/步骤/常见错误/正误对比/呼吸/安全提示）完整；6 个关键帧动作 `demo_frames=4` 且资源路径与 `/assets/demo/<id>/frame-N.png` 一致；升降阶引用全部存在（对称性见 QA-OBS-04） |
| `testStandards.js` | 通过 | 6 个体测项目 × 4 档位（待提高/及格/良好/优秀），分数递增、阈值文案齐全；维度权重和≈1 |
| `rules.js` | 通过 | 约束过滤表（器械/空间/能力/身体限制）、周期化表、周反馈 6 规则 + 5 类调整参数、4 类安全规则、提醒配置、饮食规则表（含免责声明） |
| `foods.js` | 通过 | 26 种食堂常见食物，4 个分类，蛋白/碳水/热量概值与份数换算一致 |
| `options.js` | 通过（1 条文档建议） | 枚举字典完整、值唯一；与体测项目/器械/空间/时长/频次/状态/不适/感受/恢复等 UI 选项对齐（注释计数见 QA-OBS-03） |

### 6.4 组件层（components/，8 个）

| 组件 | 规范第 4 节 API 核对 | 结论 |
|---|---|---|
| `plan-card` | properties: session/mode/showStatus；events: actiontap `{actionId,actionName,index}`、checkin `{sessionId}` | 通过（内部复用 action-tag） |
| `action-tag` | properties: action/index/showMeta/selected；event: select | 通过 |
| `rpe-slider` | properties: value/disabled/leftText/rightText；event: change `{value}`；受控组件 | 通过（observers 同步 displayValue/desc） |
| `tag-picker` | options/value/multiple/exclusiveValue/max/layout/disabled/accent；event: change `{value,changed}`；互斥与上限逻辑 | 通过 |
| `stepper` | value/min/max/step/unit/disabled；event: change `{value}` | 通过 |
| `state-view` | state/text/errorTitle/retryText/minHeight；event: retry；slot | 通过（loading/error/done 三态） |
| `empty-state` | icon/title/desc/actionText/actionType；event: action；slot | 通过 |
| `safety-banner` | intercepts/title/collapsible/defaultExpanded；无拦截不渲染、可折叠 | 通过（独立规则表说明文案） |

- 所有组件 `styleIsolation: isolated`，仅依赖 CSS 变量继承，符合规范第 4 节；WXML 事件绑定与组件 JS 方法全部一一对应（静态校验覆盖）。

### 6.5 文档

| 文档 | 结论 | 说明 |
|---|---|---|
| `docs/01-前端/前端实现规范.md` | 通过 | 目录/依赖/设计系统/组件 API/接口层/Schema/6 页面规格/编码约定/验收清单；与实现逐项核对一致（本报告第 6 节） |
| `docs/02-接口/接口契约.md` | 通过 | 15 个接口、错误码表、关键请求/响应结构、规则表对应关系；mock 路由与响应结构一致（1 条联调建议见 QA-OBS-06） |

---

## 7. 页面侧静态快照（并行开发中，非终检结论）

快照时间 16:05 时 6 个页面已全部落盘，静态校验结果：

- 6 个页面四件套齐全；页面 json 导航标题/颜色与规范 3.1 一致，计划/打卡/反馈/饮食页开启下拉刷新；
- 79 处 WXML 事件绑定全部能对应到页面/组件 JS 方法；usingComponents 路径全部可解析；
- 页面均通过 `require('../../utils/api')` 取数，无页面 require mock/request、无直连 storage、无 `?.`/`??`；
- tab 页均调用 `reminder.refreshBadge()`；动作页存在播放定时器清理（`clearInterval` + `onHide/onUnload`）；
- 页面静态图片引用与全部 34 个 PNG 资源校验通过；
- 开发过程中曾出现 1 条 WARN（constraints 页未使用 empty-state），页面团队已补齐，快照时 0 WARN。

> 页面交互细节（三态切换、表单提交、跳转、空态、窄屏适配）不在本轮基线范围，由 task-7 终检覆盖；注意 QA-OBS-07（空周兜底）。

---

## 8. 通过项统计

| 层面 | 数量 | 失败 | 说明 |
|---|---|---|---|
| 静态校验通过项 | 445 | 0 | `validate-miniprogram.js --strict` |
| mock 闭环断言 | 325 | 0 | `simulate.js`（10 章节） |
| mock 服务层断言（Lead 基线） | 67 | 0 | `smoke_test.js` 回归 |
| 页面级 harness 断言（Lead 基线） | 58 | 0 | `page_harness.js` 复跑交叉验证 |
| **合计** | **895** | **0** | 工具互不重复：静态/契约/页面数据/页面运行时四层 |

---

## 9. 后续建议与终检计划

1. **Lead 已确认**：QA-FIX-01~05 全部修复并回归；QA-OBS-01（2001 不可达）作为 mock 数据量已知限制不修，终检报告按“演示环境不可达、降级逻辑代码已实现、契约保留”口径注明；QA-OBS-02~06、08 为低成本建议，是否处理由 Lead 排期（均不阻塞）。
2. **页面 teammate**：关注 QA-OBS-07 —— 体测日临近时存在 `sessions=[]` 的空周（3/1/0/0），计划页/周反馈页需空态兜底；同时保留 2001/3001 降级代码（即便 mock 难触发）。
3. **task-7 终检命令**（全 0 退出为通过）：

```powershell
$node = "C:\Users\LENOVO\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"
& $node tools\validate-miniprogram.js --strict
& $node tools\simulate.js
& $node tools\smoke_test.js
& $node tools\page_harness.js
```

4. 终检人工验收：按规范第 9 节清单逐页检查（三态、校验、跳转、素材、下拉刷新、定时器清理、配色导航、窄屏适配），并补充跨页闭环（约束→计划→示范→打卡→反馈→饮食）与边界（无计划/休息日/重复打卡/无打卡提交反馈/计划 stale/2001/3001 降级）验证。

---

## 附录 A：本轮发现问题的文件行号索引

| ID | 文件:行 | 当前状态 |
|---|---|---|
| QA-FIX-01 | `mini-program/utils/mock.js:1282-1287`、`utils/store.js:138-150` | 已修复 |
| QA-FIX-02 | `mini-program/utils/mock.js:277-284` | 已修复 |
| QA-FIX-03 | `mini-program/utils/mock.js:1635-1660, 1684-1686` | 已修复 |
| QA-FIX-04 | `mini-program/utils/mock.js:914-943` | 已修复 |
| QA-FIX-05 | `mini-program/utils/util.js` `dateRangeText` | 已修复（simulate 回归锚点） |
| QA-OBS-01 | mock 数据/过滤逻辑（无单一行号） | 已知限制（Lead 判定不修，终检注明） |
| QA-OBS-02 | `mini-program/utils/mock.js:1679` | 待确认（低成本建议） |
| QA-OBS-03 | `mini-program/data/options.js:11` | 待确认（低成本建议） |
| QA-OBS-04 | `mini-program/data/actions.js`（34/66/130 等附近） | 待确认（低成本建议） |
| QA-OBS-05 | `mini-program/utils/mock.js:389` | 待确认（低成本建议） |
| QA-OBS-06 | `docs/02-接口/接口契约.md:122` | 待确认（联调确认） |
| QA-OBS-07 | `mini-program/utils/mock.js:914-943` | 截断已修复；页面空周兜底终检关注 |
| QA-OBS-08 | `mini-program/utils/validators.js:116-127` | 待确认（低成本建议） |

## 附录 B：变更记录

| 时间 | 变更 | 说明 |
|---|---|---|
| 2026-11-08 15:48 | 认领 task-6，盘点基线 | 当时 pages/assets 尚未落盘 |
| 15:52-15:55 | 6 个页面 / 素材陆续落盘 | QA 以 WIP 机制并行校验 |
| 15:57 | Lead 修复重复打卡（store.upsertCheckin） | QA 回归确认 |
| 15:58 | QA 完成 `tools/validate-miniprogram.js` | 0 ERROR / 1 WARN / 1 WIP（当时快照） |
| 15:59 | QA 完成 `tools/simulate.js` | 319/2（2 项框架问题） |
| 16:00 | QA 报告框架问题；Lead 修复中文数字频次、周反馈幂等、体测日截断 | 三项修复回归通过 |
| 16:05 | QA 基线报告首次落盘 | 静态 445/0/0；simulate 324/0；smoke 67/0 |
| 16:10 | Lead 回复：A/B 修复确认；2001 定为已知限制不修；补充修复 `util.dateRangeText` 拼接 bug、打卡 upsert、动作页播放器背景 | — |
| 16:15 | QA 复跑（新增 dateRangeText 回归锚点）：静态 445/0/0（--strict）；simulate 325/0；smoke 67/0；page_harness 58/0 | **基线通过，task-6 交付** |

---

*本报告由 QA 工具自动结果 + 人工审查生成；数据以 `tools/validate-miniprogram.js` / `tools/simulate.js` / `tools/smoke_test.js` 的实际输出为准。*
