import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="flex flex-col items-center justify-center min-h-[300px] gap-4 p-8 text-center">
          <div className="w-14 h-14 rounded-full bg-red-500/20 flex items-center justify-center text-red-400">
            <AlertTriangle className="w-7 h-7" />
          </div>
          <div>
            <h2 className="text-lg font-semibold mb-1">Something went wrong</h2>
            <p className="text-sm text-surface-400 font-mono max-w-md break-all">
              {this.state.error?.message}
            </p>
          </div>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="btn-ghost flex items-center gap-2 text-sm"
          >
            <RefreshCw className="w-4 h-4" /> Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
