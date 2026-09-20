# 大纲契约重设计（讨论稿）

> **状态**：讨论中，**不落代码**。
> **动机**：知识地图要从大纲投影（见 `frontend/docs/knowledge-map.md`），但现有大纲契约不能直接当确定来源。本文逐条处理八项问题。

## 一、先看字段有没有消费者

没有消费者的字段，**没人能说清它该是什么** —— 这是「字段含义不明」的根源。以下是 `OutlineItemPayload` / `CourseBlueprintPayload` 的用法普查（`frontend/services/content-pipeline/`）：

| 字段 | 谁在读它 | 结论 |
|---|---|---|
| `id` | 普遍 | 结构 |
| `parentId` | `outlineStore` 的 stale 传播（`isChild`） | **存储形态** |
| `children` | `flattenItems` 读取以拍平 | **输入形态**（入库后不用） |
| `title` | 主笔生成正文（`mocks/agents.ts`） | 内容 |
| `knowledgePointIds` | 传导到 `ContentDraft.knowledgePointIds` | 传导 |
| `dependsOnItemIds` | `outlineStore` 两处：领取准入 + stale 传播 | **唯一真正驱动控制流的字段** |
| `order` | **无人读**（只在契约与 mock 里被写入） | 冗余 |
| `prerequisites` | **无人读** | 冗余 |
| `requiredArtifacts` | **无人读** | 含义不明 |
| `assessmentCriteria` | **无人读** | 含义不明 |
| `learningObjectives` | **无人读** | 含义不明 |
| `depth` | **无人读** | 含义不明 |
| `summary` | **无人读**（只被搬运） | 含义不明 |
| 条目 `estimatedMinutes` | **无人读** | 冗余 |
| 大纲 `estimatedMinutes` | 只被复制 | 冗余（可求和） |
| `audience` | 只被复制 | 冗余（来自 brief / 画像） |
| `expectedOutcomes` | 只被复制 | **与 `LearningBrief` 重复** |
| `coreKnowledgePointIds` | 只被复制 | 该有但未接入 |

**一句话结论**：18 个字段里，真正驱动行为的只有 `dependsOnItemIds` 一个；其余要么是结构、要么是传导、要么**根本没有读取者**。

## 二、八项问题逐条分析

> 本节是**问题清单与初步分析**；逐字段的最终取舍以第四节为准（部分初步建议在那里被修正）。

### 问题 1：三种结构混装

**诊断**：`OutlineItem` 同时是章节节点、又是知识点挂载点。

**结论**：这其实是**问题 2 的派生**。当知识点实体缺失时，`knowledgePointIds` 悬空，看起来才像「混装」。补上 `KnowledgePoint` 契约（`frontend/docs/knowledge-map.md` 第四节）后，`OutlineItem` 只是**持有对知识点的引用**，并不混装三种结构。

**建议**：结构不动，**补被引用的实体**。挂载关系就表达为「章节持有知识点引用」。

### 问题 2：知识点实体缺失

**诊断**：`knowledgePointIds: string[]` 指向未定义的实体。

**结论**：**已解决** —— `Domain` / `KnowledgePoint` / `KnowledgeEdge` 已设计（`frontend/docs/knowledge-map.md` 第四节）。

### 问题 3：层级表示重复（`parentId` + `children`）

**诊断**：两种表示确实并存，但**各自有明确用途**，不是单纯的冗余：

- `children` 是**输入形态** —— 嵌套结构对模型生成更自然，不容易编错 id。
- `parentId` 是**存储形态** —— `StoredOutlineItem` 已经 `Omit<..., 'children'>` 并拍平。

**建议**：**明确「嵌套只是输入格式，不是存储表示」**。

| 形态 | 用途 | 权威性 |
|---|---|---|
| 嵌套（`children`） | Agent 生成时的输出形状 | ❌ 非权威，入库即拍平 |
| 扁平（`parentId`） | 存储与运行时 | ✅ **权威** |

入库时做一次规范化（现有 `flattenItems` 就是它）。这样两者不再"重复"，而是**同一数据的两种形态**，且有明确的转换边界。

**决定：接受这个分工** —— `children` 只作生成侧的输入形态，不入存储契约。

### 问题 4：排序表示重复（`order` + 数组顺序）

**诊断**：`order` **无人读取**；运行时次序完全靠数组顺序（`flattenItems` 是保序的 DFS）。

**建议**：**删除 `order`。**

- 数组顺序是零维护成本的可见次序；`order` 需要额外同步，两者必然漂移。
- 拖拽排序时改数组顺序天然。
- 若将来需要稀疏排序（插队、大间隔），再引入。

### 问题 5：两种依赖轴语义不清

**诊断**：两个字段确实指不同的东西，但命名完全没体现：

| 字段 | 指向 | 被消费？ |
|---|---|---|
| `dependsOnItemIds` | **章节条目** id | ✅ 被消费 |
| `prerequisites` | **知识点** id（学本章前需掌握的知识点） | ❌ 无人读 |

**建议**：**删除 `prerequisites`；保留并改名 `dependsOnItemIds`。**

#### 5.1 被删除的 `prerequisites`

知识点之间的先修关系**已经在知识点图里了**（`KnowledgeEdge` 的 `prerequisite` 类型）。在章节上再存一份，是同一信息的第二处副本，必然漂移。

「学本章前要会什么」应当由**本章挂载的知识点 → 沿 prerequisite 边反向遍历**推导出来。删掉之后，「两种依赖轴」只剩一种，问题消解。

#### 5.2 保留字段的真实语义

改名前先把它**到底在表达什么**说清楚。它在代码里被两处消费：

| 消费点 | 逻辑 | 含义 |
|---|---|---|
| `listAvailableItems` | 依赖项必须都是 `generated` / `approved`，本条目才能被领取 | **完成顺序**：它们没写完，本章不能开写 |
| `collectAffectedItems` | 依赖项变化 → 本条目变 `stale` | **内容依赖**：它们改了，本章可能要重写 |

综合起来，它的语义是：

> **本章内容建立在这些章节之上 —— 所以它们必须先完成；它们一旦变化，本章要重写。**

两个特征要抓住：

1. **对象是章节条目**，不是知识点（这是它与已删的 `prerequisites` 的根本区别）。
2. **它同时表达「内容依赖」与「完成顺序」**，不只是先后 —— 这决定了改名时不能只取"顺序"义。

#### 5.3 命名候选

| 候选 | 字面含义 | 优点 | 缺点 |
|---|---|---|---|
| `dependsOnItemIds`（现状） | 依赖的条目 id | 明确指条目 | 嵌了类型名 `Item`（见问题 7，词族一改就得跟着改）；「依赖」泛，易与知识点先修混 |
| **`buildsOn`**（推荐） | 本条目**建立在这些条目之上** | 同时覆盖「内容依赖」与「必须先完成」；不嵌类型名 | 「之上」略抽象 |
| `writeAfter` | 在这些条目**之后**才写 | 直白表达顺序；不嵌类型名 | 只覆盖顺序，解释不了 stale 传播的成因 |
| `prerequisiteItemIds` | 前置条目 id | 「前置」很明确 | **与知识点的 `prerequisite` 撞词**，反而更混 |
| `requiresCompletedItemIds` | 需要先完成的条目 | 最精确 | 太长；嵌类型名 |

**决定：改名 `buildsOn`。** 它是唯一能同时解释两个消费点的名字 —— 内容建立在其上，所以要先完成；所以它变了，我要重写。
### 问题 6：聚合字段可推导

| 字段 | 诊断 | 建议 |
|---|---|---|
| 大纲 `estimatedMinutes` | 可由条目求和 | **删** |
| `expectedOutcomes`（大纲级） | 与 `LearningBrief.expectedOutcomes` 重复 | **删**；需要时读 brief |
| `audience` | 来源是 brief / 画像 | **删**；需要时读 brief |

**注意区分**：删的是**可推导的聚合**与**重复的副本**，不是「大纲不该知道面向谁」—— 信息本身有价值，但它属于 brief，不属于大纲。

> 这条要留意：如果将来确实需要表达「本大纲覆盖了 brief 的哪几条目标」，正确做法是**引用 brief 的目标 id**，而不是把目标文本再抄一遍。而 brief 的目标目前是 `string[]`（无 id），所以这条要在 brief 的重设计中一起解决。

### 问题 7：命名不成族

#### 7.1 问题具体是什么

`CourseBlueprint`（蓝图）与 `OutlineItem`（大纲条目）**指的是同一棵树**，却用了两个不相干的隐喻：

- `Blueprint` —— 施工图纸的比喻
- `Item` —— 中性的列表项

真实代码里，同一棵树被三个词指代：

```ts
CourseBlueprintPayload   // 蓝图
OutlineItemPayload       // 大纲条目
StoredOutlineItem        // 大纲条目（存储态）
OutlineBlueprintVersion  // ← Outline + Blueprint + Version 三个词挤在一起
```

**最后一行是铁证**：因为一开始两个名字并存，后来只能把它们拼起来。

**造成的实际困扰：**

1. **读代码看不出同族** —— `blueprint.items` 里装的是 `OutlineItem`：「蓝图」里装「大纲条目」，两个词各说各的。
2. **缩写分叉** —— `blueprint` / `bp` 与 `outline` / `item` 混用，同一概念两种写法。
3. **扩展时不知道往哪靠** —— 要加「大纲版本」，叫 `BlueprintVersion` 还是 `OutlineVersion`？

#### 7.2 「统一到朴素词族」是什么意思

选一个**朴素、准确**的词根，整棵树只用这一套词：

| 概念 | 建议名 |
|---|---|
| 容器（整份大纲） | `Outline` |
| 节点（一个章节） | `OutlineNode` |
| 版本 | `OutlineVersion` |
| 存储态 | `StoredOutline` |

**为什么强调「朴素」**：`Blueprint` 是**比喻**，比喻会随理解变化而失配 —— 今天的「蓝图」明天可能更像「路线图」。朴素词（Outline / Node / Version）直说是什么，没有解释成本。

#### 7.3 为什么放到最后做

**先定字段、再定名字**，因为名字跟着字段走，而字段正在变：

- 删掉 `prerequisites` 后，就少了一个「先修」相关的词要统一；
- B 类字段移出契约后，`requiredArtifacts` 这个名字**根本不需要再命名**（它去「待接入」清单了）。

先改名，等于给一批**即将消失的字段**起名字。
### 问题 8：字段含义不明

**诊断**：含义不明的字段恰好就是**没有任何读取者**的那批 —— 这不是巧合。

**建议**：按「有没有读者」分三类处理（最终取舍见第四节）。

## 三、LearningBrief 字段普查

方法同第一节。`LearningBriefPayload` 共 11 个字段（含 `scope` 的 4 个子字段），普查结果：

| 字段 | 谁在读 | 结论 |
|---|---|---|
| `id` | 契约校验 | 结构 |
| `goal` | **无人读** | 零消费 |
| `intent` | **无人读** | 零消费 |
| `learnerSummary` | **无人读** | 零消费 |
| `scope.level` / `depth` / `breadth` / `estimatedMinutes` | **无人读** | 零消费 |
| `expectedOutcomes` | 只被 `outlineStore` 复制到大纲 | 零消费（且与大纲级重复） |
| `constraints` | **无人读** | 零消费 |
| `questions` | **无人读** | 零消费 |

> **整个 `LearningBrief` 的字段，在当前实现里没有任何读取者。**

**一个会骗人的假信号**：`intent` 出现 28 次，但几乎全是 `intent-planner` 这个**节点 / role 的 id**，不是字段读取。同名不同义的计数会让人误判热度，普查时必须看**上下文**。

### 3.1 但这不等于「都该删」

与大纲不同：大纲的产物已经被真实消费（`title` 生成正文、`buildsOn` 驱动调度），而 **brief 的问题在于它的定位没说清**。它可能是：

| 定位 | 字段该按什么设计 |
|---|---|
| **大纲架构的输入契约** | 按大纲消费者的需要 |
| **人工确认的展示载体** | 按人的阅读需要 |
| **两者都是**（推荐） | 每个字段要指明它服务哪一边 |

**所以 brief 的第一步不是删字段，而是定定位。** 定位定了，哪些该留、该改、该删才说得清。

### 3.2 已能看出的三处重复

不论定位如何，这三处都要处理：

| 重复 | 现状 | 问题 |
|---|---|---|
| `learnerSummary` | 画像 Markdown → 结构化画像 → brief 的 `learnerSummary` | **不是画像资产，而是画像信息在 brief 里被重复摘录**。画像只维护两类资产（Markdown 权威源 + 结构化派生），`learnerSummary` 属于 brief，不违反那条口径；但它确实把画像信息又抄了一遍 |
| `scope.estimatedMinutes` | 画像「有效学习时间」/ brief `scope` / 大纲 `estimatedMinutes` | 三处都有「时间」，语义各不相同，需要理清：是能力上限、目标体量，还是预估耗时？ |
| `constraints` | 画像的「学习偏好」 | 如「每周 6 小时」「以项目实践为主」，与画像的学习偏好高度重叠 |

### 3.3 `questions` 是个例外，值得保留

`questions` 是唯一**有明确设计意图**的字段：规划者发现自己信息不足时，**向用户提问**。它与 `brief-approval` 人工确认节点天然配对 —— 人工确认时用户看到的不只是「目标对不对」，还有「规划者想知道什么」。

它现在没人读，只是因为 mock 实现还没接人工节点。**这类字段属于「该有但没接入」，不是「不该有」。**
### 3.4 这些字段是从哪来的

**时间线（取证）**：

| 时间 | 事件 |
|---|---|
| 2026-09-13 17:26 | `frontend/services/content-pipeline/contracts.ts` 创建 —— **本会话之前** |
| 2026-09-14 起 | 本会话（画像 / 能力域 / 知识地图） |
| 2026-09-16 19:53 | 提交 `52cca2f`，这批前端代码入库 |

**字段的需求来源**：9/13 那版 `Task.md`（教材生产线）的「已确认需求」里有：

> - 支持**意图识别、任务规划和内容范围定位**
> - 大纲包含**学习目标、预期效果、体量大小、辐射范围、核心知识点**等

对照实现：

| 需求条目 | 对应字段 |
|---|---|
| 意图识别 / 学习目标 | `goal`、`intent` |
| **内容范围定位** | `scope.level` / `depth` / `breadth` / `estimatedMinutes` |
| **学习目标** | `learningObjectives` |
| **预期效果** | `expectedOutcomes`（brief 与大纲各一份） |
| **体量大小** | `estimatedMinutes`（brief / 大纲各一份） |
| **辐射范围** | `scope.breadth` |
| **核心知识点** | `coreKnowledgePointIds` |

**结论：这些字段不是凭空造的，能逐条追溯到当时已确认的需求。** 但当时做的是「**需求条目 → 字段**」的机械映射 —— 需求说「大纲包含哪些信息」，于是字段建了；**却从未指定「谁读这个字段、读了做什么」**。

这正是它们全部零消费的原因：**有需求来源，没有消费者归属。**

**方法论修正**：只问「有没有读者」不够，还要问「**谁、为什么加进来的**」。字段分类因此拆成：

| 类别 | 判据 | 处理 |
|---|---|---|
| **A 删** | 冗余 / 可推导 / 重复 | 删 |
| **B1 有意图、未接入** | 能说清「将来谁读它、读了做什么」 | 记入待接入清单 |
| **B2 无意图填充** | 说不清谁读、读了做什么 | **直接删** |
## 四、目标契约草案

### 4.1 判字段的三条判据

前四节只用了「有没有消费者」一条，不够。补两条：

| # | 判据 | 说明 |
|---|---|---|
| 1 | **有没有消费者** | 指认不出消费者的，移出契约。依据是本项目既有先例：`tables/__init__.py` 写着「尚无仓储消费方的表暂不建行契约……等出现真实消费方再补，**避免死代码**」 |
| 2 | **两个字段能否合法地不同？** | **不能，才是真重复。** 例：「长期偏好项目制」与「本次必须考试导向」能不同 → 不是重复；「画像的技术栈」与「brief 再摘一遍的技术栈」不能不同 → **真重复** |
| 3 | **名字与用法是否一致？** | 名字撒谎比没名字更糟 |

**判据 3 立刻抓到一个问题**：`scope.breadth` 的字面是「广度」，但 mock 值是 `'frontend-performance'` —— 那是**主题标识**，不是广度。**名实不符，必须改。**

### 4.2 mock 值揭示的真实语义

`mocks/content-pipeline/agents.ts` 里的实际值：

```ts
goal: '掌握前端性能优化的分析与实践',
intent: '从基础指标到项目优化形成系统能力',
learnerSummary: '具备 React 基础，偏好示例驱动和可运行实验。',
scope: {
  level: 'intermediate',            // 难度档位（英文，与画像档位不是一套词）
  depth: 'systematic',              // 「系统性」—— 与 intent 语义重叠！
  breadth: 'frontend-performance',  // 主题标识，不是广度
  estimatedMinutes: 480,
},
expectedOutcomes: ['识别性能瓶颈', '制定优化方案', '验证优化结果'],
constraints: ['每周 6 小时', '以项目实践为主'],
```

三条新发现：

1. **`depth: 'systematic'` 与 `intent` 重叠** —— 两者都在说「系统性地学」。`depth` 该删。
2. **`breadth` 名实不符** —— 名字是广度，值是主题。改名 + 明确语义。
3. **`level: 'intermediate'` 与画像档位不是一套词** —— 画像用「涉猎/入门/会用/熟练/进阶/精通」。**两套「水平」无法比对**，而比对正是它的用途（从「会用」到「进阶」）。

### 4.3 逐字段结论

**LearningBrief**

| 字段 | 结论 | 理由 |
|---|---|---|
| `id` | 保留 | 结构 |
| `goal` | 保留 | 学什么；与 `approach` 能合法地不同 |
| `intent` | **改名 `approach` 并枚举化** | 「意图」太泛、无法被消费；真正的语义是**学习取向**（系统学 / 补缺 / 速查 / 项目驱动），大纲架构据此决定大纲形态 |
| `learnerSummary` | **删** | 画像已有结构化画像 → 不能合法地不同 → **真重复** |
| `scope.level` | **改 `targetLevel`，复用画像档位词表** | 起点由画像提供，brief 只需给**目标**；两套词无法比对 |
| `scope.depth` | **删** | 与 `approach` 语义重叠，且无定义域 |
| `scope.breadth` | **改 `inScope[]` + `outOfScope[]`** | 单值主题不够；明确列出「不覆盖」能**防止大纲膨胀** |
| `scope.estimatedMinutes` | **保留** | 与画像的「有效学习时间」**不是重复** —— 那是**已投入的历史事实**，这是**本次的体量预算** |
| `expectedOutcomes` | **加 id，改为对象数组** | 无 id 则大纲只能抄文本；有 id 才能表达「覆盖了哪条目标」并校验缺口 |
| `constraints` | **保留但收窄语义** | 「每周 6 小时」画像里**没有**（画像已删「可用学习时间」）；「以项目实践为主」与画像「学习偏好」重叠。定义为**本次任务的约束**（具体限制），区别于画像的**长期偏好**（一般倾向） |
| `questions` | 保留 | 与 `brief-approval` 人工节点配对；答案是重生成 brief 的输入（`e-brief-revise` 这条边已存在），**不需要单独的答案字段** |

**Outline 节点**

| 字段 | 结论 | 理由 |
|---|---|---|
| `id` / `title` | 保留 | 结构 / 内容（主笔的真实输入） |
| `summary` | 保留 | 给人与模型看的展示文本；明确它不是控制字段 |
| `knowledgePointIds` | 保留 | 挂载关系 |
| `dependsOnItemIds` | **改名 `buildsOn`** | 见问题 5 的分析与 4.3 |
| `children` | 保留（**仅生成侧**） | 输入形态；入库即拍平为 `parentId` |
| `parentId` | 保留（**仅存储侧**） | 权威存储形态；payload 里**不出现**（由嵌套决定） |
| `order` | 删 | 数组顺序已表达 |
| `prerequisites` | 删 | 与知识点图的 `prerequisite` 边重复 |
| `learningObjectives` / `assessmentCriteria` / `requiredArtifacts` / `estimatedMinutes` / `depth` | **移出契约（待接入）** | 指认不出当前消费者 |
| `audience` | 删 | 是 `learnerSummary` 的重述 |
| `expectedOutcomes`（大纲级） | **改 `coveredOutcomeIds: string[]`** | 不抄文本，改为**引用 brief 的目标 id** —— 既去重又能校验覆盖缺口 |
| `coreKnowledgePointIds` | **移出契约（待接入）** | 消费者是知识图投影（T13），落地时接回 |
| `estimatedMinutes`（大纲级） | 删 | 可求和（条目级接回后仍是派生值） |

### 4.4 草案

```ts
// ============ 共享词表 ============

/** 学习水平档位 —— 画像与 brief **共用同一套词**，才能比对（从「会用」到「进阶」）。 */
export const LEARNING_LEVELS = ['涉猎', '入门', '会用', '熟练', '进阶', '精通'] as const;
export type LearningLevel = (typeof LEARNING_LEVELS)[number];

/** 学习取向 —— 决定大纲形态。 */
export const LEARNING_APPROACHES = [
  'systematic',      // 系统学
  'gap-filling',     // 查漏补缺
  'quick-scan',      // 快速过一遍
  'project-driven',  // 项目驱动
] as const;
export type LearningApproach = (typeof LEARNING_APPROACHES)[number];

// ============ LearningBrief ============

/** 预期成果。带 id，下游才能「引用」而不是「抄文本」。 */
export interface LearningOutcome {
  /** 本 brief 版本内唯一；跨版本稳定性由 brief 版本链保证，不要求全局唯一。 */
  id: string;
  statement: string;
}

export interface LearningBriefPayload {
  id: string;
  /** 学什么（一句话）。 */
  goal: string;
  /** 以什么方式学 —— 决定大纲形态。 */
  approach: LearningApproach;
  scope: {
    /** 目标水平（学完达到的档位）。**起点**由画像的当前水平提供，不在这里重复。 */
    targetLevel: LearningLevel;
    /** 本次要覆盖的主题。 */
    inScope: string[];
    /** 明确不覆盖的主题 —— 防止大纲膨胀。 */
    outOfScope: string[];
    /** 体量预算（分钟）。区别于画像的「有效学习时间」（已投入的历史）。 */
    estimatedMinutes?: number;
  };
  /** 预期成果。 */
  expectedOutcomes: LearningOutcome[];
  /** **本次任务**的约束（时间、形式、限制）。区别于画像的长期偏好。 */
  constraints?: string[];
  /** 规划者信息不足时向用户提问 —— 由 brief-approval 渲染并回答。 */
  questions?: string[];
}

// ============ Outline ============

/** 生成侧节点（嵌套形态）—— Agent 输出用嵌套，模型不易编错 id。 */
export interface OutlineNodePayload {
  id: string;
  title: string;
  summary?: string;
  knowledgePointIds?: string[];
  /** 本节点内容**建立在这些节点之上**：它们必须先完成；它们一变，本节点要重写。 */
  buildsOn?: string[];
  children?: OutlineNodePayload[];
}

/** 存储侧节点（扁平形态，**权威**）。 */
export interface StoredOutlineNode {
  id: string;
  parentId?: string;
  title: string;
  summary?: string;
  knowledgePointIds?: string[];
  buildsOn?: string[];
}

/** 大纲 artifact（生成侧契约）。 */
export interface OutlinePayload {
  id: string;
  briefId: string;
  title: string;
  /** 本大纲覆盖了 brief 的哪几条目标 —— 引用而非抄写。 */
  coveredOutcomeIds: string[];
  /** 嵌套形态；入库时由规范化步骤拍平为 StoredOutlineNode[]。 */
  items: OutlineNodePayload[];
}

/** 大纲版本（存储形态）。 */
export interface OutlineVersion {
  id: string;
  outlineId: string;
  version: number;
  parentVersionId?: string;
  status: 'draft' | 'confirmed' | 'superseded';
  title: string;
  briefId: string;
  coveredOutcomeIds: string[];
  items: StoredOutlineNode[];
  createdAt: string;
  createdBy: string;
}
```

### 4.5 与现状的差异清单

| 类别 | 项 |
|---|---|
| **删** | `learnerSummary`、`scope.depth`、`order`、`prerequisites`、`audience`、大纲级 `expectedOutcomes`、大纲级 `estimatedMinutes` |
| **改名 / 改形** | `intent` → `approach`（枚举）；`scope.level` → `scope.targetLevel`（复用画像档位）；`scope.breadth` → `scope.inScope` + `scope.outOfScope`；`expectedOutcomes` → `{ id, statement }[]`；`dependsOnItemIds` → `buildsOn`；大纲级 `expectedOutcomes` → `coveredOutcomeIds`；`CourseBlueprint` → `Outline`；`OutlineItem` → `OutlineNode` |
| **移出契约（待接入）** | `learningObjectives`、`assessmentCriteria`、`requiredArtifacts`、条目级 `estimatedMinutes`、`coreKnowledgePointIds` |
| **新增** | `coveredOutcomeIds`（引用而非副本）、`scope.outOfScope`（防膨胀）、`LearningOutcome.id` |

### 4.6 落地结果（已完成）

草案已按 4.4 落成代码，未留待确认项。

| 层 | 文件 | 变化 |
|---|---|---|
| 契约 | `frontend/services/content-pipeline/contracts.ts` | 新增共享词表 `learningLevels` / `learningApproaches`；`LearningBriefPayload` 重写；`CourseBlueprintPayload` → `OutlinePayload`；`OutlineItemPayload` → `OutlineNodePayload`；artifact type `CourseBlueprint` → `Outline`；契约 id `contract-outline-v1`、schemaId `content-pipeline/outline@1` |
| 存储 | `frontend/services/content-pipeline/outlineStore.ts` | `StoredOutlineItem` → `StoredOutlineNode`；`OutlineBlueprintVersion` → `OutlineVersion`；方法 `claimItems`/`startItem`/… → `claimNodes`/`startNode`/…；`blueprintId` → `outlineId`；`dependsOnItemIds` → `buildsOn` |
| 编排 | `frontend/mocks/content-pipeline/main-workflow.ts` | 端口 `blueprint` → `outline`；artifact type 同步 |
| Mock | `frontend/mocks/content-pipeline/agents.ts` | brief 与大纲 mock 按新契约重写（`approach` / `targetLevel` / `inScope` / `outOfScope` / `coveredOutcomeIds`） |
| 测试 | `frontend/tests/content-pipeline-*.test.ts` | fixture 按新契约重写（4 个文件） |

**验证**：`npm test` **70 项通过**、`npm run lint` 通过、`npx tsc -b` 通过、`npm run build` 通过。

#### 实施中的三个教训（值得记录）

**1. `itemId` 是歧义标识 —— 改名必须先确认语义，不能按字面批量替换。**

同一个 `itemId` 在代码里有**两个不同含义**：

| 位置 | 含义 |
|---|---|
| `outlineStore.ts` | **大纲节点** id → 应随 `OutlineItem` → `OutlineNode` 改名 |
| `runtime.ts` | **人工审批项** id（artifact version id），与审批节点 `nodeId` 是两个概念 → **不能改** |

批量替换一度让 `HumanGateItemDecisionInput` 出现两个 `nodeId` 字段，并把审批项当成节点去查，直接报 `WorkflowNode 不存在：undefined`。**恢复该文件后重新逐个确认语义才改对。**

**2. 重构时不要在 mock 里顺手加新行为。**

mock 的大纲原本**没有**条目间依赖；我在改名时"顺带"给 `buildsOn` 加了链式依赖，改变了运行行为，测试立刻失败。**重构与行为变更必须分开** —— 已恢复为 `[]`。

**3. 改名要成组检查「声明」与「使用」。**

workflow 里把输出端口从 `blueprint` 改成 `outline` 后，**mock handler 的 `artifactOutput(..., 'blueprint', ...)` 漏改**，工件送不到下游端口。表现不是报错，而是运行停在 `paused` —— **没有错误信息，只有状态不对**，排查成本高。凡是端口名 / 事件名 / 路由键这类**字符串耦合**，改名必须同时检查声明侧与使用侧。

### 4.7 结果与遗留

| # | 状态 | 内容 |
|---|---|---|
| 1 | **已定** | B 类字段移出契约，记入「待接入清单」 |
| 2 | **已定** | `children` 只作生成侧输入形态，不入存储契约 |
| 3 | **已定** | `dependsOnItemIds` → `buildsOn` |
| 4 | **已定** | 命名族 `Outline`（`Outline` / `OutlineNode` / `OutlineVersion` / `StoredOutlineNode`） |
| 5 | **已定** | `LearningBrief` 与大纲契约一起重设计 |
| 6 | **已定** | `intent` → `approach`（枚举四个取向） |
| 7 | **已定** | `learnerSummary` / `audience` 直接删（画像已是权威源） |
| 8 | **已定** | `scope` 改为 `targetLevel` + `inScope` / `outOfScope`（`depth` 删） |
| 9 | **已定** | `expectedOutcomes` 加 id；大纲改用 `coveredOutcomeIds` 引用 |
| 10 | **已定** | `constraints` 收窄为「本次任务约束」（区别于画像长期偏好） |
| 11 | **已定** | 档位统一：`targetLevel` 复用画像档位（中文词） |
| 12 | 遗留 | **端口 / 事件名等字符串耦合**未做系统性排查 —— 本次只改了 `blueprint` 一处，其余保持原样 |

**待接入清单**（移出契约的字段，等消费者出现时随其一起加回）：

| 字段 | 潜在消费者 | 何时接回 |
|---|---|---|
| `learningObjectives` | 主笔（写什么）、出题（考什么） | 这些消费者落地时 |
| `assessmentCriteria` | 出题、章节验收 | 同上 |
| `requiredArtifacts` | 流程校验（本章该产出什么） | 流程校验落地时 |
| 节点 `estimatedMinutes` | 画像的学习偏好、体量校验（与 brief 预算对照） | 学习时长接入时 |
| `coreKnowledgePointIds` | 知识图投影的入口 | 投影落地时（T13） |
