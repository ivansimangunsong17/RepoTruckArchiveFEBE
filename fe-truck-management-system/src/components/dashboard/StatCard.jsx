import { ArrowDownRight, ArrowUpRight } from 'lucide-react';

function StatCard({ title, value, detail, trend, icon: Icon, tone = 'blue' }) {
  const positive = !String(trend).startsWith('-');
  return (
    <article className="stat-card">
      <div className={`stat-icon ${tone}`}><Icon size={21} /></div>
      <div className="stat-copy">
        <span>{title}</span>
        <strong>{value}</strong>
        {detail ? (
          <small className={positive ? 'positive' : 'negative'}>
            {trend ? (positive ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />) : null}
            {trend} {detail}
          </small>
        ) : null}
      </div>
    </article>
  );
}

export default StatCard;
