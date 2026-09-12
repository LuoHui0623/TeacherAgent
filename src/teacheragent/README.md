# teacheragent（后端）

Python 3.13 + uv（src 布局）。技术栈：FastAPI、LangChain（LLM client/settings）、LangGraph（工作流）、Neo4j（知识地图）、SQLite（教材资产/日志/画像/行为记录）。

> 提示词为 `prompts/*.md` 文档资产，由 git 版本化，**不入库**。

## 目录职责

| 目录 | 职责 |
|---|---|
| `api/` | HTTP 接口层：路由与请求/响应模型；启动时经 lifespan 执行迁移 |
| `services/` | 业务编排层：LangGraph 工作流定义；`llm.py` 为 LLM 调用唯一入口（读配置 → 建客户端 → 拦截器落库） |
| `capabilities/` | Agent 原子能力：`llm_client.py` 按配置实例化客户端、归一 token 用量 |
| `store/` | 持久化：`sqlite/`（`database.py` 连接与迁移、`tables/` 表行契约、`repositories/` 仓储、`scripts/` DDL） |
| `config/` | 纯配置：`paths.py` 路径、`env.py` 配置项读取、`llm.py` 模型候选与有效配置契约；**不访问 store** |
| `constants/` | 通用常量与枚举（教材生命周期状态、Agent 角色名）；不提供提示词 |
| `shared/` | 跨层共享：`llm_interceptor.py` 调用日志拦截器（上下文管理器，成功/异常均落库） |
| `docs/` | 领域文档 |

## 依赖规则

- 单向依赖：`api → services → capabilities / store`；`capabilities` 依赖 `config / constants / shared`
- LLM 调用统一走 `services.llm.invoke_llm`，业务代码零日志代码
- `config` 层为纯配置，不得依赖 `store`（由 `tests/test_layering.py` 强制）
- 包内 `__init__.py` 只做汇总导出，不承载定义
- LLM settings 每次调用现读现用，模型与 temperature 热更新即刻生效

## 存储契约

`scripts/*.sql` 的 DDL 是表结构**唯一权威**；`tables/*.py` 的行契约（`TypedDict`）
是 Python 侧镜像，列名与顺序由 `tests/test_table_contracts.py` 强制一致。

为尚无仓储消费方的表（`textbooks` / `user_profiles` / `behavior_logs`）暂不建行契约——
结构以 DDL 为准，等出现真实消费方再补。

迁移策略：首次发布前可直接改 `scripts/init.sql`（配合删除 `data/teacheragent.db` 重建）；
首次发布后一律新增脚本，不再改动已应用的脚本。

## 配置来源

| 项 | 来源 |
|---|---|
| API Key | `.env` 的 `API_KEY_NAME` → 系统环境变量（两级间接，`.env` 不含敏感值） |
| Base URL | `.env` 的 `OPENCODE_BASE_URL` |
| 模型候选 + 默认项 | `config/llm.py` |
| 当前模型 / temperature | `llm_settings` 表（用户喜好，可改） |

## 命令

```bash
uv sync                          # 安装依赖
uv run pytest                    # 运行测试
uv run uvicorn teacheragent.api.main:app --reload --port 8000   # 启动 API
uv run python app.py             # 一键启动（后端 + 前端）
```
