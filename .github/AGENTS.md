# AGENTS.md

面向 AI 编码代理的项目协作约定。

## 代码哲学

- **测试先行**：先写测试（验收断言），再写实现；验证脚本（如 `scripts/verify_infra.py`）是任务完成的判据，不是事后补品。
- **Contracts 先行**：先定义接口契约（函数签名、表结构 schema、API 请求/响应模型、常量枚举），再填实现；契约变更须先落 Task.md 确认。
- **Contracts 表达调用数据**：contracts 的核心职责是封装调用接口的 inputs、outputs，使数据语义明确、字段结构稳定；它不是所有 Python 数据类的集中目录。
- **先判断边界再选模型**：跨 API、服务、能力、基础设施或持久化边界的数据，先定义 contract，再实现生产代码；只有模块内短生命周期且不会被其他模块观察的数据，才直接使用局部类型、dataclass 或普通字典。
- **模型类型按用途选择**：OpenAPI 请求/响应、外部输入、需要严格运行时校验的中间数据，以及会持久化、审计或提供给前端的运行数据使用 Pydantic v2 `BaseModel`；内部业务对象、脚本输入输出和不需要运行时校验的装配结果使用 `dataclass`；SQLite row、LangGraph state 和其他本身就是字典的静态协议使用 `TypedDict`；可替换的客户端、仓储、加载器和 handler 等行为接口使用 `Protocol`。
- **严格模型保持边界清晰**：对外或需运行时校验的 `BaseModel` 默认使用 `ConfigDict(extra="forbid", strict=True)`；`TypedDict` 只提供静态类型，不承担运行时校验，也不替代 OpenAPI/domain model；`Protocol` 只描述行为，不承载数据快照。
- **按领域维护 contracts**：优先放在 `capabilities/<domain>/contracts.py`，不建立无边界的全局模型文件；API 专用模型放在 `api`，SQLite 精确行结构继续放在对应 `infrastructure/store/sqlite/tables` 模块。领域模型、API 模型和数据库 row 可以不同，但必须在明确位置转换，不能靠隐式字典传递。
- **契约变更同步消费者**：新增或修改 contract 时，先更新 Task.md，再更新所有消费者、测试、迁移和文档；持久化结构变化必须考虑旧数据和迁移，API 破坏性变化必须同步兼容策略。避免为同一概念创建平行且无转换规则的模型。
- **命名不加编号**：docs、SQL 脚本等文件用语义化名称，不用序号前缀，除非用户特殊要求。
- **命名成族**：以**维护的核心对象**为族，整族共用一个朴素词根；同一概念只允许一种叫法。
  - 族根先定「我们维护的是什么对象」，再用它命名其成员。大纲的族根是 `Outline`，不是 `Blueprint`。
  - 反面例：`CourseBlueprint` 与 `OutlineItem` 指同一棵树，最后只能拼出 `OutlineBlueprintVersion` 这种名字。
  - 比喻会随理解变化而失配，**朴素词优先**（`Outline` / `Node` / `Version` 直说是什么）。
  - **字段名不嵌类型名**：如 `dependsOnItemIds` 里的 `Item` 会随族改名而失效，用 `buildsOn` 这类不嵌类型的名字。
  - 详见 `Arch.md` 的「命名」。

## 表达规范

- 使用专业术语（分层架构、响应信封、仓储模式、设计令牌、Pydantic v2 等），避免口语化表述
- 陈述结论须给出依据：文件路径、命令输出或文档章节（如 `PRD.md §8.2`）

## 可用命令

| 工具 | 用途 | 示例 |
|---|---|---|
| `rg` | 全文检索，优先于 grep / Select-String | `rg "响应信封" src/` |
| `git` | 版本控制 | `git status`、`git diff`、`git log --oneline -10` |
| `uv` | Python 依赖与虚拟环境管理（以 `pyproject.toml` 为准） | `uv sync`、`uv add fastapi`、`uv run uvicorn src.api.main:app --reload` |

- 代码检索一律使用 `rg`，不使用 `findstr` / `grep`
- Python 依赖安装与脚本执行统一走 `uv`
