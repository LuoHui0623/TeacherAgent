# teacheragent（后端）

Python 3.13 + uv。技术栈：FastAPI、LangChain、LangGraph、Neo4j（知识地图）与 SQLite。

## 目录职责

| 目录 | 职责 |
|---|---|
| `api/` | HTTP 接口层与请求 / 响应模型 |
| `agent/` | 两类真实 Agent：Tutor 工具调用图、Curriculum LangGraph 工作流，以及统一提示词资产 |
| `services/` | 业务编排入口与领域服务 |
| `workflows/` | 具体业务流程说明与边界；不提供通用 Agent runtime |
| `capabilities/` | 可复用的输入 → 输出能力域，不等同于 Agent role |
| `infrastructure/` | LLM 客户端、调用日志、模型目录、Profile、SQLite 连接与仓储 |
| `config/` | 固化配置、环境变量与路径；不访问 store |
| `constants/` | 通用常量与 `AgentRole`（仅 `tutor` / `curriculum`） |
| `docs/` | Agent、提示词与用户画像等领域规范 |
| `tests/` | 后端契约与行为测试 |

## Agent 入口

- `teacheragent.agent.tutor.build_tutor_agent(model)`：使用 LangChain `create_agent`，注册 Tutor 工具并允许模型自主决定是否调用。
- `teacheragent.agent.curriculum.build_curriculum_graph()`：可运行的 LangGraph 课程设计图，当前为 `START → plan → validate → END`。
- `teacheragent.agent.prompts/`：所有提示词资产的统一位置。

`knowledge_map` 是能力域 / module，不是模型 role；用户画像解析与维护同样由能力实现，
按实际 Agent 装配使用，不增加固定 capabilities 声明契约。

## 依赖规则

- 分层单向依赖：`api → services → workflows / agent → capabilities → infrastructure`
- `infrastructure` 不依赖领域代码；`shared` 保持纯工具层。
- 所有普通 LLM 调用经 `infrastructure.llm.invoke_llm` 统一记录。
- `AgentRole` 与 `llm_profiles.role` 只有 `tutor`、`curriculum`。
- 所有提示词经 `infrastructure.llm.prompts.load_prompt("agent/prompts/<name>.md")` 加载。

## 配置来源

| 项 | 来源 |
|---|---|
| API Key / URL | 环境变量与 `.env` |
| 模型候选 | 服务启动时加载到内存目录 |
| 固化默认值 | `config/llm.yaml` |
| 当前模型 / temperature | `llm_profiles` 表，按 `tutor` / `curriculum` 隔离 |

## 命令

```bash
uv sync
uv run pytest
uv run uvicorn teacheragent.api.main:app --reload --port 8000
uv run scripts/dev.py
```

## API

| 方法 | 路径 | 用途 |
|---|---|---|
| `GET` | `/llm/models` | 读取模型目录 |
| `POST` | `/llm/models/refresh` | 刷新模型目录 |
| `GET/POST/PUT/DELETE` | `/llm/roles/{role}/profiles...` | 管理 `tutor` / `curriculum` Profile |
| `POST` | `/llm/invoke` | 使用指定 Agent role 执行调用 |
| `GET` | `/llm/call-logs` | 返回提示词地图所需的调用时间流 |
| `GET/PUT/POST` | `/user-profile/...` | 用户画像版本管理 |
