# 提示词资产规范

提示词是文件资产，由 Git 负责版本、diff、review 与回溯，不进入 SQLite。

## 统一位置

所有 Agent 角色设定、任务指令和工作流提示词统一放在：

```text
src/teacheragent/agent/prompts/<name>.md
```

当前资产包括：

- `agent/prompts/tutor.md`：Tutor 角色设定
- `agent/prompts/curriculum.md`：Curriculum 课程设计工作流提示词
- `agent/prompts/knowledge-map.md`：知识地图能力任务指令
- `agent/prompts/outline-architect.md`：大纲架构任务指令
- `agent/prompts/profile-maintain.md` / `profile-parse.md`：用户画像任务指令

不再按 capability 或 workflow 目录分散存放，不创建角色 `settings.md`。

## 加载

```python
from teacheragent.infrastructure.llm.prompts import load_prompt

prompt = load_prompt("agent/prompts/tutor.md")
```

`load_prompt` 只接受严格的 `agent/prompts/<name>.md` 形式。`Prompt.ref` 仅用于当前
进程内的资产定位，不写入 `call_logs`；调用日志只记录实际输入、输出和调用元数据。

## 变更纪律

- 文件名使用语义化名称，不加编号前缀。
- 提示词内容变更随代码提交，利用 Git diff 与提交记录回溯。
- 角色设定、任务指令和工作流协作规则可以是不同文件，但都由 Agent 入口显式装配。
