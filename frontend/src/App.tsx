import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SideNav } from '../shared/SideNav';
import { useWorkbenchStore } from '../services/workbenchStore';
import { KnowledgeMapModule } from '../modules/knowledge-map/KnowledgeMapModule';
import { BookshelfModule } from '../modules/bookshelf/BookshelfModule';
import { LearningZoneModule } from '../modules/learning-zone/LearningZoneModule';
import { NotesModule } from '../modules/notes/NotesModule';
import { ProfileModule } from '../modules/profile/ProfileModule';

const queryClient = new QueryClient();

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
      return <ProfileModule />;
  }
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <div className="flex h-full">
        <SideNav />
        <main className="flex-1 overflow-y-auto p-8">
          <MainArea />
        </main>
      </div>
    </QueryClientProvider>
  );
}

export default App;
