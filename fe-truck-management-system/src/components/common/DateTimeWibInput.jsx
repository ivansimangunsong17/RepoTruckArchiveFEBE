function splitDateTime(value) {
  const raw = String(value || '').trim();
  const [date = '', time = ''] = raw.split('T');
  return {
    date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : '',
    time: /^\d{2}:\d{2}/.test(time) ? time.slice(0, 5) : time.slice(0, 5),
  };
}

function cleanTimeInput(value) {
  const sanitized = String(value || '')
    .replace(/[^\d:]/g, '')
    .slice(0, 5);
  if (sanitized.includes(':')) return sanitized;

  const digits = sanitized.replace(/\D/g, '').slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

function composeDateTime(date, time) {
  if (!date && !time) return '';
  return `${date}T${time}`;
}

function DateTimeWibInput({ value, onChange, disabled = false, dateLabel = 'Tanggal', timeLabel = 'Jam' }) {
  const current = splitDateTime(value);

  function updateDate(nextDate) {
    onChange(composeDateTime(nextDate, current.time));
  }

  function updateTime(nextTime) {
    onChange(composeDateTime(current.date, cleanTimeInput(nextTime)));
  }

  return (
    <div className="datetime-wib-input">
      <input
        aria-label={dateLabel}
        disabled={disabled}
        type="date"
        value={current.date}
        onChange={(event) => updateDate(event.target.value)}
      />
      <div className="datetime-wib-time">
        <input
          aria-label={timeLabel}
          disabled={disabled}
          inputMode="numeric"
          maxLength={5}
          placeholder="08:30"
          title="Format jam 24 jam, contoh 08:30"
          value={current.time}
          onChange={(event) => updateTime(event.target.value)}
        />
        <span aria-hidden="true">WIB</span>
      </div>
    </div>
  );
}

export default DateTimeWibInput;
