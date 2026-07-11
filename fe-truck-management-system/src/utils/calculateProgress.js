export function calculateProgress(actual = 0, planned = 0) {
  if (!planned) return 0;
  return Math.min(100, Math.round((actual / planned) * 100));
}
