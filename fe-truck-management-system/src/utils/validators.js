export function isRequired(value) {
  return String(value ?? '').trim().length > 0;
}

export function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
