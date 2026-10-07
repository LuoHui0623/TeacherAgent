# workflows

## 职责

核心职责：**工作流编排层** —— 定义 graph，让固定路线可注册、可校验、可冻结、可还原，并推进它在库上的运行：就绪判定、单节点执行、一个事务提交、启动恢复。

本层分两个方向：`execution/` 是写路径，`runs/` 是读路径（pipeline 历史、节点摘要与节点提示词地图）；两者读同一批运行表，用同一份代次归约口径。run 状态不落库，由 `node_runs` 派生。

节点怎么划分、路线怎么走、要哪些提示词资产，都是各个 workflow 自己的设计，写在它目录下的 README.md 里；本文只讲本层共用的规则与已注册清单。

导入 `teacheragent.workflows` 即完成注册：图定义、其中全部 node_id，以及与图一起校验的产物类型词表。运行时的事实来源是 `registry.list_definitions()`，本文的清单是它的人读索引。

## 注册的工作流

| workflow id | 名称 | 版本 | 定义位置 | 设计说明 |
|---|---|---|---|---|
| `content-pipeline-main` | 教材生产主流程 | 1 | `content_pipeline/definition.py` | `content_pipeline/README.md` |

workflow id 形如 `<流程名>-<变体>`，主流程带 `-main` 后缀。id 是对外稳定键：它进运行记录与接口路径，改名等于换了一条流程，历史记录的归属要跟着迁移。

注册入口：只通过 `register_definition()` 注册的图进此清单；`agent/` 内自己编译的可执行图不算 workflow，不在此列。

节点的工序分工、固定路线、提示词资产状态等具体设计记录在各 workflow 目录的 README.md。

新增或删除一个 workflow 时必须同时更新本清单：`tests/test_workflows.py` 固定了当前注册集合，注册集合一变测试就会失败。

## 各 workflow 目录 README.md 的约定

每个 workflow 目录的 README.md 至少写清四件事：

1. **固定路线**：必须用 mermaid `flowchart` 画出流程，分支与回退口径要画进图里；只写一行文字箭头串不算。
2. **节点工序分工**：节点按工序类型分组列出，标明各自产出什么。
3. **提示词资产状态**：哪些节点带 `promptRef`、对应的资产是否已存在。
4. **与执行器的关系**：本目录只有图定义，执行器在 `workflows/execution/`；哪些角色已接线看 `implementations.py`。

节点标签用中文工序名，不写 node_id（node_id 见 `definition.py` 与各表的节点列）。

## 新增一个 workflow

1. 建 `workflows/<名称>/` —— 包名用下划线，目录内 `artifacts.py` 声明该生产线的产物类型词表。
2. 在 `definition.py` 里构造 `WorkflowDefinition`（`version`、`entry_node_ids`、`nodes`、`edges`），末尾调用 `register_definition(definition, artifact_types=<该词表>)`，导入即校验、非法即失败。
3. 在 `workflows/__init__.py` 里挂上该定义，保证 `import teacheragent.workflows` 即注册。
4. 在该目录的 `README.md` 按 `约定` 写清固定路线（mermaid 图）、节点工序分工、提示词资产状态与装配关系，名称、版本、定义位置登记进上表。

## 节点类型

`NodeKind` 是本层各 workflow 共用的节点类型词表，取值与前端 `WorkflowNodeKind` 一一对应。前端的 `kindLabels` 与 `nodeIcon` 是穷尽 `Record<WorkflowNodeKind, ...>`，少一个取值就编译失败，所以这份词表是两侧的共同约定，只能在两侧同时增删。

| kind | 语义 | `content-pipeline-main` 是否使用 |
|---|---|---|
| `trigger` | 流程入口：外部事件从这里进图，没有输入端口 | 使用（`tutor-trigger`） |
| `context` | 冻结上下文：把上游事件整理成一份快照，不调用模型 | 使用（`context-snapshot`） |
| `agent` | 一次模型调用：必须带 `roleId` 与 `promptRef` | 使用（6 个） |
| `contract-gate` | 产物契约校验：只判合格与否并分流，不调用模型 | 使用（2 个） |
| `human-gate` | 人工门禁：停在这里等决断，必须带 `humanApproval` | 使用（4 个） |
| `fan-out` | 按条目并行展开：一个节点执行多次，每次产出一份产物 | 使用（`chapter-writers`） |
| `persist` | 落库：把产物写进教材资产 | 使用（`publisher`） |
| `router` | 按条件选一条出边，不产出新产物 | 未使用 |
| `fan-in` | 把并行结果汇总成一份产物 | 未使用 |
| `quality-loop` | 质检闭环：失败时回到修订节点 | 未使用 |
| `tool` | 调用工具而非模型 | 未使用 |
| `notify` | 对外通知，不产出产物 | 未使用 |

这 12 个取值不统一在一条轴上，`persist` 属于第三条：

- **执行者**：`trigger`（外部事件）、`agent`（模型）、`tool`（工具）、`human-gate`（人）。
- **机制**：`context`（冻结上下文）、`contract-gate`（校验）、`router`（选边）、`fan-out` / `fan-in`（拆分 / 汇总）、`quality-loop`（回路）。
- **副作用**：`persist`（落库）、`notify`（通知）—— 命名的是执行完发生什么，不是谁来执行；这两个节点的执行者是平台自身的一段代码，与 `context`、`contract-gate` 同属不调用模型的节点。

所以 `kind` 现在只用于**分类与呈现**：校验只对 `agent`、`human-gate` 提强制字段要求，前端用它取标签与图标；还没有任何按 kind 分派执行者的代码。
哪天执行器要按 kind 分派，得先二选一：接受“一条混轴的分类”，或者把副作用拆成独立字段（`kind` 只管谁执行，另加 `effect` 记 `persist` / `notify`）。

未使用的取值没有执行语义：校验只对 `agent`、`human-gate` 提强制字段要求，其它类型出现在图里不会被拒绝，也没有对应的执行实现。要把一个未使用的类型用起来，得先说清它由谁执行、需要哪些强制字段，再同时补上校验规则与实现。

## 图定义与执行器

图定义是事实来源，执行器消费它：

- **图定义**：`<名称>/definition.py`。端口用产物类型定型，连线两端类型必须相等；节点类型覆盖 `agent`、`human-gate`、`contract-gate`、`fan-out` 等，它们不都是 LangGraph 概念。
- **node_id**：节点 id 是运行记录归属节点的唯一标识。写 `llm_runs.node_id` 之前用 `registry.require_node()` 校验，未知 id 立即失败，不留归属不明的记录。
- **图快照**：运行开始时 `snapshot.freeze_snapshot()` 冻结图定义与 `content_hash`，之后图变更不影响已发生的运行；`version` 由作者维护，内容变更时必须递增。
- **读接口**：`GET /workflows` 列出已注册流程与摘要，`GET /workflows/{id}` 返回 `to_payload()` 的同构 JSON 加 `version` 与 `contentHash`；前端 canvas 只读它，不再持有自己的图副本。某次运行用的图结构与注册表解耦，按该 run 冻结的快照还原（见 `runs/README.md`）。不提供「按版本读图」：每一行图快照都来自某次运行，历史图从那次运行的详情里取（`graph` 带 `version` 与 `contentHash`），单独开一个版本入口只是把同一次读取换个门。
- **图快照还原**：`payloads.snapshot_definition()` 从落库的图快照正文还原图定义。运行中的图结构与注册表解耦：注册表可以继续演化，某次运行只认它创建时冻结的那份快照，恢复因此不依赖当前代码里的图定义。
- **产物类型词表**：每个 workflow 自带，校验时显式传入；通用图结构不假设某条生产线的词表。

## 门禁评估与就绪判定

执行器在内存里维护运行时状态（`WorkflowExecutor` 里的实例状态与暂停集合），库是它的持久化：每轮推进先把库里的行整理回内存状态，再算「哪些实例能跑」。推进不依赖 LangGraph 的运行时状态，也不依赖任何进程内的历史 —— 判定在 `execution/readiness.py` 是纯函数：输入图、节点执行行与产物行，输出可启动的实例；重启后能从同一批行重建出同一批实例，这是「可继续」的前提。

一个实例可启动，需要同时满足：它在本代次上尚无行或仍是 `pending`；每个必填输入端口都能取到产物；这些产物的来源实例都已成功。人工门禁未决、正在运行、已终态的实例都不在其中。输入产物只看直接上游端口落下的行，判定不需要跨端口回溯。

**门禁评估**：人工门禁与契约门的每个输出端口都产出自己的 `GateReview` —— 评审主体（`ai` / `user`）、通过与否（`decision`）、修订意见（`comments`），并用 `contentHash` 指向被审内容的正文行。评估不复制正文，下游拿到评估后按内容身份取内容：`intent-planner.brief` 到 `outline-architect.brief` 之间走的是「内容 → 评估 → 内容引用」，而不是把 brief 正文再存一份。

门禁自己确实产出新内容时用别的产物类型：`quality-gate` 除了 `passed` / `failed` 两份评估，还有 `manifest`（`PublicationManifest`）端口承载它真正产出的发布清单。
## 执行器

`execution/scheduler.py` 的 `WorkflowExecutor` 是唯一的推进者：`open_run()` 冻结图快照并写下入口节点的产物与执行行，`advance()` 循环「读库 → 枚举实例 → 算就绪 → 执行 → 一个事务提交」，直到没有可跑的实例（在等决断或跑完）。

**发起**是 `execution/start.py` 的 `start_run()`：它先认那条 `proposal` 消息（不存在 404、类别不对 400），再分配 run id（`run-<n>`，在该流程内递增），然后调用 `open_run()` 与 `advance()`。run 与消息的关联落在 `node_runs.trigger_message_id`，所以「哪条提议触发了这次运行」不需要额外的表。接口是 `POST /workflows/{workflow_id}/runs`。

- **内存运行时状态 + 库持久化**：内存里维护实例状态机，每轮先把库里的行整理回内存再算实例，所以重启后直接再 `advance()` 就接着跑；`recover()` 把非终态的 `running` 行放回 `pending`（口径是「非终态即重新调度」，没有僵尸 TTL），节点执行必须可重入。
- **代次按实例**：每个实例用它在库里出现过的最大 `generation`，装载时按键归约到最新代次；`rerun(node_id)` 把该节点及其全部下游写成新代次的 `pending` 行，旧代次留在库里可读，上游不受影响。
- **暂停 / 继续**在内存里（口径 26），不落库。
- **发起**：`execution/start.py::start_run()` 只接受一条 `proposal` 对话消息（口径 1），分配 run id 后调用 `open_run()` + `advance()`；消息与 run 通过 `node_runs.trigger_message_id` 相互回指。
- **节点实现**：`nodes.py` 按节点类型分派平台节点（`context` / `contract-gate` / `human-gate` / `persist`），其余按 `roleId` 走能力实现表（`implementations.py`，目前只接了 `outline-architect`）；没有实现的节点类型或角色直接报错并让该实例失败，不静默跳过。
- **声明式端口与条目**：门禁的通过 / 否决端口由节点 `config` 的 `approvePort` / `rejectPort` 声明，fan-out 的条目由 `itemsFrom` / `itemsPath` / `itemKey` 声明。
- **事务**：执行事实与它的产物在同一事务里写（`connection()` 在本线程内可重入），不留半写。
不创建通用 `infrastructure/agent/` 运行时抽象。
所有提示词统一位于 `src/teacheragent/agent/prompts/`，workflow 不再拥有独立的 `prompts/` 目录；节点的 `promptRef` 用与 `load_prompt()` 同一命名空间的资产路径 `agent/prompts/<名称>.md`。

## 目录

| 文件 | 职责 |
|---|---|
| `contracts.py` | `Port` / `Node` / `Edge` / `WorkflowDefinition` / `WorkflowSnapshot` 与前端投影 |
| `errors.py` | 图定义、查找失败与未知 node_id 的异常 |
| `validation.py` | 结构、端口类型、连线端点与可达性校验 |
| `registry.py` | 图定义与 node_id 注册表 |
| `payloads.py` | 图定义正文的反序列化：从落库的图快照还原图定义 |
| `snapshot.py` | 图快照冻结与内容哈希 |
| `execution/` | 写路径：节点执行状态词表、就绪判定、单节点执行、调度、发起与恢复（`execution/__init__.py` 是它的导出面） |
| `runs/` | 读路径：pipeline 历史、节点摘要与节点提示词地图（`runs/README.md`） |
| `content_pipeline/` | 教材生产线的图定义、产物类型词表与边界说明 |
