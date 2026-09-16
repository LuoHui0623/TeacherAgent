# teacheragent（后端）

Python 3.13 + uv（src 布局）。技术栈：FastAPI、LangChain（LLM client/settings）、LangGraph（工作流）、Neo4j（知识地图）、SQLite（教材资产/日志/画像/行为记录）。


## 目录职责

| 目录 | 职责 |
|---|---|
| `api/` | HTTP 接口层：路由与请求/响应模型；启动时经 lifespan 执行迁移 |
| `services/` | 业务编排入口：LangGraph 工作流定义；`llm/` 只保留角色 Agent 装配物 |
| `workflows/` | 编排层：复用 capabilities（或加临时 / 手动节点）用 LangGraph 编排好的具体实现；自带流水线级提示词 |
| `capabilities/` | Agent 原子能力：按能力域目录组织（输入 → 输出），每域含 `README.md`（职责）与 `prompts/`（角色设定） |
| `infrastructure/` | 基建层：`llm/`（客户端、调用日志、模型目录、Profile、settings、提示词加载）+ `store/`（连接池、迁移、行契约、仓储、DDL） |
| `shared/` | 纯工具层：无状态、无持久化依赖 |
| `config/` | 纯配置：`paths.py` 路径、`env.py` 配置项读取、`llm.yaml` 固化配置、`llm.py` 配置契约；**不访问 store** |
| `constants/` | 通用常量与枚举（教材生命周期状态、Agent 角色名）；不提供提示词 |
| `docs/` | 领域文档与规范：画像设计、提示词资产规范 |
| `tests/` | 测试 |

## 依赖规则

- 分层单向依赖：`api → services → workflows → capabilities → infrastructure`
- `infrastructure` 是基建层：可依赖 `config / constants / shared`，**不得依赖** `capabilities / workflows / services / api`
- `shared` 是**纯工具层**：无状态、无持久化依赖，不得依赖 `infrastructure` 及以上任何层
- SQL / 图数据库驱动只允许出现在 `infrastructure/store/` 内
- 以上三条由 `tests/test_layering.py` 强制
- LLM 调用统一走 `infrastructure.llm.invoke_llm`，业务代码零日志代码
- `config` 层为纯配置，不得依赖 `store`
- 包内 `__init__.py` 只做汇总导出，不承载定义
- LLM settings 每次调用现读现用，模型与 temperature 热更新即刻生效
## 存储契约

`scripts/*.sql` 的 DDL 是表结构**唯一权威**；`tables/*.py` 的行契约（`TypedDict`）
是 Python 侧镜像，列名与顺序由 `tests/test_table_contracts.py` 强制一致。

尚无仓储消费方的表（`textbooks` / `user_profiles` / `behavior_logs`）暂不建行契约，
结构以 DDL 为准，等出现真实消费方再补。

迁移策略：首次发布前可直接改 `scripts/init.sql`（配合删除 `data/teacheragent.db` 重建）；
首次发布后一律新增脚本，不再改动已应用的脚本。

## 配置来源

| 项 | 来源 |
|---|---|
| API Key | `.env` 的 `API_KEY_NAME` → 系统环境变量（两级间接，`.env` 不含敏感值） |
| API URL | 系统环境变量 `API_URL`（兼容旧值 `OPENCODE_BASE_URL`） |
| 模型候选 | 服务启动时从固定 OpenCode 模型列表接口加载到内存；只保存 `id`，前端可主动刷新 |
| 固化默认值 | `config/llm.yaml`，默认 Agent Profile 使用 `omen-alpha`，仅作为无可用 Profile 时的兜底 |
| 当前模型 / temperature | `llm_profiles` 表：按 `role` 隔离、`profile_id` 唯一、支持切换激活项 |
| CORS 来源 | 系统环境变量 `CORS_ORIGINS`；默认允许本机 `5173` 与 `3055` 前端端口 |

## 命令

```bash
uv sync                          # 安装依赖
uv run pytest                    # 运行测试
uv run uvicorn teacheragent.api.main:app --reload --port 8000   # 启动 API
uv run scripts/dev.py            # 一键启动（后端 + 前端）
```

## LLM Profile API

| 方法 | 路径 | 用途 |
|---|---|---|
| `GET` | `/llm/models` | 读取内存模型目录中的模型 `id` |
| `POST` | `/llm/models/refresh` | 重新拉取模型列表；失败时保留旧目录，返回新增/删除与 Profile 状态变化 |
| `GET` | `/llm/roles/{role}/profiles` | 读取某角色的全部 Profile 和激活状态 |
| `POST` | `/llm/roles/{role}/profiles` | 创建 `profile_id` / `model` / `temperature` |
| `PUT` | `/llm/roles/{role}/profiles/{profile_id}` | 编辑指定 Profile 的模型与温度 |
| `POST` | `/llm/roles/{role}/profiles/{profile_id}/activate` | 切换激活 Profile，下一次 invoke 立即生效 |
| `DELETE` | `/llm/roles/{role}/profiles/{profile_id}` | 删除非激活 Profile |
| `POST` | `/llm/invoke` | 以当前激活 Profile 执行一次真实调用并写 `call_logs` |
