# teacheragent（后端）

Python 3.13 + uv。技术栈：FastAPI、LangChain、LangGraph、Neo4j（知识地图）与 SQLite。

## 目录职责

| 目录 | 职责 |
|---|---|
| `api/` | HTTP 接口层与请求 / 响应模型 |
| `agent/` | Tutor 工具调用型 Agent 与统一提示词资产 |
| `services/` | 业务编排入口与领域服务（含 `chat`：对话消息与一轮 Tutor 对话） |
| `workflows/` | 工作流编排层：图定义、node_id 注册、图快照冻结与运行；`execution/` 是写路径（推进、发起、控制），`runs/` 是读路径（历史与提示词地图）。不提供通用 Agent runtime |
| `capabilities/` | 可复用的输入 → 输出能力域，不等同于 Agent role |
| `infrastructure/` | LLM 客户端、统一模型调用与限流、模型目录、Profile、SQLite 连接与仓储 |
| `config/` | 固化配置、环境变量与路径；不访问 store |
| `constants/` | 通用常量与 `AgentRole`（仅 `tutor` / `curriculum`） |
| `docs/` | Agent、提示词、对话与用户画像等领域规范 |
| `tests/` | 后端契约与行为测试 |

## Agent 入口

- `teacheragent.agent.tutor.build_tutor_agent(model)`：使用 LangChain `create_agent`，注册 Tutor 工具并允许模型自主决定是否调用。
- `teacheragent.workflows`：工作流编排层，持有图定义（教材生产主流程 16 节点 / 25 连线）、node_id 注册表与图快照冻结，并推进它在库上的运行（`execution/` 写、`runs/` 读）；发起与控制也在 `execution/`（`start_run` 只认一条 proposal 消息，暂停 / 继续是内存行为，重跑按代次追加）。导入即注册。
- `teacheragent.agent.prompts/`：所有提示词资产的统一位置。

`knowledge_map` 是能力域 / module，不是模型 role；用户画像解析与维护同样由能力实现，
按实际 Agent 装配使用，不增加固定 capabilities 声明契约。

## 依赖规则

- 分层单向依赖：`api → services → workflows / agent → capabilities → infrastructure`
- `infrastructure` 不依赖领域代码；`shared` 保持纯工具层；`workflows` 不依赖 `api` / `services`；`capabilities` 只经仓储接口访问存储。以上四条由 `tests/test_layering.py` 逐条断言。
- 所有 Agent 装配后的模型调用统一使用 `infrastructure.llm.model.LlmModel` 并记录到 `llm_runs`；普通调用经 `infrastructure.llm.invoke_llm`，Tutor 装配经 `services.llm.base_agent`。
- 限流按 provider/model 路由管理，支持并发上限与可选 RPS；运行时状态通过 `/llm/runtime/limits` 查询和更新。
- `AgentRole` 与 `llm_profiles.role` 只有 `tutor`、`curriculum`。
- 所有提示词经 `infrastructure.llm.prompts.load_prompt("agent/prompts/<name>.md")` 加载，由 `render_prompt` 按绑定表渲染成调用消息（有 `${{ 名称 }}` 的模板把静态前缀与注入载荷分成两条）；只读场景用 `read_prompt`，它不写快照。

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
| `GET` | `/llm/call-logs` | 原始调用记录：`llm_runs` 派生的调用时间流，用于对照与调试（提示词地图已改读 `/workflows/{id}/runs/...`） |
| `GET/PUT` | `/llm/runtime/limits` | 查询或更新 provider/model 路由的限流配置与运行状态 |
| `GET/PUT/POST` | `/user-profile/...` | 用户画像版本管理 |
| `GET` | `/workflows` | 列出已注册的 workflow 与图版本摘要 |
| `GET` | `/workflows/{id}` | 取一个 workflow 的完整图定义（前端 canvas 的唯一来源） |
| `GET` | `/workflows/{id}/runs` | pipeline 历史：状态、起止与图版本 |
| `GET` | `/workflows/{id}/runs/{run_id}` | 一次运行的详情：摘要 + 冻结的图 + 节点摘要 |
| `GET` | `/workflows/{id}/runs/{run_id}/nodes` | 该次运行的节点摘要列表 |
| `GET` | `/workflows/{id}/runs/{run_id}/nodes/{node_id}/prompt-map` | 节点提示词地图（三态 + 六阶段） |
| `POST` | `/workflows/{id}/runs` | 由一条 `proposal` 消息发起一次运行（时间只认这条提议） |
| `POST` | `/workflows/{id}/runs/{run_id}/pause` `/resume` | 暂停 / 继续（执行器内存行为，不落库） |
| `POST` | `/workflows/{id}/runs/{run_id}/nodes/{node_id}/rerun` `/decide` | 局部重跑（该节点与下游进新代次）与人工决断 |
| `GET/POST` | `/chat/messages` | 按时间读回对话 / 追加一条消息（`type` 为 `chat` 或 `proposal`） |
| `POST` | `/chat/turns` | 走一轮 Tutor 对话：用户发言与回复都落库，模型输入取整段对话 |
| `GET` | `/prompts/{ref}` | 取提示词正文与变量清单；带 `content_hash` 取历史版本 |
| `GET` | `/prompts/{ref}/versions` | 该资产的版本序列 |
| `GET` | `/prompts/{ref}/diff` | 任意两版之间的统一 diff |
