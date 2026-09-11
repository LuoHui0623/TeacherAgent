# teacheragent（后端）

Python 3.13 + uv（src 布局）。技术栈：FastAPI、LangChain（LLM client/settings）、LangGraph（工作流）、Neo4j（知识地图）、SQLite（教材资产/日志/画像/提示词版本）。

## 目录职责

| 目录 | 职责 |
|---|---|
| `api/` | HTTP 接口层：路由与请求/响应模型 |
| `services/` | 业务层：LangGraph 工作流定义，将 capabilities 装配为节点 |
| `capabilities/` | Agent 原子能力：LLM 调用、检索、解析、生成等可复用单元 |
| `store/` | 持久化：SQLite 与 Neo4j 访问 |
| `config/` | 配置加载（含 LLM settings 运行时解析，支持热更新） |
| `constants/` | 通用常量与枚举（教材生命周期状态、Agent 角色名）；不提供提示词 |
| `shared/` | 共享工具；LLM 调用拦截器统一落库（零侵入） |
| `docs/` | 领域文档 |
| `tests/` | 测试 |

## 依赖规则

- 单向依赖：`api → services → capabilities / store`
- LLM 调用一律经 `shared` 拦截器记录调用日志
- LLM settings 运行时解析，支持热更新

## 命令

```bash
uv sync                          # 安装依赖
uv run uvicorn teacheragent.api.main:app --reload --port 8000   # 启动 API
uv run python app.py             # 一键启动（后端 + 前端）
```
