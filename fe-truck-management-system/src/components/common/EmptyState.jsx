import { Inbox } from 'lucide-react';

function EmptyState({ title = 'Belum ada data', description = 'Data akan muncul di sini.' }) {
  return (
    <div className="empty-state">
      <Inbox size={30} />
      <strong>{title}</strong>
      <span>{description}</span>
    </div>
  );
}

export default EmptyState;
