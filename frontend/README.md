# frontend

前端工作台（React 19 + Vite + Tailwind v4），采用 TopBar + SideNav + Content 的工作台式布局，无路由库。

## 目录职责

| 目录 | 职责 |
|---|---|
| `src/` | 应用入口：`main.tsx`、`App.tsx`、`index.css` |
| `modules/` | UI 模块层：组件与私有 CSS 同目录；不存放领域 mock |
| modules/learning-zone/ | 学习区、阅读器、RenderBlock UI、代码 fence 与 Tutor 抽屉 |
| modules/content-pipeline/ | 教材生产线可视化运行台、流程画布与节点检查器 |
| `services/` | 业务服务层：数据获取、状态管理、解析、领域模型 |
| services/textbook/markdown/ | Markdown 解析、runtime registry、RenderBlock 构建 |
| services/content-pipeline/ | 工作流模型、Contract、Artifact Store 与运行时 |
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

```text
WorkflowDefinition
  -> WorkflowRun
  -> NodeRun
  -> ArtifactVersion
  -> Approval / RunEvent
```

- `services/content-pipeline/contracts.ts` 定义 `LearningBrief`、`CourseBlueprint`、`ContentDraft`、`ReviewReport` 等核心 Contract。
- `services/content-pipeline/artifactStore.ts` 负责不可变版本、校验、确认和消费检查。`n- `services/content-pipeline/agents.ts` 定义 Agent 角色注册、IO Contract 声明、节点适配和遥测。`n- `services/content-pipeline/outlineStore.ts` 负责大纲版本、OutlineItem 工作状态和 stale 传播。`n- `services/content-pipeline/artifactDiff.ts` 与 `runAnalytics.ts` 提供版本对比、耗时、Token 和成本聚合。`n- `services/content-pipeline/workflowEditor.ts` 提供节点启停、配置编辑、拖拽位置、图校验与模板版本提交。`n- `mocks/content-pipeline/agents.ts` 提供完整角色链路的 mock Agent 实现。
- `services/content-pipeline/runtime.ts` 负责顺序与并行调度、Fan-out / Fan-in、Human Gate、逐项/批量审批、重试、取消和局部重跑。
- `mocks/content-pipeline/main-workflow.ts` 是教材生产主工作流定义。
- 第一版页面只做固定流程可视化；拖拽编排后置。
## pipeline canvas

- 中央工作流画布统一定义为 `pipeline canvas`。
- Toolbar 提供指针模式和手模式；鼠标中键在任意模式下都可以平移画布。
- 节点 card 仅在四条边的正中间提供连接点：左侧、上方为输入，右侧、下方为输出。
- 指针模式从连接点拖拽创建连线，靠近其他 card 时自动吸附最近的兼容连接点。
- 连线创建前校验输入输出 Artifact Contract，不兼容时拒绝。
- 节点或连线拖拽时按住 Shift 使用直线路径。
- 画布编辑通过 `WorkflowEditSession` 提交为新的 `WorkflowVersion`，不修改正在运行的版本。

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
