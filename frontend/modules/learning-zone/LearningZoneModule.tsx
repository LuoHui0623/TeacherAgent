import { ModulePlaceholder } from '../../shared/ModulePlaceholder';
import { messages } from '../../constants';

export function LearningZoneModule() {
  return (
    <ModulePlaceholder
      title={messages.nav.learningZone}
      description="阅读教材章节，右侧可展开教师 Agent 对话抽屉。"
    />
  );
}
