import { CalendarDays } from 'lucide-react';
import { buildWeeklyOrderDays } from '../../utils/weeklyOrderDays';

const TARGET_NOTE = 'Kebutuhan Order';

function getOrderGap(item, targets) {
  const kurangTwentyFt = Math.max((targets?.twentyFt || 12) - (item.twentyFt || 0), 0);
  const kurangEightFt = Math.max((targets?.eightFt || 8) - (item.fortyFt || 0), 0);
  return { kurangTwentyFt, kurangEightFt };
}

function WeeklyOrderSummary({ jobs = [], currentDateKey, orderTargets = { twentyFt: 12, eightFt: 8 } }) {
  const days = buildWeeklyOrderDays(jobs, currentDateKey);

  const totalOrders = days.reduce((total, item) => total + item.orderCount, 0);
  const activeDays = days.filter((item) => item.orderCount > 0).length;

  return (
    <section className="weekly-order-summary" aria-label="Jumlah order seminggu ke depan">
      <div className="weekly-order-head">
        <div className="weekly-order-title">
          <CalendarDays size={16} aria-hidden="true" />
          <div>
            <span>7 Hari Ke Depan</span>
            <strong>Jumlah Order Mendatang</strong>
          </div>
        </div>
        <div className="weekly-order-total">
          <strong>{totalOrders}</strong>
          <span>{activeDays} Hari</span>
        </div>
      </div>

      <div className="weekly-order-grid">
        {days.map((item) => (
          <div className={`weekly-order-day ${item.orderCount ? 'has-order' : 'empty'}`} key={item.dateKey}>
            <div className="weekly-order-day-meta">
              <strong>{item.label}</strong>
              <span>{item.orderCount ? `${item.orderCount} order` : 'Tidak ada order'}</span>
            </div>
            {item.orderCount ? (
              <div className="weekly-order-size-list">
                <span><strong>20FT</strong> {item.twentyFt}</span>
                <span><strong>40FT</strong> {item.fortyFt}</span>
              </div>
            ) : null}
            {(() => {
              const gap = getOrderGap(item, orderTargets);
              if (!gap.kurangTwentyFt && !gap.kurangEightFt) return null;
              return (
                <span className="weekly-target-stack">
                  <small className="weekly-order-alert">
                    {gap.kurangTwentyFt ? `20 FT x ${gap.kurangTwentyFt}` : ''}
                    {gap.kurangTwentyFt && gap.kurangEightFt ? ' | ' : ''}
                    {gap.kurangEightFt ? `40FT x ${gap.kurangEightFt}` : ''}
                  </small>
                  <em>{TARGET_NOTE}</em>
                </span>
              );
            })()}
          </div>
        ))}
      </div>
    </section>
  );
}

export default WeeklyOrderSummary;
