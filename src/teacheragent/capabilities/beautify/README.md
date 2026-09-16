# 美化（beautify）

## 职责

对最终修订稿做排版增强：知识点 Anchor、公式、列表、辅助内容与封面。

## 输入 → 输出

| 输入 | 输出 | 契约 |
|---|---|---|
| `ContentDraft` | `BeautifiedContent` | `content-pipeline/beautified-content@1` |

## 边界

- 只能基于最终修订稿增强，不改变语义、Anchor 与知识点引用。

## 提示词

- `prompts/beautifier.md`
## 代码设计哲学

> 待落实时补充。当前处于设计阶段，先不设计实现。