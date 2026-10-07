# frontend

前端工作台（React 19 + Vite + Tailwind v4），采用 TopBar + SideNav + Content 的工作台式布局，无路由库。

## 目录职责

| 目录 | 职责 |
|---|---|
| `src/` | 应用入口：`main.tsx`、`App.tsx`、`index.css` |
| `modules/` | UI 模块层：组件与私有 CSS 同目录；不存放领域 mock |
| modules/learning-zone/ | 学习区、阅读器、RenderBlock UI、代码 fence 与 Tutor 抽屉（对话与发起） |
| modules/content-pipeline/ | 教材生产线可视化运行台、流程画布与节点检查器（只读） |
| `services/` | 业务服务层：数据获取、状态管理、解析、领域模型 |
| services/textbook/markdown/ | Markdown 解析、runtime registry、RenderBlock 构建 |
| services/content-pipeline/ | 图定义客户端、运行读模型、提示词地图、画布布局与产物 diff |
| services/chat.ts | 对话消息的读写与一轮 Tutor 对话 |
| `mocks/` | 前端 mock 与 fixture；生产 parser 和组件不得依赖 |
| `shared/` | Shell、通用组件、设计令牌与布局样式 |
| `constants/` | 通用常量与全中文界面文案 |
| `tests/` | Vitest 测试 |
| `scripts/` | 辅助脚本 |

`prototype/`、`utils/` 当前不存在，不纳入目录规则。

## 依赖规则

- `modules → services → shared / constants` 单向依赖。
- `modules` 之间不得互相依赖，跨模块复用进入 `shared`。
- `services` 不得依赖 React 或 `modules`。
- `mocks` 只能由 mock 入口或测试读取；parser、RenderBlock 和业务组件不得硬编码 mock。
- 模块私有样式与模块同目录，由模块入口导入。
- `src/index.css` 只保留全局基础、设计令牌与共享控件。
- Shell 固定为 TopBar + SideNav + Content；交互按钮必须提供稳定 `id`。

## Markdown 渲染架构

Markdown 是教材正文的权威源码，AST、RenderBlock 和 DOM 都是派生结果。

```text
Section Markdown
  -> unified + remark-parse + remark-gfm + remark-math + remark-directive
  -> Markdown AST
  -> parser / transformer
  -> RenderBlock[]
  -> learning-zone renderers
```

规则边界：

- 标准 Markdown：标题、段落、强调、链接、列表、引用、表格和代码 fence。
- 公式：`$...$` 与 `$$...$$`，由 KaTeX 渲染。
- Mermaid：标准 fenced code，通过 language 分发到专用 renderer。
- 代码 fence：由 runtime registry 判断是否具备 Sandbox 能力。
- Sandbox 与普通 fence 共用 `CodeFenceBlock`；白名单语言可切换模式，非白名单语言只显示普通 fence。
- `:::` 用于 callout/directive 等自定义区域，必须通过统一解析规则处理。
- 无法识别或渲染失败时保留原始源码，并产生 warning，不得静默丢失内容。

## 教材生产线

教材生产线通过工作流和结构化 Artifact 驱动多角色 Agent 协作，不把自由聊天记录作为节点之间的事实来源。

**事实来源在后端**：图定义、运行、产物、提示词快照与对话都存在后端库里，前端是只读投影，不持有图定义副本，也不自己算节点状态与 run 状态。前端侧的形状如下：

```text
GET /workflows/{id}                          -> 当前图定义（canvas 的唯一来源）
GET /workflows/{id}/runs[/{run_id}]          -> pipeline 历史与一次运行（含该 run 冻结的图）
GET /workflows/{id}/runs/{run_id}/nodes/{node_id}/prompt-map
                                             -> 节点提示词地图（三态 + 六阶段）
GET /prompts/{ref}[/versions|/diff]          -> 模板正文、版本序列与 diff
POST /workflows/{id}/runs                    -> 由一条 proposal 消息发起运行
POST .../pause | /resume | .../rerun | .../decide
GET/POST /chat/messages · POST /chat/turns   -> Tutor 对话与发起提议
```

- `services/content-pipeline/workflowSource.ts` 取图定义；读取完成前与失败时 canvas 显示降级提示。
- `services/content-pipeline/runs.ts` 是运行读模型：状态映射、时间线、产物行、指标这些视图派生都在这里（纯函数，测试直接跑），并封装暂停 / 继续 / 重跑 / 决断 / 发起五个写动作。
- `services/content-pipeline/promptMap.ts` 是节点提示词地图的客户端：六阶段、变量绑定、模板漂移、产物引用，以及阶段文案与摘要。
- `services/content-pipeline/canvasLayout.ts` 按图的依赖方向推导画布列位置（入口列 0，打回上游的回边跳过），因此「某次运行冻结的图」与「当前定义」不同时也能如实渲染。
- `services/content-pipeline/contracts.ts` 与 `artifactDiff.ts` 仍在使用：前者提供 `LearningBrief` / `Outline` 等载荷类型，后者提供两版正文的统一 diff。
- `services/chat.ts` 提供对话读写与一轮 Tutor 对话；学习区 Tutor 抽屉的「发起教材生产」写一条 proposal 消息，再由它创建运行并切到本模块。
- `tests/fixtures/workflows.json` 是接口响应的快照，由后端 `test_workflow_api.py` 断言与注册表一致；重建命令：`uv run python scripts/export_workflow_fixtures.py`。
- `mocks/content-pipeline/main-workflow.ts` 只按传入的图定义派生流程模板与版本记录，本身不含图数据。

### 旧的内存运行引擎（待清理）

`runtime.ts`、`artifactStore.ts`、`outlineStore.ts`、`runAnalytics.ts`、`agents.ts` 与 `mocks/content-pipeline/agents.ts` 是后端接管之前的演示引擎：应用已经不再引用它们，只剩它们自己的测试在引用（`tests/content-pipeline-{runtime,agents,insights,outline}.test.ts`）。保留还是删除待拍板；在拍板前不要把新功能接到这套引擎上。

## pipeline canvas

- 中央工作流画布统一定义为 `pipeline canvas`。
- Toolbar 提供指针模式和手模式；鼠标中键在任意模式下都可以平移画布。
- 画布是**只读运行视图**：节点拖动、连线创建、模板编辑都已移除，节点位置由 `canvasLayout.ts` 推出。
- 节点显示该次运行的真实状态（后端词表），未轮到的节点显示「等待」；选中节点在 inspector 内看提示词地图。

## Mock 与覆盖规则

- Markdown fixture 统一放在 `mocks/markdown/`。
- `mocks/markdown/fixtures.ts` 维护 mock 数据和确认口径覆盖关系。
- 每个已确认口径至少由一个合适的 fixture owner 覆盖。
- 一个 fixture 负责一个主要语法族，不要求覆盖所有能力和所有状态。
- 新增确定口径时扩展现有 fixture，或新增专用的 standard / extension / custom / interaction fixture。
- 专用能力必须有自己的边界和失败样例；通用 fallback 不替代功能自身的非法输入测试。

## UI ID 命名

所有交互元素的 `id` 统一使用：

```text
{domain}-{component}[-{action}][-{key}]
```

- `domain` 从受控业务域表选择，使用单个英文单词。
- `component` 使用稳定 kebab-case，不得包含动态值。
- `action` 例如 `open`、`toggle`、`save`、`cancel`、`run`、`copy`。
- `key` 放在最后，例如实体 ID、角色、颜色、模式或序号。
- 通用组件在基础 ID 后追加 `-close`、`-option-{value}` 等约定后缀。

| domain | 概念 |
|---|---|
| `shell` | 应用外壳、导航与全局布局 |
| `bookshelf` | 教材书架 |
| learning | 学习区、阅读器与 RenderBlock |
| content-pipeline | 教材生产线、工作流画布与节点检查器 |
| `settings` | 设置与个人化配置 |

示例：

```text
shell-sidebar-toggle
bookshelf-textbook-open-math-01
learning-outline-section-section-functions-as-models
learning-code-run-3
settings-profile-activate-researcher-profile-1
```

新增业务域前先加入本表；`domain` 一经使用不再改名。

## 设计语言

基于冷中性画布、青绿色操作色与琥珀状态色，使用 1px 结构线、8px 以内圆角、Phosphor 图标和统一 motion 曲线。设计令牌见 `shared/styles/tokens.css`，组件规范见 `shared/styles/system.css`。

- `shell` 只承载导航、工具栏和应用框架；`content` 承载业务内容。
- Content 中的主要表面使用 `card`，白底、1px 边框、8px 圆角，不使用浮起阴影。
- Card 内分层优先使用通栏分割线，不嵌套凸起或胶囊式表面。
- `ui-segmented-control` 在 card 内保持扁平，选中态使用背景或底线表达。

## 命令

```bash
npm run dev     # 开发，默认 5173
npm run build   # 类型检查与生产构建
npm run lint    # ESLint
npm run test    # Vitest
```
