# 写大纲（outline）

## 职责

按 Learning Brief 产出结构化教材大纲：章节、学习目标、知识点、体量、依赖与验收标准。

## 输入 → 输出

| 输入 | 输出 | 契约 |
|---|---|---|
| `LearningBrief` + 结构化画像（+ `RevisionFeedback`） | `Outline` | `content-pipeline/outline@1` |

## 边界

- 不写正文，正文归 `section-writing`。
- 大纲的 Contract 校验与人工审批属于编排层与消费方。

## 提示词

- `agent/prompts/outline-architect.md`
## 代码设计哲学

- `messages.py` 把 `LearningBrief` 与结构化画像一起注入角色消息；画像只注入一次，不在大纲节点中复制画像文本。
- 画像的版本 ID 与内容哈希随 `learnerProfile.source` 进入模型输入，调用日志可回溯到具体 Markdown 版本。
- 画像缺失分区不得臆测；需要假设时必须在输出中显式标注待确认。
