# workflows

编排层使用 LangGraph 把能力域装配成可执行流程。当前课程设计工作流入口为
`teacheragent.agent.curriculum.build_curriculum_graph()`，不创建通用
`infrastructure/agent/` 运行时抽象。

教材生产线的完整产品图仍由前端 content-pipeline 模块描述；后端 Curriculum Agent
先提供最小可运行的 `START → plan → validate → END` 图，后续按契约扩展节点。

所有提示词统一位于 `src/teacheragent/agent/prompts/`，workflow 不再拥有独立的
`prompts/` 目录。
