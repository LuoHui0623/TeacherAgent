import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppShell } from '../shared/AppShell';
import { useWorkbenchStore } from '../services/workbenchStore';
import { KnowledgeMapModule } from '../modules/knowledge-map/KnowledgeMapModule';
import { BookshelfModule } from '../modules/bookshelf/BookshelfModule';
import { LearningZoneModule } from '../modules/learning-zone/LearningZoneModule';
import { NotesModule } from '../modules/notes/NotesModule';
import { SettingsModule } from '../modules/settings/SettingsModule';
import { ModulePlaceholder } from '../shared/ModulePlaceholder';

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
    case 'knowledge-map':
      return <KnowledgeMapModule />;
    case 'bookshelf':
      return <BookshelfModule />;
    case 'learning-zone':
      return <LearningZoneModule />;
    case 'notes':
      return <NotesModule />;
    case 'profile':
      return <ModulePlaceholder title="用户画像" description="用户画像域保留中。" />;
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
