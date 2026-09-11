# 架构

> **性质**：项目结构权威。确定前后端分层、目录树与依赖规则

## 前端[frontend]

### 目录层级与职责

```text
frontend/
├── src/                    # 入口：main.tsx / App.tsx / index.css（工作台式布局：左侧导航 + 主区切换）
├── modules/                # UI 模块层：knowledge-map / bookshelf / learning-zone / tutor / notes；每模块含 components/ 与 index.ts 出口
├── services/               # 业务服务层：与后端交互、状态管理、业务逻辑（与 UI 无关）
│   ├── runtime/            # 运行时基础设施：API client、WS 连接管理（后端接口封装并入此处）
│   └── <domain>/           # 按领域：knowledge-map / tutor / notes / profile
├── shared/                 # 通用组件
│   └── styles/             # 通用样式
├── constants/              # 通用常量
│   └── messages/           # 界面文案（全中文，不用 i18n）
├── mocks/                  # 开发用假数据（MSW 拦截请求），参与开发构建、不进生产
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
| 假数据 | MSW（Mock Service Worker） | mocks/ 开发假数据 |

### 依赖规则

- 单向依赖：`modules → services → shared / constants / utils`；modules 之间不互相依赖，跨模块复用走 shared。
- 布局为工作台式（左侧导航 + 主区切换），不引入路由库；模块切换由布局状态驱动。
- mocks 仅开发环境启用；prototype 不参与构建。


## 后端[src\teacheragent]

### 目录层级与职责

```text
src/teacheragent/
├── api/            # FastAPI 路由层：HTTP/WS 接口，含教师 Agent 对话流式接口；薄层，只做参数校验与转发
├── capabilities/   # Agent 原子能力：不限于角色，提供可复用的原子能力单元（LLM 调用、检索、解析、生成等），由 LangGraph 在 services 中装配
├── config/         # 配置：LLM settings（模型配置、热更新切换）、应用配置
├── constants/      # 通用常量与枚举：教材生命周期状态、Agent 角色名等；不提供提示词
├── docs/           # 包内设计说明
├── services/       # 业务编排：LangGraph 图定义与执行（教材生产线、教师 Agent 行为响应流）、画像服务、笔记服务、知识地图业务
├── shared/         # 跨层共享：LLM 调用日志拦截器（token/耗时/提示词版本自动落库）、通用工具
├── store/          # 存储层：SQLite（教材资产、调用日志、用户画像、行为记录）+ Neo4j（知识地图节点与边）
├── tests/          # 测试
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

- 单向依赖：`api → services → capabilities / store`；`capabilities` 依赖 `config / constants / shared`，不直接访问 store。
- `services` 定义 LangGraph 图，将 `capabilities` 的原子能力装配为工作流节点。
- 所有 LLM 调用经 `shared` 的日志拦截器统一落库，角色代码零侵入。
- LLM settings 运行时解析：每次调用按当前配置实例化客户端，支持教师 Agent 模型热更新。

