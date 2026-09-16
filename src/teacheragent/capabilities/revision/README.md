# 修订整理（revision）

## 职责

按审校意见或人工审批意见修订内容，并完成二次整理。

## 输入 → 输出

| 输入 | 输出 | 契约 |
|---|---|---|
| `ContentDraft` + `ReviewReport` / `RevisionFeedback` | `ContentDraft`（修订版） | `content-pipeline/content-draft@1` |

## 边界

- 不自行发明审校意见之外的大幅改写。

## 提示词

- `prompts/reviser.md`
## 代码设计哲学

> 待落实时补充。当前处于设计阶段，先不设计实现。