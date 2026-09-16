# infrastructure

基建层。提供机制，**不承载领域语义**。

| 子目录 | 负责 |
|---|---|
| `llm/` | LLM 调用基建：客户端、调用日志、模型目录、Profile、settings 合并、提示词加载 |
| `store/` | 持久化基建：SQLite 连接池与迁移、仓储、表行契约、DDL；Neo4j 驱动池 |

## 为什么独立成层

`llm` 与调用日志曾放在 `capabilities/llm/`，但它们不是「某类动作或对象」的能力域，只能靠「能力层可经仓储访问存储」的例外条款苟活。

它们又放不进 `shared/`：`shared/` 是**纯工具层**，`tests/test_layering.py::test_shared_layer_is_pure_utilities` 强制它无持久化依赖，而 `llm` 下的 `call_logger` / `catalog` / `profiles` / `settings` 四个模块都要读写 SQLite。

因此独立成基建层：允许依赖存储，但不允许承载领域语义。

## 依赖规则

- 允许依赖：`config` / `constants` / `shared`，以及 `infrastructure` 内部模块。
- **不得依赖**：`capabilities` / `workflows` / `services` / `api`（由 `tests/test_layering.py::test_infrastructure_does_not_depend_on_domain` 强制）。
- SQL / 图数据库驱动只允许出现在 `store/` 内（由 `test_store_is_only_sql_owner` 强制）。

## llm/

| 模块 | 职责 |
|---|---|
| `client.py` | 建客户端、抽取 usage、错误描述 |
| `invoke.py` | 读配置 → 建客户端 → 日志落库 → 调用 |
| `call_logger.py` | 一次 LLM 调用的日志统一落库 |
| `catalog.py` | 模型目录（内存候选 + 刷新） |
| `profiles.py` | 按角色的 Profile 管理 |
| `settings.py` | 固化配置 + 表覆盖值 + 环境变量的合并与保存 |
| `prompts.py` | 提示词资产加载与版本管理 |

## store/

| 路径 | 职责 |
|---|---|
| `connection.py` | SQLite 连接池与 Neo4j 官方驱动池 |
| `sqlite/migrations.py` | 按文件名顺序执行 `scripts/*.sql`，幂等 |
| `sqlite/repositories/` | 表级持久化访问（仓储） |
| `sqlite/tables/` | 行契约（`TypedDict`），与 DDL 由 `tests/test_table_contracts.py` 交叉校验 |
| `sqlite/scripts/` | DDL —— 表结构的**唯一权威** |