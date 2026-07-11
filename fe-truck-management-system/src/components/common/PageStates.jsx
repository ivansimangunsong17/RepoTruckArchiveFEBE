import { Component } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export function PageSkeleton({ label = 'Memuat halaman' }) {
  return (
    <div className="page page-skeleton" role="status" aria-live="polite" aria-label={label}>
      <span className="sr-only">{label}...</span>
      <div className="skeleton-header">
        <span className="skeleton-line short" />
        <span className="skeleton-line title" />
        <span className="skeleton-line medium" />
      </div>
      <div className="skeleton-stats">
        {[1, 2, 3, 4].map((item) => <span className="skeleton-card" key={item} />)}
      </div>
      <div className="skeleton-panel">
        <span className="skeleton-line medium" />
        {[1, 2, 3, 4].map((item) => <span className="skeleton-row" key={item} />)}
      </div>
    </div>
  );
}

export function PageErrorState({
  title = 'Halaman tidak dapat dimuat',
  message = 'Terjadi kendala saat menampilkan halaman. Silakan coba kembali.',
  onRetry = () => window.location.reload(),
}) {
  return (
    <div className="page-error-state" role="alert">
      <span><AlertTriangle size={29} /></span>
      <h1>{title}</h1>
      <p>{message}</p>
      <button className="primary-button" type="button" onClick={onRetry}>
        <RefreshCw size={16} /> Coba Lagi
      </button>
    </div>
  );
}

export class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('ATMS UI error:', error, info);
  }

  componentDidUpdate(prevProps) {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (this.state.hasError) {
      return <PageErrorState onRetry={() => this.setState({ hasError: false })} />;
    }
    return this.props.children;
  }
}
