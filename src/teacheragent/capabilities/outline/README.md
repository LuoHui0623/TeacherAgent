# 写大纲（outline）

## 职责

按 Learning Brief 产出结构化教材大纲：章节主题、学习任务、依赖与验收标准。

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

- `messages.py` 负责把 `LearningBrief` 与结构化画像解析为 outline prompt context；画像只注入一次，不在大纲节点中复制画像文本。
- 画像版本 ID 与内容哈希属于画像解析和调用日志溯源元数据，不进入 outline prompt context。
- 画像缺失分区不得臆测；需要假设时必须在输出中显式标注待确认。
