# 大纲契约重设计（讨论稿）

> **状态**：讨论中，**不落代码**。
> **动机**：知识地图要从大纲投影（见 `knowledge-map.md`），但现有大纲契约不能直接当确定来源。本文逐条处理八项问题。

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

### 问题 1：三种结构混装

**诊断**：`OutlineItem` 同时是章节节点、又是知识点挂载点。

**结论**：这其实是**问题 2 的派生**。当知识点实体缺失时，`knowledgePointIds` 悬空，看起来才像「混装」。补上 `KnowledgePoint` 契约（`knowledge-map.md` 第四节）后，`OutlineItem` 只是**持有对知识点的引用**，并不混装三种结构。

**建议**：结构不动，**补被引用的实体**。挂载关系就表达为「章节持有知识点引用」。

### 问题 2：知识点实体缺失

**诊断**：`knowledgePointIds: string[]` 指向未定义的实体。

**结论**：**已解决** —— `Domain` / `KnowledgePoint` / `KnowledgeEdge` 已设计（`knowledge-map.md` 第四节）。

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

**建议**：按「有没有读者」分三类处理（见第三节）。

## 三、字段取舍建议

### A 类：删除（不该存在）

| 字段 | 理由 |
|---|---|
| `order` | 数组顺序已表达 |
| `prerequisites` | 与知识点图的 prerequisite 边重复 |
| 大纲 `estimatedMinutes` | 可求和 |
| 大纲 `expectedOutcomes` | 与 brief 重复 |
| `audience` | 来自 brief / 画像 |
| `depth`（条目级） | 无取值域、无消费；深度已在 `LearningBrief.scope` |

### B 类：移出契约，记入「待接入」

**这些字段设计上可能有价值，但当前没有消费者。** 按本项目已有的先例 —— `tables/__init__.py` 写着「尚无仓储消费方的表暂不建行契约，等出现真实消费方再补，**避免死代码**」—— 同一原则应当用在字段上。

| 字段 | 潜在消费者 | 何时接回 |
|---|---|---|
| `learningObjectives` | 主笔（写什么）、出题（考什么） | 这些消费者落地时 |
| `assessmentCriteria` | 出题、章节验收 | 同上 |
| `requiredArtifacts` | 流程校验（本章该产出什么） | 流程校验落地时 |
| 条目 `estimatedMinutes` | 画像的学习偏好、体量校验 | 学习时长接入时 |
| `coreKnowledgePointIds` | 知识图投影的入口 | 投影落地时（T13，很近） |

**决定：移出契约，记入本文的「待接入清单」。** 等消费者出现时随消费者一起加回，而不是现在留着一堆没人读的字段假装完整。

### C 类：保留

| 字段 | 理由 |
|---|---|
| `id` / `parentId` | 结构（存储形态） |
| `title` | 内容，有真实消费者 |
| `knowledgePointIds` | 挂载关系，传导到内容草稿 |
| `dependsOnItemIds` | **唯一驱动控制流的字段** |
| `summary` | 对人和模型都有展示价值 —— 但要明确它是「摘要」，不是控制字段 |

## 四、LearningBrief 字段普查

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

### 4.1 但这不等于「都该删」

与大纲不同：大纲的产物已经被真实消费（`title` 生成正文、`buildsOn` 驱动调度），而 **brief 的问题在于它的定位没说清**。它可能是：

| 定位 | 字段该按什么设计 |
|---|---|
| **大纲架构的输入契约** | 按大纲消费者的需要 |
| **人工确认的展示载体** | 按人的阅读需要 |
| **两者都是**（推荐） | 每个字段要指明它服务哪一边 |

**所以 brief 的第一步不是删字段，而是定定位。** 定位定了，哪些该留、该改、该删才说得清。

### 4.2 已能看出的三处重复

不论定位如何，这三处都要处理：

| 重复 | 现状 | 问题 |
|---|---|---|
| `learnerSummary` | 画像 Markdown → 结构化画像 → `learnerSummary` → 大纲 | **第三份副本**。画像已是权威源，brief 再摘要一遍必然漂移 |
| `scope.estimatedMinutes` | 画像「有效学习时间」/ brief `scope` / 大纲 `estimatedMinutes` | 三处都有「时间」，语义各不相同，需要理清：是能力上限、目标体量，还是预估耗时？ |
| `constraints` | 画像的「学习偏好」 | 如「每周 6 小时」「以项目实践为主」，与画像的学习偏好高度重叠 |

### 4.3 `questions` 是个例外，值得保留

`questions` 是唯一**有明确设计意图**的字段：规划者发现自己信息不足时，**向用户提问**。它与 `brief-approval` 人工确认节点天然配对 —— 人工确认时用户看到的不只是「目标对不对」，还有「规划者想知道什么」。

它现在没人读，只是因为 mock 实现还没接人工节点。**这类字段属于「该有但没接入」，不是「不该有」。**
## 五、待确认

| # | 状态 | 内容 |
|---|---|---|
| 1 | **已定** | B 类字段移出契约，记入「待接入清单」 |
| 2 | **已定** | `children` 作为生成侧输入形态，不入存储契约 |
| 3 | **已定** | `dependsOnItemIds` → **`buildsOn`** |
| 4 | **已定** | 命名族：**`Outline`**（容器 `Outline` / 节点 `OutlineNode` / 版本 `OutlineVersion` / 存储态 `StoredOutline`） |
| 5 | **已定** | `LearningBrief` 与大纲契约一起重设计；字段普查已完成（见第四节） |
| 6 | 待决 | **`LearningBrief` 的定位**：大纲架构的输入契约 / 人工确认的展示载体 / 两者都是（推荐） |
| 7 | 待决 | **三处重复怎么消**：`learnerSummary`（画像第三份副本）、`scope.estimatedMinutes`（三处时间概念重叠）、`constraints`（与画像学习偏好重叠） |
| 8 | 待决 | **`scope` 子字段的取值域**：`level` / `depth` / `breadth` 至今没有定义域，而条目级 `depth` 已删 —— 它们是否还有必要 |
| 9 | 待决 | **`expectedOutcomes` 是否加 id**：不加 id，大纲就无法引用 brief 的目标，只能抄文本 |

### 待接入清单（B 类字段的暂存处）

| 字段 | 潜在消费者 | 何时接回 |
|---|---|---|
| `learningObjectives` | 主笔（写什么）、出题（考什么） | 这些消费者落地时 |
| `assessmentCriteria` | 出题、章节验收 | 同上 |
| `requiredArtifacts` | 流程校验（本章该产出什么） | 流程校验落地时 |
| 条目 `estimatedMinutes` | 画像的学习偏好、体量校验 | 学习时长接入时 |
| `coreKnowledgePointIds` | 知识图投影的入口 | 投影落地时（T13） |