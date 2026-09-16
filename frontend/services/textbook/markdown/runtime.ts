import type { CodeRuntimeCapability } from '../types';

interface SandboxRuntimeDefinition {
  id: CodeRuntimeCapability['id'];
  label: string;
  languages: string[];
  defaultEntry: string;
}

export const sandboxRuntimeRegistry: SandboxRuntimeDefinition[] = [
  {
    id: 'javascript',
    label: 'JavaScript',
    languages: ['javascript', 'js'],
    defaultEntry: 'main.js',
  },
];

export function getCodeRuntimeCapability(
  language: string,
  entry?: string,
): CodeRuntimeCapability | undefined {
  const normalized = language.trim().toLowerCase();
  const runtime = sandboxRuntimeRegistry.find((item) =>
    item.languages.includes(normalized),
  );
  if (!runtime) return undefined;

  return {
    id: runtime.id,
    label: runtime.label,
    entry: entry || runtime.defaultEntry,
  };
}
