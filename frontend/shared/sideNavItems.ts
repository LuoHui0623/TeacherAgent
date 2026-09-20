import {
  BooksIcon,
  FlowArrowIcon,
  GraduationCapIcon,
  GraphIcon,
  NoteBlankIcon,
  SquaresFourIcon,
  UserFocusIcon,
} from '@phosphor-icons/react';

import { messages } from '../constants';
import type { ModuleKey } from '../services/workbenchStore';

export const sideNavItems: { key: ModuleKey; label: string; icon: typeof GraphIcon }[] = [
  { key: 'workbench', label: messages.nav.workbench, icon: SquaresFourIcon },
  { key: 'knowledge-map', label: messages.nav.knowledgeMap, icon: GraphIcon },
  { key: 'bookshelf', label: messages.nav.bookshelf, icon: BooksIcon },
  { key: 'learning-zone', label: messages.nav.learningZone, icon: GraduationCapIcon },
  { key: 'content-pipeline', label: messages.nav.contentPipeline, icon: FlowArrowIcon },
  { key: 'notes', label: messages.nav.notes, icon: NoteBlankIcon },
  { key: 'settings', label: messages.nav.settings, icon: UserFocusIcon },
];
