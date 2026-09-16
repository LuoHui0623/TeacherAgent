# 审校（review）

## 职责

审校内容草稿，产出结构化审校报告。

## 输入 → 输出

| 输入 | 输出 | 契约 |
|---|---|---|
| `ContentDraft` | `ReviewReport` | `content-pipeline/review-report@1` |

## 边界

- 只产出问题与建议，不修改内容；修改归 `revision`。

## 提示词

- `prompts/reviewer.md`
## 代码设计哲学

> 待落实时补充。当前处于设计阶段，先不设计实现。