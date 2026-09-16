# capabilities

Agent 原子能力层。每个能力域一个子目录，域内保持无状态、可单测。

## 能力域定义

能力域是**具体集合好的能力**：通常是某类动作，或某个对象，实现「输入 → 输出」。

- **不按 Agent 角色名划分**。同一个角色在不同能力下需要不同能力单元，按角色聚合会把多个能力挤进同一份实现与同一份提示词。
- **拆分的依据是可复用性**：能力被拆开后，可以被多条 workflow 复用，而不是被某个角色独占。

## 能力域清单

| 能力域 | 类型 | 输入 → 输出 |
|---|---|---|
| `profile` 用户画像 | 对象 | 学习交互 → Markdown；Markdown → 结构化画像 |
| `tutoring` 学习辅导 | 动作 | 学习上下文 → 辅导回答 |
| `knowledge-map` 知识地图 | 对象 | 教材 / 笔记 → 知识点与关系 |
| `intent-planning` 意图规划 | 动作 | `ContextSnapshot` → `LearningBrief` |
| `outline` 写大纲 | 动作 | `LearningBrief` → `CourseBlueprint` |
| `section-writing` 章节写作 | 动作 | `OutlineItem` → `ContentDraft` |
| `review` 审校 | 动作 | `ContentDraft` → `ReviewReport` |
| `revision` 修订整理 | 动作 | `ContentDraft` + `ReviewReport` → `ContentDraft` |
| `beautify` 美化 | 动作 | `ContentDraft` → `BeautifiedContent` |
| `assessment` 出题 | 动作 | `ContentDraft` → `AssessmentSet` |
| `quality` 质检发布 | 动作 | 内容 + 题目 → `PublicationManifest` |
| `orchestration` 编排 | 能力 | 能力集合 → LangGraph workflow |

> **基建不在此层**：LLM 调用、调用日志与持久化都已归入 `infrastructure/`（`llm/` + `store/`），它们不满足「某类动作或对象」的能力域定义，因此不计入上表。

## 目录规范

每个能力域目录固定包含：

| 路径 | 内容 |
|---|---|
| `README.md` | 职责、输入 → 输出、边界、提示词清单、代码设计哲学 |
| `prompts/` | 该能力域的提示词资产，就近归属 |

- 提示词**不通用**：不同能力维护各自的提示词。
- 顶层 `src/teacheragent/prompts/` 已移除；规范见 `docs/prompts.md`。

## 与 workflows 的分工

能力域只管「术业有专攻」的那一件事；把多个能力装配成整条流水线属于 `workflows/`。

| 层 | 关注点 | 提示词 |
|---|---|---|
| `capabilities/` | 一个能力域做好一件事（输入 → 输出） | **角色设定** |
| `workflows/` | 复用能力（或加临时 / 手动节点）用 LangGraph 编排 | **覆盖完整流水线的提示词** |

一个提示词不干所有事情：两层提示词并存，互不替代。详见 `workflows/README.md`。

## 职责规划的写法

每个能力域 `README.md` 至少写清：

1. **职责**：这个能力做什么。
2. **输入 → 输出**：契约类型与 `schemaId`。
3. **边界**：明确不做什么，避免能力之间互相渗透。
4. **提示词清单**。
5. **代码设计哲学**：落实时补充，设计阶段留空占位。

## 依赖规则

- 能力域之间**不互相依赖**，跨域复用走 `shared/`。
- 能力域允许依赖 `config / constants / shared`；经 store 仓储接口访问存储是唯一例外。
- 原子能力**不得反向依赖编排层** `orchestration`；编排层负责装配原子能力，依赖方向单向。