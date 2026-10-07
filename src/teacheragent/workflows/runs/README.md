# 运行读模型（workflows/runs）

运行读模型：pipeline 历史、节点摘要与节点提示词地图。它和 `execution/` 是一对 —— `execution/` 是写路径（推进一次运行），这里是读路径（某次运行长什么样）。

前端是纯投影：run 状态、节点状态与提示词地图的六阶段都在这里派生好，前端只渲染，不自己算状态。本包只读，不写任何行。

## 数据来源

| 数据 | 表 |
|---|---|
| 执行事实与 run 的起止 | `node_runs` |
| 图结构与版本 | `workflow_snapshots`（该 run 冻结的那一份） |
| 产物正文与版本 | `node_artifacts` |
| 每次模型调用 | `llm_runs`（按 `workflow_id` + `workflow_run_id` + `node_id` 归组） |
| 提示词正文与历史 | 提示词资产文件 + `prompt_snapshots` |

## run 状态

库不存 run 状态。run 是共享 `(workflow_id, run_id)` 的一组 `node_runs` 行，状态由这组行按优先级归并（`workflows/execution/status.py` 的 `aggregate_status`）：失败 → 取消 → 等待人工 → 仍在推进 → 全部成功。节点的多条目汇总用同一个函数。

起止与耗时取这组行 `event_time` 的 min / max。暂停 / 继续不落库（口径 26），所以也不进派生状态。

## 节点摘要

图里的每个节点都有一条摘要，没轮到它的报 `pending` —— canvas 与 inspector 因此不需要自己判断「这个节点存在但没数据」。摘要带当前代次的执行行（重跑的旧代次不参与投影）、调用次数、输入与输出产物（按端口给出类型、内容身份与正文）。

输入产物 = 连到该节点的上游端口上现有的产物版本；输出产物 = 该节点自己产出的全部端口行。

## 提示词地图的六阶段

每次模型调用摊成固定六步：`template` → `sources` → `context` → `messages` → `request` → `output`。阶段的状态是 `pending` / `filled` / `streaming` / `failed`，与数据同步：`pending` 的阶段 `data` 为 `null`，没有内容不占位。阶段只带 `kind` / `state` / `data`，不带展示文案 —— 中文名由前端按 `kind` 给，它本来就要按 `kind` 分派渲染。

| 阶段 | 取数 |
|---|---|
| `template` | 按 `promptRef` 现取当前文件正文，附变量清单与变量绑定 |
| `sources` | 该次调用落库的 `prompt_sources_json`：模板的哪几段进了调用，模板原文与渲染结果 |
| `context` | `bindings_json`：这次读到的产物版本，按输入端口摊平 |
| `messages` | `input_messages_json`：真正发往 provider 的消息 |
| `request` | provider / model / role / temperature / attempt / 开始时间 |
| `output` | 输出消息、用量、耗时与错误 |

## 三态

| 节点状态 | 地图样子 |
|---|---|
| 待运行 | 一次预期调用（`callId` 为 `null`）：只有 `template` 阶段带内容，其余五步 `pending` |
| 运行中 | 前五步 `filled`，`output` 为 `streaming` |
| 已完成 / 失败 | 六步全为 `filled`（失败时 `output` 为 `failed` 并带 `error`） |

## 模板漂移

调用行记下当时的 `prompt_content_hash`，`template` 阶段把它与当前文件的内容身份一起给出：

- `runHash`：这次运行实际用的那一版；没有调用时为 `null`。
- `currentHash`：当前文件版本。
- `changed`：两者不同即为真。

正文按 ref 现取，不保证与 `runHash` 同版；要读那一版的正文与 diff 走 `GET /prompts/{ref}`（带 `content_hash`）与 `/prompts/{ref}/diff`。

## 变量绑定

模板声明的每个变量都给出一条绑定记录。变量名与输入端口同名时能对上那份产物版本（`portId` / `nodeId` / `contentHash`）；没有同名端口而调用确实发生过时状态仍是 `bound`，说明值来自平台上下文，本次运行没有对应产物。节点还没调用过时全部是 `pending`。

「这一版没绑定」与「不由产物填充」是两件事，不混为一谈。

## 接口

| 方法 | 路径 | 返回 |
|---|---|---|
| `GET` | `/workflows/{workflow_id}/runs` | 历史：状态、起止、图版本 |
| `GET` | `/workflows/{workflow_id}/runs/{run_id}` | 摘要 + 冻结的图 + 节点摘要 |
| `GET` | `/workflows/{workflow_id}/runs/{run_id}/nodes` | 节点摘要列表 |
| `GET` | `/workflows/{workflow_id}/runs/{run_id}/nodes/{node_id}/prompt-map` | 该节点的三态地图 |

运行挂在它所属的流程下，`workflow_id` 是路径的一部分，不从行里反查归属。未知流程、未知运行与未知节点都返回 404。

图定义（`GET /workflows/{id}`）与运行是两条路径：前者答「现在长什么样」，后者答「某次运行长什么样」，各自读注册表与 `workflow_snapshots`。
