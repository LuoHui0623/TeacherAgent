# 写大纲（outline）

## 职责

按 Learning Brief 产出结构化教材大纲：章节主题、学习任务、依赖与验收标准。

## 输入 → 输出

| 输入 | 输出 | 契约 |
|---|---|---|
| `LearningBrief` + 结构化画像（+ `GateReview`） | `Outline` | `content-pipeline/outline@1` |

## 边界

- 不写正文，正文归 `chapter-writing`。
- 大纲的 Contract 校验与人工审批属于编排层与消费方。

## 提示词

- `agent/prompts/outline-architect.md`

## 代码设计哲学

- `messages.py` 负责把 `LearningBrief` 与结构化画像作为绑定表交给 outline 模板渲染，返回可记录的提示词消息；画像只注入一次，不在大纲节点中复制画像文本。
- 模板路径由图定义里节点的 `promptRef` 传入，渲染用的模板与记录下来的身份因此始终是同一份资产。
- 画像版本 ID 与内容哈希属于画像解析和调用日志溯源元数据，不进入 outline prompt context。
- 画像缺失分区不得臆测；需要假设时必须在输出中显式标注待确认。
