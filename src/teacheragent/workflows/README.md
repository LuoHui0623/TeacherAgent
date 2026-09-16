# workflows

编排层：用 LangGraph 把 `capabilities` 装配成可执行的具体 workflow。

## 定义

workflow 是**复用 capabilities（或加上临时 / 手动节点）用 LangGraph 编排好的具体实现**。

- **复用已有能力域**：workflow 不重写能力逻辑，只做装配。
- **允许外加临时 / 手动节点**：一次性的胶水逻辑、人工审批、数据搬运，不必为了它污染能力域。
- **每个 workflow 是具体实现，不是抽象模板**：同一批能力可以有多个 workflow。

## 与 capabilities 的分工

| 层 | 关注点 | 提示词 |
|---|---|---|
| `capabilities/` | 术业有专攻：一个能力域做好一件事（输入 → 输出） | 各能力域维护**自己的角色设定** |
| `workflows/` | 编排：控制流、并行、人工节点、失败回流 | 可存**覆盖完整流水线的完整提示词** |

**一个提示词不干所有事情**：能力域负责角色设定，workflow 负责流水线级约定。两层提示词并存，互不替代 —— 流水线提示词规定整条链的协作方式，角色设定规定单个能力怎么把事情做好。

## 目录规范

```text
workflows/
└── <workflow-name>/
    ├── README.md     # 编排了哪些能力、节点顺序、人工 / 临时节点
    ├── prompts/      # 该 workflow 的完整流水线提示词（按需，可缺省）
    └── ...           # LangGraph 图定义
```

## 依赖规则

- workflow **依赖** capabilities，反向不成立。
- 提示词就近归属：能力角色设定在 `capabilities/<域>/prompts/`，流水线级提示词在 `workflows/<名>/prompts/`。
- 顶层 `src/teacheragent/prompts/` 已移除；规范见 `docs/prompts.md`。