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

  it('opens a textbook in immersive learning mode', () => {
    useWorkbenchStore.getState().setActive('workbench');
    useWorkbenchStore.getState().openTextbook('e5d65144-e11f-4a35-bc71-842ca6795e29');

    expect(useWorkbenchStore.getState()).toMatchObject({
      activeModule: 'learning-zone',
      activeTextbookId: 'e5d65144-e11f-4a35-bc71-842ca6795e29',
      immersiveMode: true,
      sidebarCollapsed: true,
    });
  });
});
