# 架构

> **性质**：项目结构权威。确定前后端分层、目录树与依赖规则

## 命名

**以维护的核心对象为族。** 一个族共用一个朴素词根，同一概念只允许一种叫法。

| 原则 | 说明 |
|---|---|
| **以核心对象为族根** | 先确定「我们维护的是什么对象」，再用它命名成员。大纲的族根是 `Outline`，不是 `Blueprint` |
| **一个概念一种叫法** | 不混用同义比喻。反面例：`CourseBlueprint` 与 `OutlineItem` 指同一棵树，最终拼出 `OutlineBlueprintVersion` |
| **朴素优先于比喻** | 比喻会随理解变化而失配（今天的「蓝图」明天可能更像「路线图」）；朴素词（`Outline` / `Node` / `Version`）直说是什么 |
| **字段名不嵌类型名** | `dependsOnItemIds` 里的 `Item` 会随族改名而失效；改用 `buildsOn` 这类不嵌类型的名字 |

已定族：**大纲族** —— 容器 `Outline`、节点 `OutlineNode`、版本 `OutlineVersion`、存储态 `StoredOutline`。

> 命名成族是**设计哲学**，不随单个任务变化。声明见 `.github/AGENTS.md` 的「代码哲学」。
## 前端[frontend]

### 目录层级与职责

```text
frontend/
├── src/                    # 入口：main.tsx / App.tsx / index.css（工作台式布局：左侧导航 + 主区切换）
├── modules/                # UI 模块层：组件与私有 CSS 同目录；`mocks/` 存前端样例数据
├── services/               # 业务服务层：与后端交互、状态管理、业务逻辑（与 UI 无关）
│   ├── runtime/            # 运行时基础设施：API client、WS 连接管理（后端接口封装并入此处）
│   └── <domain>/           # 按领域：knowledge-map / tutor / notes / profile
├── shared/                 # Shell 与通用组件
│   ├── ui/                 # Button / Field / Modal / Drawer / Toast primitives
│   └── styles/             # tokens / system / shell / cover themes
├── constants/              # 通用常量
│   └── messages/           # 界面文案（全中文，不用 i18n）
├── tests/                  # 前端测试（vitest + msw）
├── prototype/              # 原型设计稿（设计探索产物，不参与构建）
├── scripts/                # 脚本（构建辅助等）
└── utils/                  # 纯工具函数
```

### 技术栈

| 组件 | 选型 | 职责 |
|---|---|---|
| 框架 | React 19 + TypeScript | UI 构建 |
| 构建 | Vite 8 | 开发服务器（热更新）+ 生产打包 |
| 样式 | Tailwind CSS v4（@tailwindcss/vite） | 原子化样式 |
| 编辑器内核 | CodeMirror 6 | 笔记区 Markdown 编辑、语法高亮、实时预览 |
| 图谱可视化 | sigma.js（WebGL 渲染） | 知识地图 + 笔记图谱视图；支撑大规模图（后续拓展非 IT 领域） |
| 状态管理 | Zustand（本地状态）+ TanStack Query（服务端状态） | services 层状态 |
| 假数据 | MSW（Mock Service Worker）+ 模块 mocks | 接口拦截与 UI 样例数据 |

### 依赖规则

- 单向依赖：`modules → services → shared / constants / utils`；modules 之间不互相依赖，跨模块复用走 shared。
- 模块私有样式放在 `modules/<domain>/*.css` 并由模块入口导入；`src/index.css` 只承载全局基础、共享控件与布局框架。
- Shell 固定为 `TopBar + SideNav + content`；共享交互组件必须使用 `shared/ui` primitive，所有按钮必须提供稳定 `id`。
- 布局为工作台式（左侧导航 + 主区切换），不引入路由库；模块切换由布局状态驱动。
- 前端样例数据统一放在 `modules/mocks/`；MSW 仅开发环境启用，prototype 不参与构建。


## 后端[src\teacheragent]

### 目录层级与职责

```text
src/teacheragent/
├── api/              # FastAPI 路由层：HTTP/WS 接口，含教师 Agent 对话流式接口；薄层，只做参数校验与转发
├── services/         # 业务编排入口：LangGraph 图定义与执行、画像服务、笔记服务、知识地图业务
├── workflows/        # 编排层：复用 capabilities（或加临时 / 手动节点）用 LangGraph 编排好的具体实现
├── capabilities/     # Agent 原子能力：按能力域目录组织（输入 → 输出），每域含 README.md 与 prompts/
├── infrastructure/   # 基建层：llm/（LLM 调用、日志、模型目录、Profile、settings）+ store/（SQLite / Neo4j 持久化）
├── shared/           # 纯工具层：无状态、无持久化依赖的通用工具
├── config/           # 配置：LLM settings（固化配置、环境变量、表覆盖值）、应用配置
├── constants/        # 通用常量与枚举：教材生命周期状态、Agent 角色名等；不提供提示词
├── docs/             # 包内设计说明
├── tests/            # 测试
└── __init__.py
```

### 技术栈

| 组件 | 选型 | 职责 |
|---|---|---|
| 语言与包管理 | Python 3.13 + uv（src 布局，uv_build） | 运行时与依赖 |
| 接口层 | FastAPI | HTTP/WS 接口，教师 Agent 对话流式响应 |
| LLM 客户端与设置 | LangChain | 模型调用封装、LLM settings（支持热更新）、提示词管理 |
| 工作流编排 | LangGraph | 教材生产线（大纲→主笔→修订→美化→出题，含人工确认节点）、教师 Agent 行为响应流 |
| 图数据库 | Neo4j | 知识地图：知识点节点、先修/包含/关联边、笔记双链注入 |
| 关系数据库 | SQLite | 教材资产、调用全量日志、用户画像、学习行为记录、提示词版本 |

### 依赖规则

- 分层单向依赖：`api → services → workflows → capabilities → infrastructure`。
- `infrastructure` 是基建层：可以依赖 `config / constants / shared`，**不得依赖** `capabilities / workflows / services / api`（由 `tests/test_layering.py::test_infrastructure_does_not_depend_on_domain` 强制）。
- `shared` 是**纯工具层**：无状态、无持久化依赖，不得依赖 `infrastructure` 及以上任何层（由 `tests/test_layering.py::test_shared_layer_is_pure_utilities` 强制）。
- `capabilities` 的每个能力域是一个可复用的「输入 → 输出」单元，由 `workflows`（或 `services`）装配使用；能力域自带 `README.md`（职责）与 `prompts/`（角色设定）。
- `workflows` 是具体实现：复用 `capabilities`，允许附加临时 / 手动节点；workflow 自带的 `prompts/` 承载**覆盖完整流水线的提示词**，与能力域的**角色设定**两层并存。
- SQL / 图数据库驱动只允许出现在 `infrastructure/store/` 内（由 `tests/test_layering.py::test_store_is_only_sql_owner` 强制）。
- 所有 LLM 调用经 `infrastructure.llm.call_logger` 统一落库，角色代码零侵入。
- LLM Profile 运行时解析：`config/llm.yaml` 管固化兜底，`.env`/环境变量管秘密与部署差异，`llm_profiles` 表按角色保存多个 Profile 与激活项；模型候选存放在内存目录，前端可触发刷新。