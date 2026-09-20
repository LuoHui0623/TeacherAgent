# 教材生产线（content-pipeline）

## 职责

编排教材生产主流程：Tutor 上下文 → 结构化大纲 → 章节内容 → 审校修订 → 美化出题 → 质检发布。

## 当前后端 Agent 边界

课程设计由 `teacheragent.agent.curriculum` 的 LangGraph 图负责；Tutor 通过工具调用型
Agent 提供学习上下文和知识地图查询。能力域只提供可复用的输入 → 输出逻辑，实际装配
由 Agent / workflow 代码完成。

## 提示词

课程设计提示词位于 `agent/prompts/curriculum.md`，统一由
`infrastructure.llm.prompts.load_prompt()` 加载。

## 边界

- 不实现通用 Agent runtime。
- 不把知识地图注册为独立 Agent role。
- 不在本目录维护角色 `settings.md` 或分散提示词副本。
