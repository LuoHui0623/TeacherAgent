# 章节写作（section-writing）

## 职责

按单个 OutlineItem 生成章节内容草稿。

## 输入 → 输出

| 输入 | 输出 | 契约 |
|---|---|---|
| `CourseBlueprint` / OutlineItem | `ContentDraft` | `content-pipeline/content-draft@1` |

## 边界

- 只负责单个条目；按条目并行展开由编排层负责。
- 不做审校与美化。

## 提示词

- `prompts/writer.md`
## 代码设计哲学

> 待落实时补充。当前处于设计阶段，先不设计实现。