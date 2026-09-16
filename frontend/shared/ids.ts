export function domId(
  domain: string,
  component: string,
  actionOrKey?: string | number,
  key?: string | number,
): string {
  const parts = [
    domain,
    component,
    ...(key === undefined
      ? [actionOrKey]
      : [actionOrKey, key]),
  ]
    .filter(
      (part) =>
        part !== undefined && part !== null && String(part).trim().length > 0,
    )
    .map((part) => _slug(String(part)));
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
