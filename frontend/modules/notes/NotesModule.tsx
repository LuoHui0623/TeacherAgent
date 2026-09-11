import { ModulePlaceholder } from '../../shared/ModulePlaceholder';
import { messages } from '../../constants';

export function NotesModule() {
  return (
    <ModulePlaceholder
      title={messages.nav.notes}
      description="Markdown 笔记编辑与本地管理（CodeMirror 6，待接入）。"
    />
  );
}
