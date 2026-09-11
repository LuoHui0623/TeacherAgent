import { ModulePlaceholder } from '../../shared/ModulePlaceholder';
import { messages } from '../../constants';

export function KnowledgeMapModule() {
  return (
    <ModulePlaceholder
      title={messages.nav.knowledgeMap}
      description="以图谱形式呈现知识点与学习路径（sigma.js 渲染，待接入）。"
    />
  );
}
