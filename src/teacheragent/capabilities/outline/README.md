# 写大纲（outline）

## 职责

按 Learning Brief 产出结构化教材大纲：章节、学习目标、知识点、体量、依赖与验收标准。

## 输入 → 输出

| 输入 | 输出 | 契约 |
|---|---|---|
| `LearningBrief`（+ `RevisionFeedback`） | `CourseBlueprint` | `content-pipeline/course-blueprint@1` |

## 边界

- 不写正文，正文归 `section-writing`。
- 大纲的 Contract 校验与人工审批属于编排层与消费方。

## 提示词

- `prompts/architect.md`
## 代码设计哲学

> 待落实时补充。当前处于设计阶段，先不设计实现。