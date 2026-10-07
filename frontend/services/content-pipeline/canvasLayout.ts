/* 画布布局：列由图的依赖方向决定，不写死节点清单。
 *
 * 运行的画布必须画这次运行冻结的那张图，所以列只能从图本身推：入口节点在第 0 列，
 * 下游依次加深。回边（例如审批打回上游）指向已排过的节点，跳过即可；图里有环也不会
 * 死循环，剩下的节点按定义顺序补在末尾。
 */

import type { WorkflowDefinition } from './types';

export interface NodePosition {
  x: number;
  y: number;
}

export interface GraphLayout {
  /** 节点 id → 画布坐标；图里每个节点都有值。 */
  positions: Record<string, NodePosition>;
  width: number;
  height: number;
  columns: string[][];
}

const COLUMN_WIDTH = 218;
const ROW_HEIGHT = 112;
const ORIGIN_X = 40;
const ORIGIN_Y = 152;

/** 图的行列布局；定义为空时给出一张空画布。 */
export function graphLayout(definition: WorkflowDefinition | null): GraphLayout {
  if (!definition) return { positions: {}, width: 640, height: 420, columns: [] };

  const ids = definition.nodes.map((node) => node.id);
  const known = new Set(ids);
  const layerOf = new Map<string, number>();
  const columns: string[][] = [];

  const place = (nodeId: string, layer: number): void => {
    if (layerOf.has(nodeId)) return;
    layerOf.set(nodeId, layer);
    while (columns.length <= layer) columns.push([]);
    columns[layer].push(nodeId);
  };

  const incoming = new Set(
    definition.edges.filter((edge) => known.has(edge.to.nodeId)).map((edge) => edge.to.nodeId),
  );
  const declared = definition.entryNodeIds.filter((nodeId) => known.has(nodeId));
  const entries = declared.length > 0 ? declared : ids.filter((nodeId) => !incoming.has(nodeId));
  for (const nodeId of entries) place(nodeId, 0);

  for (let layer = 0; layer < columns.length; layer += 1) {
    for (const nodeId of columns[layer]) {
      for (const edge of definition.edges) {
        if (edge.from.nodeId !== nodeId || !known.has(edge.to.nodeId)) continue;
        place(edge.to.nodeId, layer + 1);
      }
    }
  }
  for (const nodeId of ids) place(nodeId, columns.length);

  const positions: Record<string, NodePosition> = {};
  columns.forEach((column, layer) => {
    column.forEach((nodeId, row) => {
      positions[nodeId] = {
        x: ORIGIN_X + layer * COLUMN_WIDTH,
        y: ORIGIN_Y + (row - (column.length - 1) / 2) * ROW_HEIGHT,
      };
    });
  });

  const xs = Object.values(positions).map((position) => position.x);
  const ys = Object.values(positions).map((position) => position.y);
  return {
    positions,
    width: Math.max(...xs, 0) + 240,
    height: Math.max(...ys, 0) + 150,
    columns,
  };
}
