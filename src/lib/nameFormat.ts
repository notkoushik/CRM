/**
 * Automatically capitalizes the first letter of each part of a name.
 * e.g., 'somesh gurugu' -> 'Somesh Gurugu', 'aravind terli' -> 'Aravind Terli'
 */
export function capitalizeName(str?: string | null): string {
  if (!str) return '';
  return str
    .trim()
    .split(/\s+/)
    .map((word) => {
      if (!word) return '';
      return word
        .split('-')
        .map((subToken) => {
          if (!subToken) return '';
          const isAllUpper = subToken.length > 1 && subToken === subToken.toUpperCase();
          const clean = isAllUpper ? subToken.toLowerCase() : subToken;
          return clean.charAt(0).toUpperCase() + clean.slice(1);
        })
        .join('-');
    })
    .join(' ');
}
