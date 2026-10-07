# Agent / Role 迁移说明

本项目后端只保留两个模型 Agent role：`tutor` 与 `curriculum`。知识地图继续作为 module / capability，
不占用模型 Profile 配置，不承担独立 Agent 的自主决策职责。

目录结构的领域入口为：

```text
src/teacheragent/
├── agent/            # Tutor 与统一 prompts/
├── api/              # FastAPI
├── services/         # 业务服务
├── workflows/        # 图定义、node_id 注册与图快照冻结
├── capabilities/     # 可复用输入 → 输出能力
├── infrastructure/   # LLM / SQLite / 日志
├── config/
├── constants/
├── docs/
└── tests/
```

`AgentRole`、`config/llm.yaml`、`llm_profiles.role`、前端模型配置和测试必须保持同一 role 全集。
具体能力装配不通过固定 capabilities 声明表达；`tutor` 以 `agent/tutor.py` 的实际代码为准，教材生产线的节点实现是 `workflows/` 图定义的下游。
