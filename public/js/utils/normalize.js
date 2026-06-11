// Normalize a name for comparison: lowercase, accents removed, only letters/numbers kept.
export function normalizeKey(s) {
  if (!s) return '';
  const t = s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  return t.replace(/[^a-z0-9]/g, '');
}
