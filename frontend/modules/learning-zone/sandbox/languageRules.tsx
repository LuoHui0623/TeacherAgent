import type { ReactNode } from 'react';

export const JAVASCRIPT_KEYWORDS = new Set(['async','await','break','case','catch','class','const','continue','default','do','else','export','extends','false','finally','for','from','function','if','import','in','instanceof','let','new','null','of','return','switch','throw','true','try','typeof','undefined','var','while','yield']);
export const PYTHON_KEYWORDS = new Set(['and','as','assert','async','await','break','class','continue','def','del','elif','else','except','False','finally','for','from','global','if','import','in','is','lambda','match','nonlocal','None','not','or','pass','raise','return','True','try','while','with','yield']);

export const PYTHON_TYPES = new Set(['bool','bytearray','bytes','complex','dict','float','int','list','object','set','str','tuple']);

export const CODE_TOKEN_PATTERN =
  /\/\/[^\n]*|\/\*[\s\S]*?\*\/|`(?:\\[\s\S]|[^`])*`|'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|\b\d+(?:\.\d+)?\b|\b[A-Za-z_$][\w$]*\b/g;

export const PYTHON_TOKEN_PATTERN =
  /(?:[rRuUbBfF]{0,2}(?:"""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'))|#[^\n]*|\b\d+(?:\.\d+)?\b|\b[A-Za-z_]\w*\b/g;

export function highlightCode(code: string, language: string): ReactNode[] {
  const normalizedLanguage = language.toLowerCase();
  const isPython = ['python', 'py'].includes(normalizedLanguage);
  const isJavaScript = ['javascript', 'js', 'typescript', 'ts'].includes(normalizedLanguage);

  if (!isPython && !isJavaScript) {
    return [code];
  }

  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  const tokenPattern = isPython ? PYTHON_TOKEN_PATTERN : CODE_TOKEN_PATTERN;

  for (const match of code.matchAll(tokenPattern)) {
    const index = match.index ?? 0;
    const token = match[0];

    if (index > lastIndex) {
      nodes.push(code.slice(lastIndex, index));
    }

    let className = '';

    if (
      token.startsWith('//') ||
      token.startsWith('/*') ||
      (isPython && token.startsWith('#'))
    ) {
      className = 'code-token--comment';
    } else if (
      (isPython && /^[rubf]*["']/.test(token)) ||
      token.startsWith('`') ||
      token.startsWith("'") ||
      token.startsWith('"')
    ) {
      className = 'code-token--string';
    } else if (/^\d/.test(token)) {
      className = 'code-token--number';
    } else if (
      (isPython && PYTHON_KEYWORDS.has(token)) ||
      (isJavaScript && JAVASCRIPT_KEYWORDS.has(token))
    ) {
      className = 'code-token--keyword';
    } else if (isPython && PYTHON_TYPES.has(token)) {
      className = 'code-token--type';
    } else if (/^\s*\(/.test(code.slice(index + token.length))) {
      className = 'code-token--function';
    } else if (/^[A-Z]/.test(token)) {
      className = 'code-token--type';
    }

    nodes.push(
      className ? (
        <span key={`${index}-${token}`} className={className}>
          {token}
        </span>
      ) : (
        token
      ),
    );
    lastIndex = index + token.length;
  }

  if (lastIndex < code.length) {
    nodes.push(code.slice(lastIndex));
  }

  return nodes;
}
