# 提示词资产规范

提示词是文件资产：正文只存在于 `agent/prompts/`，由 Git 负责编写时的 diff、review 与回溯。运行回溯不看 Git，它读加载时冻结的 `prompt_snapshots` 快照。

## 统一位置

所有 Agent 角色设定、任务指令和工作流提示词统一放在：

```text
src/teacheragent/agent/prompts/<name>.md
```

当前资产包括：

- `agent/prompts/tutor.md`：Tutor 角色设定
- `agent/prompts/knowledge-map.md`：知识地图能力任务指令
- `agent/prompts/outline-architect.md`：大纲架构任务指令
- `agent/prompts/profile-maintain.md` / `profile-parse.md`：用户画像任务指令

不再按 capability 或 workflow 目录分散存放，不创建角色 `settings.md`。

每份提示词的小节结构遵循 [`agent/prompts/README.md`](../agent/prompts/README.md)：角色 / 输入 / 目标和要求 / 约束 / 输出契约（契约要求说明 + 结构化输出）。

## 加载

```python
from teacheragent.infrastructure.llm.prompts import load_prompt, render_prompt

prompt = load_prompt("agent/prompts/tutor.md")
messages = render_prompt(prompt, {"brief": {...}, "learnerProfile": {...}})
```

`load_prompt` 只接受严格的 `agent/prompts/<name>.md` 形式。每次加载都会把正文按 `(ref, content_hash)` 冻结进 `prompt_snapshots`（同一版只写一行），提示词历史因此不依赖 git；节点执行时这一版的身份经 `WorkflowCallOrigin` 写进 `llm_runs` 的 `prompt_ref` / `prompt_content_hash`，模型调用本身仍由统一的 `LlmModel` 记录实际输入、输出和调用元数据。

加载结果 `Prompt` 带：正文 `content`、内容身份 `content_hash`、变量清单 `variables`（模板里 `${{ 名称 }}` 按首次出现顺序去重），以及正文按「第一个声明变量的段落」切出的静态前缀 `static_prefix` 与注入载荷 `injection`。没有变量的模板是纯静态提示词，`injection` 为 `None`。模板声明的每个变量都是必需变量，渲染时缺一即报 `PromptRenderError`，不会把占位符发给模型。

渲染入口只有一个 `render_prompt`，分几条消息由有没有 `${{ 名称 }}` 决定：纯静态提示词整份渲染成一条消息；模板把静态前缀渲染成 `system`、注入载荷渲染成 `user`。它返回 `LlmMessages`，里面既是要发送的消息，也是这次调用用到的提示词资产来源与渲染结果 —— 它们随调用写进 `llm_runs.prompt_sources_json`。具体写法与约定见 [`agent/prompts/README.md`](../agent/prompts/README.md)。

## 读接口

`/prompts` 是提示词资产的只读入口，历史取自 `prompt_snapshots`：

| 接口 | 返回 |
|---|---|
| `GET /prompts/{ref}` | 正文 `template`、变量清单 `variables`、内容身份 `contentHash`、当前文件版本 `currentHash`；带 `content_hash` 查询参数时返回该历史版本（`source` 标为 `snapshot`）。 |
| `GET /prompts/{ref}/versions` | 版本序列（按追加时间升序），并标出哪一版是当前文件。 |
| `GET /prompts/{ref}/diff?from=&to=` | 任意两版的统一 diff。 |

接口只读资产，不写快照：只有真正装载并发送给模型的那一次调用才追加版本。

## 变更纪律

- 文件名使用语义化名称，不加编号前缀。
- 提示词内容变更随代码提交，利用 Git diff 与提交记录回溯；运行回溯不依赖 git，它读 `prompt_snapshots`。
- 角色设定、任务指令和工作流协作规则可以是不同文件，但都由 Agent 入口显式装配。
