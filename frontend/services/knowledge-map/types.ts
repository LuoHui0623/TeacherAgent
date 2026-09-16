/**
 * 知识点契约。
 *
 * 设计说明见 `docs/knowledge-map.md` 第四节。四条边界规则：
 * - **先有 Domain，后有 KnowledgePoint**：知识点只能引用词表内的领域
 * - `id` 稳定，不随 `label` / `domains` 变更
 * - `domains` 只写最具体的路径，祖先由前缀匹配蕴含
 * - 父子关系是带类型的边，实体上不长关系字段
 * - 学习者状态不进知识点实体（见 `KnowledgePointState`）
 */

/** 来源记录：支撑「这条知识点 / 这条边 / 这个领域为什么存在」。 */
export interface KnowledgeSource {
  kind: 'outline' | 'textbook' | 'note' | 'manual';
  ref: string;
}

/**
 * Domain：受控词表条目，**不是知识点**。
 *
 * 必须先定义 / 分配，知识点才能引用 —— 否则领域会随每次抽取分化出近义写法。
 */
export interface Domain {
  /** 领域路径，唯一。如 `编程语言/Python`。**前缀即祖先**。 */
  path: string;
  /** 展示名。缺省时取路径最后一段。 */
  label?: string;
  /** 说明。 */
  description?: string;
  /** 来源：人工定义 / 从教材分配 / 抽取后人工确认。 */
  source?: KnowledgeSource;
  /**
   * 领域状态。**废弃 ≠ 删除** —— 废弃的领域不再出现在选择器里（禁止新增引用），
   * 但老引用仍然合法，只会进入「待迁移」清单。删除会让引用悬空。
   */
  status?: 'active' | 'deprecated';
  /**
   * 合并 / 改名的去向（另一个领域的 `path`）。
   *
   * **改名 = 废弃 + 新建 + `replacedBy`**，与合并同构，不需要单独一套机制。
   */
  replacedBy?: string;
}

/** 领域词表：知识点的 `domains` 只能从中取值。 */
export type DomainVocabulary = Domain[];

/**
 * 领域迁移记录。
 *
 * 版本隔离要求明确的历史：工作态里它是**可撤销**的依据，
 * 发布时它与词表、图一起冻结，成为该发布版本的变更说明。
 */
export interface DomainMigration {
  /** `refine` 拆分细化 / `merge` 合并 / `rename` 改名。 */
  kind: 'refine' | 'merge' | 'rename';
  /** 涉及的原领域路径。 */
  from: string[];
  /** 迁往的领域路径。 */
  to: string;
  /** 受影响的知识点 id。 */
  knowledgePointIds: string[];
  at: string;
  by?: string;
  /** 撤销时间；已撤销的迁移不计入发布冻结。 */
  reversedAt?: string;
}

/** 知识点：内容实体，可以被说「我掌握了 / 我没掌握」的最小单元。 */
export interface KnowledgePoint {
  /** 稳定标识（slug，如 `python.decorator`）。分配后不随 label / domains 变更。 */
  id: string;
  /** 展示文本。可自由修改；改名不改变 `id`。 */
  label: string;
  /**
   * 领域，多值。**只能引用 Domain 词表内的 `path`**。
   * 只写最具体的路径（祖先被后代蕴含即删除），按字典序排序。
   */
  domains: string[];
  /** 别名与同义写法，**归并的唯一依据**。 */
  aliases?: string[];
  /** 一句话说明，用于节点悬浮与无障碍文本。 */
  summary?: string;
  /** 来源记录。 */
  sources?: KnowledgeSource[];
}

export type KnowledgeEdgeType = 'contains' | 'prerequisite' | 'related';

/**
 * 知识点关系。三种关系结构一致、语义不同，因此统一为带类型的边。
 *
 * 方向约定：
 * - `contains`：`from` 是上位概念，`to` 是下位概念
 * - `prerequisite`：`from` 是先修的，`to` 依赖它
 * - `related`：无方向，存储时按 id 排序去重
 */
export interface KnowledgeEdge {
  from: string;
  to: string;
  type: KnowledgeEdgeType;
  sources?: KnowledgeSource[];
}

/**
 * 学习者状态：**用户态**，不属于知识点实体。
 *
 * 放进内容实体会让「知识点」变成「某个人的知识点」。按知识点 id 独立映射。
 */
export interface KnowledgePointState {
  knowledgePointId: string;
  status: 'not-started' | 'learning' | 'done';
  evidence?: string[];
}

export interface KnowledgeGraph {
  knowledgePoints: KnowledgePoint[];
  edges: KnowledgeEdge[];
}