import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import {
  faBook,
  faChartLine,
  faDiagramProject,
  faGraduationCap,
  faNoteSticky,
  faTableCellsLarge,
  faUserGear,
} from '@fortawesome/free-solid-svg-icons';

import { messages } from '../constants';
import type { ModuleKey } from '../services/workbenchStore';

export const sideNavItems: { key: ModuleKey; label: string; icon: IconDefinition }[] = [
  { key: 'workbench', label: messages.nav.workbench, icon: faTableCellsLarge },
  { key: 'knowledge-map', label: messages.nav.knowledgeMap, icon: faDiagramProject },
  { key: 'bookshelf', label: messages.nav.bookshelf, icon: faBook },
  { key: 'learning-zone', label: messages.nav.learningZone, icon: faGraduationCap },
  { key: 'content-pipeline', label: messages.nav.contentPipeline, icon: faChartLine },
  { key: 'notes', label: messages.nav.notes, icon: faNoteSticky },
  { key: 'settings', label: messages.nav.settings, icon: faUserGear },
];
