# 质检发布（quality）

## 职责

对美化稿与题目做最终质检与渲染验证，并冻结发布版本。

## 输入 → 输出

| 输入 | 输出 | 契约 |
|---|---|---|
| `BeautifiedContent` + `AssessmentSet` | `ValidationReport`、`PublicationManifest` | `content-pipeline/validation-report@1`、`content-pipeline/publication-manifest@1` |

## 边界

- 质检失败只产出失败报告并回流修订，不自行修改内容。

## 提示词

- `prompts/validator.md`
## 代码设计哲学

> 待落实时补充。当前处于设计阶段，先不设计实现。