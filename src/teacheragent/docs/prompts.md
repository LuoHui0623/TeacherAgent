# 提示词资产规范

提示词是**文档**，不是关系数据 —— 由 git 承担版本、diff、blame 与 review，**不入 SQLite**。

## 归属：绑定到具体能力

提示词不通用。同一个角色在不同能力下需要不同的角色设定，因此提示词**就近归属到使用它的能力**，不设顶层 `prompts/` 目录。

| 类型 | 位置 | 内容 |
|---|---|---|
| 能力域角色设定 | `capabilities/<能力域>/prompts/<名称>.md` | 术业有专攻：这个能力怎么把事情做好 |
| workflow 流水线提示词 | `workflows/<workflow>/prompts/<名称>.md` | 覆盖完整流水线：整条链的协作方式 |

两层并存，互不替代。workflow 的流水线提示词规定协作方式，能力域的角色设定规定单个能力怎么做好。

## 命名约定

- 文件名语义化，**不加编号前缀**，`.md` 后缀。
- 同一能力域有多个提示词时按用途命名（如 `maintain.md` / `parse.md`）。

## prompt_ref 口径

`prompt_ref` 记录**包内相对路径**，随调用写入 `call_logs.prompt_ref` 供回溯：

```text
capabilities/tutoring/prompts/teacher.md
capabilities/knowledge-map/prompts/knowledge_map.md
workflows/content-pipeline/prompts/curriculum.md
```

加载与调用：

```python
from teacheragent.constants import AgentRole
from teacheragent.infrastructure.llm.invoke import invoke_llm
from teacheragent.infrastructure.llm.prompts import load_prompt

prompt = load_prompt("capabilities/tutoring/prompts/teacher.md")
invoke_llm(AgentRole.TEACHER, messages, prompt_ref=prompt.ref)
```

`load_prompt` 只接受 `*/prompts/*.md` 形态的路径；传其它路径会被拒绝，避免提示词散落到能力与 workflow 之外。

## 文件结构

首行 `# 标题` 说明用途，随后用二级标题划分段落（角色设定 / 行为准则 / 输出要求等）。
段落划分需便于按情境**动态拼装**（PRD：预置多套提示词方案，按情境动态选用）。

## 版本

由 **git** 承担版本、diff 与回溯。不在文件名或数据库里做版本号：`call_logs.prompt_ref` 记录的是路径，具体内容按提交时间回溯。

## 变更纪律

- 改动即提交，提交信息说明优化意图（供 A/B 对比与回溯）。
- 新增提示词前先确认它属于哪个能力域；找不到归属，说明这个能力的边界还没想清楚。