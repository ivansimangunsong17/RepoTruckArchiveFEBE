const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
const INPUT_PATTERN = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/;

export function nowWibInput(now = new Date()) {
  return new Date(now.getTime() + WIB_OFFSET_MS).toISOString().slice(0, 16);
}

export function toWibInput(value) {
  if (!value) return '';
  if (INPUT_PATTERN.test(String(value).trim())) return String(value).trim();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value).slice(0, 16) : nowWibInput(date);
}

export function toOperationalIso(value) {
  const match = INPUT_PATTERN.exec(String(value || '').trim());
  if (!match) return null;
  const [, day, hour, minute] = match;
  if (Number(hour) > 23 || Number(minute) > 59) return null;
  const date = new Date(`${day}T${hour}:${minute}:00+07:00`);
  if (Number.isNaN(date.getTime()) || toWibInput(date) !== `${day}T${hour}:${minute}`) return null;
  return date.toISOString();
}
