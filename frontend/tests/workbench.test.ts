import { describe, expect, it } from 'vitest';

import { messages } from '../constants/messages';
import { sideNavItems } from '../shared/sideNavItems';
import { useWorkbenchStore } from '../services/workbenchStore';

describe('workbench entry', () => {
  it('adds a first-class navigation entry without changing the default module', () => {
    expect(sideNavItems[0]).toMatchObject({ key: 'workbench', label: messages.nav.workbench });
    expect(useWorkbenchStore.getInitialState().activeModule).toBe('learning-zone');
  });

  it('can navigate to the placeholder page through workbench state', () => {
    useWorkbenchStore.getState().setActive('workbench');
    expect(useWorkbenchStore.getState().activeModule).toBe('workbench');
    useWorkbenchStore.getState().setActive('learning-zone');
  });
});
