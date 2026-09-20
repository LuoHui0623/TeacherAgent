# TeacherAgent

面向 IT 学习者的多智能体学习陪伴助手。

## 文档体系

**文档就近于它描述的代码。**

| 文档 | 位置 | 职责 | 权威范围 |
|---|---|---|---|
| [`PRD.md`](PRD.md) | 根 | 业务需求唯一权威 | 业务方向；**不含技术实现** |
| [`Arch.md`](Arch.md) | 根 | 项目结构唯一权威 | 分层、目录树、依赖规则、命名、文档体系 |
| [`Task.md`](Task.md) | 根 | 行动规划载体 | 已确认口径、待确认问题、实施任务与依赖 |
| [`.github/AGENTS.md`](.github/AGENTS.md) | `.github/` | AI 协作约定与代码哲学 | 测试先行 / Contracts 先行 / 命名成族 |
| [前端领域文档](frontend/docs/) | `frontend/docs/` | **前端领域与契约设计** | 前端契约、对象模型、桌面壳 |
| [后端领域文档](src/teacheragent/docs/) | `src/teacheragent/docs/` | **后端领域与资产设计** | 后端包结构、提示词、画像存储 |
| [前端包说明](frontend/README.md) · [后端包说明](src/teacheragent/README.md) | 各包根 | 包级说明 | 各自目录、命令与接口清单 |

**归属判据**：按「**这份契约 / 这个决策主导在哪一端的代码里**」决定。
**一份文档只有一个位置** —— 跨端内容**交叉引用**，不两端各放一份。

**冲突优先级**：业务 → `PRD.md`；结构 → `Arch.md`；当前行动 → `Task.md`；领域设计细节 → 该端 `docs/`；**跨端分歧 → `Arch.md`**。

## 领域设计文档

### 前端（`frontend/docs/`）

| 文档 | 领域 |
|---|---|
| [`knowledge-map.md`](frontend/docs/knowledge-map.md) | 知识地图：有源抽取、知识点与关系、领域演化、版本管理 |
| [`outline-contract.md`](frontend/docs/outline-contract.md) | 教材大纲与 LearningBrief 的契约设计 |
| [`desktop.md`](frontend/docs/desktop.md) | 桌面化：Electron 选型、落地要点、笔记 vault 安全设计 |

### 后端（`src/teacheragent/docs/`）

| 文档 | 领域 |
|---|---|
| [`agents.md`](src/teacheragent/docs/agents.md) | Agent 模型：Tutor 工具调用 Agent 与 Curriculum LangGraph 工作流 |
| [`prompts.md`](src/teacheragent/docs/prompts.md) | 统一 Agent 提示词资产：位置、加载与版本 |
| [`user-profile.md`](src/teacheragent/docs/user-profile.md) | 用户画像：两类资产、Markdown 规范、结构化契约、版本策略 |

## 设计哲学（节选）

- **命名成族**：以**维护的核心对象**为族，整族共用一个朴素词根；同一概念只允许一种叫法。
  例：大纲族围绕 `Outline` —— `Outline` / `OutlineNode` / `OutlineVersion`，不再混用 `CourseBlueprint` 这类不相干的比喻。

完整声明见 `Arch.md` 的「命名」与 `.github/AGENTS.md` 的「代码哲学」。
