# 教材生产线（content-pipeline）

## 职责

编排教材生产主流程：Tutor 上下文 → 结构化大纲 → 章节内容 → 审校修订 → 美化出题 → 质检发布。

## 编排的能力

| 顺序 | 能力域 | 输入 → 输出 | 节点 |
|---|---|---|---|
| 1 | `profile` | 上下文 → 结构化画像 | `context-snapshot` |
| 2 | `intent-planning` | `ContextSnapshot` → `LearningBrief` | `intent-planner` |
| — | 人工节点 | 确认 Learning Brief | `brief-approval` |
| 3 | `outline` | `LearningBrief` → `CourseBlueprint` | `outline-architect` |
| 4 | `section-writing` | `OutlineItem` → `ContentDraft` | `chapter-writers`（按条目并行） |
| 5 | `review` | `ContentDraft` → `ReviewReport` | `reviewer` |
| 6 | `revision` | `ContentDraft` + `ReviewReport` → `ContentDraft` | `reviser` |
| — | 人工节点 | 按章节确认 | `chapter-approval` |
| 7 | `beautify` | `ContentDraft` → `BeautifiedContent` | `beautifier` |
| 8 | `assessment` | `ContentDraft` → `AssessmentSet` | `assessment-generator` |
| 9 | `quality` | 内容 + 题目 → `PublicationManifest` | `quality-gate` / `publisher` |
| — | 人工节点 | 最终发布确认 | `publish-approval` |

现有实现参考：`frontend/services/content-pipeline/main-workflow.ts`（前端 mock 图定义，含节点、端口与边）。

## 流水线级提示词

`prompts/curriculum.md`：覆盖完整流水线的提示词（流水线级，非角色设定）。

## 边界

- 不实现能力域内部逻辑，只做装配与控制流。
- 能力域的角色设定提示词不写进本目录；本目录只放流水线级提示词。