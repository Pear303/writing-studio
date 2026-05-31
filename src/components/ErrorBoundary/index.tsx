import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('未捕获的错误:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div className="flex items-center justify-center h-screen bg-vscode-bg">
            <div className="text-center p-8">
              <h2 className="text-2xl font-bold mb-4" style={{ color: 'var(--color-danger, #ef4444)' }}>出现错误</h2>
              <p className="text-vscode-text mb-4">
                {this.state.error?.message || '应用遇到未知错误'}
              </p>
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 rounded hover:opacity-80"
                style={{
                  backgroundColor: 'var(--color-vscode-active, #007acc)',
                  color: '#ffffff',
                }}
              >
                重新加载
              </button>
            </div>
          </div>
        )
      );
    }

    return this.props.children;
  }
}
