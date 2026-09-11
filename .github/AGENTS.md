# AGENTS.md

面向 AI 编码代理的项目协作约定。

## 代码哲学

- **测试先行**：先写测试（验收断言），再写实现；验证脚本（如 `scripts/verify_infra.py`）是任务完成的判据，不是事后补品。
- **Contracts 先行**：先定义接口契约（函数签名、表结构 schema、API 请求/响应模型、常量枚举），再填实现；契约变更须先落 Task.md 确认。
- **命名不加编号**：docs、SQL 脚本等文件用语义化名称，不用序号前缀，除非用户特殊要求。

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
