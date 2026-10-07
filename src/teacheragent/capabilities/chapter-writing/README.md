# 章节写作（chapter-writing）

## 职责

一章一位主笔：按单个 OutlineItem 生成该章的内容草稿，多章并行由编排层展开。
一个 OutlineItem 就是一个章节（见 `docs/outline-contract.md` 与 `ContentDraft.chapterId`），所以本章能力域的写作单位是章节，不是小节。

## 输入 → 输出

| 输入 | 输出 | 契约 |
|---|---|---|
| `CourseBlueprint` / OutlineItem | `ContentDraft` | `content-pipeline/content-draft@1` |

## 边界

- 只负责单个章节；按章节并行展开由编排层负责。
- 不做审校与美化。

## 提示词

- 计划资产：`agent/prompts/chapter-writer.md`（待编写）。

## 代码设计哲学

> 待落实时补充。当前处于设计阶段，先不设计实现。