import { RotateCcw } from 'lucide-react';

function FilterStatus({
  total,
  filtered,
  active = false,
  label = 'data',
  onReset,
}) {
  return (
    <div className="filter-status" aria-live="polite">
      <span>
        Menampilkan <strong>{filtered}</strong> dari <strong>{total}</strong> {label}
      </span>
      {active && onReset ? (
        <button type="button" onClick={onReset}>
          <RotateCcw size={14} /> Reset filter
        </button>
      ) : null}
    </div>
  );
}

export default FilterStatus;
