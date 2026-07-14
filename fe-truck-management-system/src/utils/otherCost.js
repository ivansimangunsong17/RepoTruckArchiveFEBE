export function parseOtherCost(value) {
  if (!value) return { amount: 0, notes: '' };

  if (typeof value === 'object') {
    return {
      amount: Number(value.amount || 0),
      notes: value.notes || '',
    };
  }

  const text = String(value || '').trim();
  if (!text) return { amount: 0, notes: '' };

  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object') {
      return {
        amount: Number(parsed.amount || 0),
        notes: parsed.notes || '',
      };
    }
  } catch {
    // Plain legacy notes stay readable.
  }

  const numericText = text.replace(/[^\d.-]/g, '');
  const amount = numericText && numericText === text ? Number(numericText) : 0;
  return {
    amount: Number.isFinite(amount) ? amount : 0,
    notes: amount ? '' : text,
  };
}

export function serializeOtherCost({ amount = 0, notes = '' } = {}) {
  const normalizedAmount = Math.max(0, Number(amount || 0));
  const normalizedNotes = String(notes || '').trim();
  if (!normalizedAmount && !normalizedNotes) return '';
  return JSON.stringify({
    amount: normalizedAmount,
    notes: normalizedNotes,
  });
}

