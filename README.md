# 校练 · Xiaolian

> 面向校园有限器械与碎片时间场景的**大学生体测训练计划生成与动态调整**微信小程序。
> 不做通用健身内容平台，做「校园约束条件下的计划引擎」。

**主线闭环**：约束输入 → 弱项诊断 → 4 周周期化计划 → 动作示范 → 提醒打卡 → 周反馈调整 → 安全拦截记录

| 项 | 内容 |
|---|---|
| 依托 | 北京邮电大学 2026 年「雏雁计划」，周期 2026.10—2027.4 |
| 前端 | 微信小程序原生（WXML / WXSS / JavaScript），官方 JS 基础模板 |
| 后端 | Python 3.11 + FastAPI + SQLite/MySQL（本次交付前端 + mock 数据层，接口契约已冻结） |
| AppID | `wx9c4aac9029c3e66e` |
| 数据 | 动作库 35 个动作 / 6 个体测项目 / 7 个能力维度 / 表驱动规则库 / 食堂食物简表 |
| 文档 | [前端实现规范](docs/01-前端/前端实现规范.md) · [接口契约](docs/02-接口/接口契约.md) · [会话总结](会话总结_校练项目.md) · [功能与技术框架](项目功能与技术框架.md) |

---

## 1. 当前进度（本次交付）

- ✅ 6 个页面全部实现（原生框架）：约束输入、计划展示、动作示范、提醒打卡、周反馈、饮食提示
- ✅ 8 个公共组件：计划卡片、动作标签、RPE 滑条、空状态、加载/错误三态、标签选择器、步进器、安全拦截提示
- ✅ 可离线演示的 **mock 服务层**：与后端接口契约同构，关闭开关即可切换真实接口
- ✅ 表驱动规则：约束过滤（器械/空间/身体限制/能力门槛四类硬过滤）、分数贡献、周期排布、周反馈四类调整分支、安全拦截、饮食提示
- ✅ 数据资产：35 个动作库（含降阶/升阶/禁忌/组次/教学要点）、6 个体测项目评分档位、食物简表
- ✅ 视觉素材：tabBar 图标、6 个核心动作各 4 帧关键帧示范、占位图、分享封面
- ✅ 自测：`tools/smoke_test.js` 覆盖 mock 全流程 67 项断言；`tools/validate-miniprogram.js` 静态校验；`tools/simulate.js` 页面级闭环模拟
- ⏳ 待办：后端 FastAPI 实现与联调、真机测试、订阅消息模板申请、示范视频素材、30-50 人可用性测试

## 2. 快速开始（微信开发者工具）

1. 打开**微信开发者工具**（已登录、AppID 为 `wx9c4aac9029c3e66e`）。
2. 「导入项目」→ 目录选择本仓库下的 **`mini-program/`**（注意：不是仓库根目录）→ AppID 会自动读取 `project.config.json`。
3. 编译即可运行，**无需后端、无需网络**（默认 `useMock: true`）。
4. 若提示「不校验合法域名」，保持 `project.config.json` 中 `urlCheck: false` 即可（mock 模式无网络请求）。

### 推荐演示路径

1. **约束输入页**（首次打开）：点「AI 帮我填」→ 输入示例自然语言 → 自动回填 → 检查体测项目/档位/器械/身体限制 → 「保存约束并生成计划」
2. **计划展示页**：查看 4 周阶段（准备/进展/减量）、切换周次、点训练日里的动作 → 进入动作示范
3. **动作示范页**：关键帧自动播放（深蹲/平板/臀桥/高抬腿/开合跳/靠墙静蹲），查看要点、步骤、常见错误、正误对比、降阶/升阶
4. **提醒打卡页**：授权订阅（无模板时自动降级应用内提醒）→ 勾选完成动作 → 选择 RPE / 不适 → 提交打卡
5. **周反馈页**：查看本周完成率与平均 RPE → 填写整体感受/恢复情况 → 生成调整（正常推进/减量/休息/升阶）→ 查看下周计划预览
6. **饮食提示页**：选今天吃的食物 → 看蛋白质/碳水两个维度的提示（一般性参考，非营养处方）

> 演示第二天打开时，计划日期可能“过期”（mock 以生成日为第 1 周起点），计划页会提示并支持「重新生成计划」。

## 3. 目录结构

```
Xiaolian/
├── mini-program/                  # 小程序工程（用开发者工具导入这一层）
│   ├── app.js / app.json / app.wxss
│   ├── project.config.json        # AppID / 编译配置（project.private.config.json 不入库）
│   ├── sitemap.json
│   ├── pages/
│   │   ├── constraints/           # 约束输入（入口页）
│   │   ├── plan/                  # 计划展示（tab 0）
│   │   ├── checkin/               # 提醒打卡（tab 1）
│   │   ├── feedback/              # 周反馈（tab 2）
│   │   ├── diet/                  # 饮食提示（tab 3，拓展）
│   │   └── action/                # 动作示范（详情页）
│   ├── components/                # 8 个公共组件
│   ├── utils/                     # config/util/validators/store/request/api/mock/reminder
│   ├── data/                      # 体测标准/动作库/规则表/食物简表/枚举
│   └── assets/                    # tabBar 图标、动作关键帧、占位图、分享封面
├── docs/
│   ├── 01-前端/前端实现规范.md      # 设计系统、组件 API、数据契约、页面规格、验收清单
│   ├── 02-接口/接口契约.md          # 前后端接口契约（Schema v1.0）
│   └── 03-测试/                    # QA 基线报告 / 终检报告
├── tools/
│   ├── generate_assets.py          # 一键重建全部视觉素材（Pillow）
│   ├── smoke_test.js               # mock 全流程无头自测
│   ├── simulate.js                 # 页面级闭环模拟（QA 维护）
│   └── validate-miniprogram.js     # 小程序静态校验（QA 维护）
├── .gitignore
└── README.md
```

## 4. 技术方案要点

### 4.1 数据层：mock 与真实后端同构

- `mini-program/utils/config.js` 中 `useMock: true`（默认）：所有 `utils/api.js` 请求走 `utils/mock.js`，返回后端同款 `{code, data, msg}`。
- 联调后：`useMock: false` + 填写已备案 HTTPS `baseURL` + 小程序后台配置 request 合法域名，页面代码零改动。
- 会话/缓存：`utils/store.js` 统一管理画像、计划、打卡、周反馈、提醒设置；画像变更时标记「计划待重算」。

### 4.2 规则引擎（前端 mock 版，未来迁后端）

| 规则表 | 说明 |
|---|---|
| 约束过滤表 | 器械、空间、身体限制、能力门槛四类硬过滤 + 降阶替换 |
| 分数贡献表 | 单项距下一档分差 × 项目权重 × 效率系数 → 训练资源分配权重 |
| 周期排布表 | 按距体测天数划分准备期/进展期/减量期；训练日主题与组次模板 |
| 周反馈调整表 | `ADJ-01` 不适→减量+安全复查、完成率<50%→降低目标、RPE≥8.5→减量、偏累→减量、完成率高且轻松→升阶、完成率≥80%→正常推进 |
| 安全拦截表 | 独立于知识图谱与大模型，记录 `rule_id/动作/原因/替换动作` |

### 4.3 大模型只做「听懂 / 说清楚」

- **调用点 1**：自然语言 → 结构化画像（`/profile/parse`）：JSON Schema 校验，失败重试 2 次后降级表单（mock 用 `测试失败` 文本可演示降级路径）。
- **调用点 2**：计划对象 → 解释文本（`/plan/explain`）：Prompt 约束「只解释，不增删改动作与组次」，响应带 `checks.plan_unchanged`。
- 训练内容与安全判断**不由 LLM 决定**。

### 4.4 提醒

- 微信订阅消息：`config.subscribeTmplIds` 填入审核通过的一次性订阅模板 ID；未配置时自动使用**应用内提醒兜底**（训练日未打卡时「打卡」tab 显示角标 + 页面提醒卡）。
- 服务端定时扫描/推送由 FastAPI + APScheduler 实现（前端只负责授权与展示）。

## 5. 安全、隐私与合规

- 不采集疾病诊断/病历，只采集用户**自述**身体限制/不适，匿名化编号存储。
- 明确「非医疗建议，不替代医生/体育老师」，饮食提示标注「一般性参考，不构成营养处方」。
- `.env`、API Key、`project.private.config.json`、数据库文件、大视频均不入库。
- 小程序类目/名称/简介避开医疗、培训、治疗、康复等敏感表述；上线前完成小程序备案与域名 ICP 备案。

## 6. 自测与质量

```bash
# 环境：Node 24（或微信开发者工具自带 Node），Python 3.11 + Pillow（仅素材脚本）
node tools/smoke_test.js            # mock 全流程：67 项断言
node tools/simulate.js              # 页面级闭环模拟：325 断言（QA 维护）
node tools/validate-miniprogram.js  # 静态校验：445 项（JSON/WXML 事件绑定/组件路径/资源/禁用依赖）
node tools/page_harness.js          # 6 个页面真实 require + stub wx 生命周期/交互冒烟：58 断言
python tools/generate_assets.py     # 一键重建视觉素材（可选）
```

> 静态校验无法替代真机：上线前需在 iOS / Android 各 1 台真机跑通「表单、计划卡、示范播放、打卡、订阅消息」。
> 设计规范与验收清单见 [前端实现规范](docs/01-前端/前端实现规范.md)。

## 7. 后端联调（下一步）

1. 按 [接口契约](docs/02-接口/接口契约.md) 实现 15 个接口（统一 `{code,data,msg}`）。
2. 数据表与规则表按 `mini-program/data/*.js` 的结构迁移到 SQLite/MySQL 配置表。
3. 部署学生云服务器：Nginx + HTTPS + uvicorn/systemd；域名完成 ICP 备案。
4. 前端把 `utils/config.js` 的 `useMock` 改为 `false`，完成真机联调。
5. 订阅消息模板申请（审核 1-3 个工作日）后填入 `subscribeTmplIds`。

## 8. Git 协作

- 分支：`main`（可演示）/ `dev`（集成）/ `feature/*`、`fix/*`、`docs/*`。
- 提交规范：`feat/fix/docs/refactor/test/style/chore` + 中文简述。
- 远端：<https://github.com/DiceCow-afk/Xiaolian>（若本地尚未关联远端，执行
  `git remote add origin https://github.com/DiceCow-afk/Xiaolian.git` 后推送）。
- 首次推送（本地未拉取远端 LICENSE 提交时）：`git pull --rebase origin main --allow-unrelated-histories` → 解决冲突（保留 LICENSE）→ `git push -u origin main`。

---

*说明：体测项目、权重与评分标准以学校体育部公布为准；饮食提示仅为一般性参考。*
