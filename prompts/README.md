# prompts

提示词资产目录。提示词是**文档**，不是关系数据 —— 由 git 承担版本、diff、blame 与 review，**不入 SQLite**。

## 命名约定

每个 Agent 角色一个 Markdown 文件，文件名与 `AgentRole` 取值一致：

| 文件 | 角色 |
|---|---|
| `teacher.md` | 教师 Agent（答疑、纠错、鼓励、路径建议） |
| `curriculum.md` | 教材生产线 |
| `knowledge_map.md` | 知识地图 |

## 引用方式

调用 LLM 时把**相对路径**作为 `prompt_ref` 传入，记入 `call_logs.prompt_ref` 以便回溯：

```python
invoke_llm(AgentRole.TEACHER, messages, prompt_ref="prompts/teacher.md")
```

## 文件结构

首行 `# 标题` 说明用途，随后用二级标题划分段落（角色设定 / 行为准则 / 输出要求等）。
段落划分需便于后续按情境**动态拼装**（PRD：预置多套提示词方案，按情境动态选用）。

## 变更纪律

- 改动即提交，提交信息说明优化意图（供 A/B 对比与回溯）
- 不用编号前缀命名文件
