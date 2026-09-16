# 意图规划（intent-planning）

## 职责

识别学习意图、范围、深度与预期结果，产出 Learning Brief。

## 输入 → 输出

| 输入 | 输出 | 契约 |
|---|---|---|
| `ContextSnapshot`（+ `RevisionFeedback`） | `LearningBrief` | `content-pipeline/learning-brief@1` |

## 边界

- 不生成大纲，大纲归 `outline`。
- 人工确认节点属于编排层，不在本能力内。

## 提示词

- `prompts/planner.md`
## 代码设计哲学

> 待落实时补充。当前处于设计阶段，先不设计实现。