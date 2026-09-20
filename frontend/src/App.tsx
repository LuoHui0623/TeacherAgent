import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppShell } from '../shared/AppShell';
import { useWorkbenchStore } from '../services/workbenchStore';
import { KnowledgeMapModule } from '../modules/knowledge-map/KnowledgeMapModule';
import { BookshelfModule } from '../modules/bookshelf/BookshelfModule';
import { ContentPipelineModule } from '../modules/content-pipeline/ContentPipelineModule';
import { LearningZoneModule } from '../modules/learning-zone/LearningZoneModule';
import { NotesModule } from '../modules/notes/NotesModule';
import { SettingsModule } from '../modules/settings/SettingsModule';
import { WorkbenchModule } from '../modules/workbench/WorkbenchModule';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
    },
  },
});

/* 工作台式布局：左侧导航 + 主区切换（无路由库） */
function MainArea() {
  const activeModule = useWorkbenchStore((s) => s.activeModule);
  switch (activeModule) {
    case 'workbench':
      return <WorkbenchModule />;
    case 'knowledge-map':
      return <KnowledgeMapModule />;
    case 'bookshelf':
      return <BookshelfModule />;
    case 'learning-zone':
      return <LearningZoneModule />;
    case 'content-pipeline':
      return <ContentPipelineModule />;
    case 'notes':
      return <NotesModule />;
    case 'settings':
      return <SettingsModule />;
  }
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppShell>
        <MainArea />
      </AppShell>
    </QueryClientProvider>
  );
}

export default App;
