import { messages } from '../constants';
import { useWorkbenchStore } from '../services/workbenchStore';

const moduleLabels = {
  workbench: messages.nav.workbench,
  'knowledge-map': messages.nav.knowledgeMap,
  bookshelf: messages.nav.bookshelf,
  'learning-zone': messages.nav.learningZone,
  'content-pipeline': messages.nav.contentPipeline,
  notes: messages.nav.notes,
  settings: messages.nav.settings,
} as const;

export function TopBar() {
  const activeModule = useWorkbenchStore((state) => state.activeModule);

  return (
    <header className="top-bar">
      <div className="top-bar__context">
        <span>Workspace</span>
        <strong>{moduleLabels[activeModule]}</strong>
      </div>
    </header>
  );
}
