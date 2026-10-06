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

## 提示词设计

### Json learnerProfile(结构化画像)

`learnerProfile` 是从画像 Markdown 提取、注入大纲提示词的结构化事实，分为两组：

- **`tech` 组**：`primaryTech`（需精通的主修技术）与 `techStack`（已知技术全量清单，每条带水平档位），都是条目数组。
- **`background` 组**：`education` 与 `profession` 各为一句原文，`learned` 与 `goals`、`preferences` 为字符串数组。

```json
{
  "version": 3,
  "primaryTech": [{ "name": "Python", "level": "精通", "note": "后端与数据处理" }],
  "techStack": [{ "name": "Python", "level": "精通" }, { "name": "React", "level": "熟练" }],
  "education": "本科，非计算机专业，就读于某 211 院校。",
  "profession": "数据分析师，junior。",
  "learned": ["线性回归、决策树与模型评估", "requests + BeautifulSoup"],
  "goals": ["半年内具备独立设计高并发后端服务的能力"],
  "preferences": ["动手示例先行，再做概念归纳。"],
  "extras": []
}
```

约束：

- 分区缺失写 `null`，不用空字符串或空数组占位；未知标题进入 `extras`，不丢弃。
- 每个分区用与内容相称的最简类型：技术是条目数组（`name` / 可选 `level` / 可选 `note`），学业与职业是一个字符串，已学内容、目标与偏好是字符串数组。
- 只提取原文事实，不替用户归类：背景保留为一句原文，不拆固定子字段。
- 不推断水平，不自行诊断薄弱点，不把分区原文（`text`）再存一份。
- 薄弱点与感兴趣不进结构化画像：前者随学习持续变化，后者与「学习目标」重复。


## 提示词

- `agent/prompts/profile-maintain.md`：画像维护。
- `agent/prompts/profile-parse.md`：画像解析。

设计文档见 `src/teacheragent/docs/user-profile.md`。
## 代码设计哲学

- `contracts.py` 用 Pydantic `BaseModel` 定义结构化画像契约：LLM 只负责提取，字段完整性、受控分区、水平档位与未知字段由模型校验。
- `parse.py` 只在开始编写教材时解析当前 Markdown，并用 `model_validate_json` 校验；失败抛出 `ProfileParseError`，不返回空画像或旧画像。
- `markdownVersionId` 与 `contentHash` 由运行上下文携带并随解析调用写入日志，不属于结构化画像字段。
