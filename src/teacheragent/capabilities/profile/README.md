# 用户画像（profile）

## 职责

维护用户画像的两类资产：用户可编辑的 Markdown 权威源，以及由它解析出的结构化画像。

## 输入 → 输出

| 输入 | 输出 | 说明 |
|---|---|---|
| 旧画像 Markdown + 学习交互与行为事件 | 画像 Markdown | 只以 Markdown 为旧画像输入，增量累积，用户可编辑 |
| 画像 Markdown | 结构化画像 | 整篇交给 LLM 解析 |

## 边界

- 不做教材内容生成，画像只作为下游输入。
- 不把结构化画像回写进 Markdown。
- 不决定画像的消费方式，消费点在各消费能力域（如写大纲）。

## 提示词

- `agent/prompts/profile-maintain.md`：画像维护。
- `agent/prompts/profile-parse.md`：画像解析。

设计文档见 `src/teacheragent/docs/user-profile.md`。
## 代码设计哲学

- `contracts.py` 用 Pydantic `BaseModel` 定义结构化画像契约：LLM 只负责提取，字段完整性、受控分区、水平档位与未知字段由模型校验。
- `parse.py` 只在开始编写教材时解析当前 Markdown，并用 `model_validate_json` 校验；失败抛出 `ProfileParseError`，不返回空画像或旧画像。
- `markdownVersionId` 与 `contentHash` 由运行上下文携带并随解析调用写入日志，不属于结构化画像字段。
