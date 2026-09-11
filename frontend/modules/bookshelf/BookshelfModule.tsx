import { ModulePlaceholder } from '../../shared/ModulePlaceholder';
import { messages } from '../../constants';

export function BookshelfModule() {
  return (
    <ModulePlaceholder
      title={messages.nav.bookshelf}
      description="展示 Agent 生成的教材，支持进入学习区继续学习。"
    />
  );
}
