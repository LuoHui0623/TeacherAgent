export function domId(
  domain: string,
  purpose: string,
  key?: string | number,
): string {
  const parts = [domain, purpose, key === undefined ? undefined : String(key)]
    .filter((part): part is string => Boolean(part))
    .map(_slug);
  return parts.filter(Boolean).join('-') || 'ui-element';
}

function _slug(value: string): string {
  return value
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
}
