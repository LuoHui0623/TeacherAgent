# capabilities

能力域是可复用的输入 → 输出单元。它们不等同于 Agent role，也不维护独立的
角色设定目录；具体 Agent 在 `teacheragent/agent/` 中按需装配能力。

## 当前能力域

- `profile`：用户画像 Markdown 的维护、解析与契约校验
- `outline`：Learning Brief 与结构化画像到课程大纲的消息装配
- `knowledge-map`：知识点与关系的维护与投影
- `tutoring`：Tutor 所需的教学能力
- `intent-planning`、`section-writing`、`review`、`revision`、`beautify`、`assessment`、`quality`：教材生产能力

## 提示词

所有提示词统一放在 `src/teacheragent/agent/prompts/`，由 Agent 入口显式加载：

- 角色设定：`agent/prompts/tutor.md`
- 课程工作流：`agent/prompts/curriculum.md`
- 能力任务指令：`agent/prompts/outline-architect.md`、`profile-parse.md` 等

能力域不能通过目录名推导 role，也不增加固定 capabilities 使用声明。实际装配以
`teacheragent/agent/tutor.py` 与 `teacheragent/agent/curriculum.py` 为准。

