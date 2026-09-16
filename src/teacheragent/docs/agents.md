# Agent 模型

> **性质**：Agent 层的设计说明。定义 `capabilities → workflows → agents` 三层关系、两类 Agent、目录规范与基建边界。
> 与 `docs/prompts.md`（提示词规范）、`capabilities/README.md`、`workflows/README.md` 配套阅读。

## 一、三层关系

```text
capabilities/<能力域>/     原子能力：一个「输入 → 输出」单元，术业有专攻
        ↓ 被装配
workflows/<workflow>/      编排：复用 capabilities（或加临时 / 手动节点）用 LangGraph 编排好的具体实现
        ↓ 被消费
agents/<role>/             角色：角色设定 + 它被装配了什么
```

关键点：**Agent 的真实能力来自「装配」，不来自 capabilities 的粒度。**

- 不要按能力数量去切 role。capabilities 有 12 个不等于要有 12 个 agent。
- 一个 agent 的真实能力 = 它消费的 workflow 或它可调用的 skills / tools 的集合。
- role 的数量与边界由 agent 本身决定，与能力数量无关。

## 二、两类 Agent

| 类型 | 行为由什么决定 | 典型形态 | 真实能力来自 |
|---|---|---|---|
| **固定工作流型** | workflow（预定义图，路径确定） | 教材生产线 | `workflows/content-pipeline` 装配多个能力域 |
| **工具调用型** | 模型在运行时决定调哪个 tool | 教师 Agent（辅导） | 一组 skills / tools，靠 function call 组合 |

两类不是互斥的终态：固定工作流可以逐步开放若干 tool 给模型，工具调用型也可以在关键环节插入固定子流程（如人工审批）。

**判断标准**：路径是否事先确定。确定就是 workflow，不确定（交给模型按上下文决定）就是 tool。

## 三、目录规范

```text
agents/
└── <role>/
    ├── README.md      # 职责、类型（固定工作流 / 工具调用）、依赖
    ├── settings.md    # 角色设定：人格、行为准则、输出风格
    └── …              # 装配声明：固定工作流指向 / 可用 skills 与 tools 清单
```

- **角色设定按 role 唯一存放**，一个 role 一份（`settings.md`），不散落在各能力域。
- 能力域目录下只放**任务指令**（`capabilities/<域>/prompts/<task>.md`）与 workflow 的**流水线提示词**（`workflows/<名>/prompts/`）。
- 调用时拼装：**角色设定 + 任务指令**。

三层提示词的分工：

| 提示词 | 位置 | 定义什么 |
|---|---|---|
| 角色设定 | `agents/<role>/settings.md` | 谁在说话：人格、行为准则、输出风格 |
| 任务指令 | `capabilities/<域>/prompts/<task>.md` | 这次产出什么：输入、输出、约束 |
| 流水线提示词 | `workflows/<名>/prompts/<name>.md` | 整条链的协作方式 |

## 四、与基建的边界

**机制进基建，角色留领域。**

| 内容 | 归属 | 理由 |
|---|---|---|
| Agent 运行时：tool-calling 循环、工具注册与分发、消息编排、终止条件 | `infrastructure/agent/` | 与领域无关的机制 |
| 具体角色：`tutor`、`curriculum` 等 | `agents/<role>/` | 承载领域语义（学习者、教材……） |

把具体角色放进 `infrastructure/` 会把领域语义混进机制层，与 `infrastructure/README.md` 里「不承载领域语义」的原则冲突。

## 五、与 Role 配置的关系

`llm_profiles` 表按 `role` 保存模型与温度。role 是**配置粒度**，与 agent 一一对应：

- 一个 role → 一份角色设定（`agents/<role>/settings.md`）
- 一个 role → 一组模型配置（`llm_profiles.role`）

因此定稿 agent 清单的同时也就定稿了 role 全集；`constants/roles.py` 的 `AgentRole` 需要与 `agents/` 下的目录保持一致。

## 六、画像构建的归属（示例推演）

按本模型，「更新画像」的归属是清楚的：

| 层 | 内容 |
|---|---|
| capability | `capabilities/profile` 的「更新画像」：旧画像 + 新增信息 → 新画像 |
| tool | 在 `agents/tutor/` 里声明为可调用 tool，供模型 function call |
| 触发 | 模型在互动中自行决定何时调用 |

所以「画像构建属于 Tutor」与「画像能力归 `profile` 域」不矛盾：**能力归 profile，Tutor 把它作为 tool 暴露**。角色与能力正交 —— 学习行为、练习、笔记要更新画像时，调的是同一个 capability，不需要碰 `tutoring`。

## 七、待确认

1. [待确认]。**Agent 清单**：当前已知需要 `tutor`（工具调用型）与 `curriculum`（固定工作流型）。`knowledge_map` 是独立 agent 还是纯 capability？画像更新是否需要一个 `profiler` role，还是复用 `tutor` 的 role 配置？
2. [待确认]。**装配声明的表达方式**：`agents/<role>/` 下用什么形式声明「能用哪些 capabilities / skills / tools」—— Markdown 清单、YAML，还是 Python 声明。
3. [待确认]。**`infrastructure/agent/` 的范围**：是否本期就立起来，还是先用 LangGraph 内建能力，等第二个工具调用型 agent 出现再抽。
4. [待确认]。**现有 `AgentRole` 的迁移**：`teacher` / `curriculum` / `knowledge_map` 三个 role 与 `agents/` 目录如何对齐。
5. [待确认]。**提示词资产重排**：`teacher.md` / `knowledge_map.md` / `curriculum.md` 中的角色定义部分需拆到 `agents/<role>/settings.md`，任务指令部分留在原地。