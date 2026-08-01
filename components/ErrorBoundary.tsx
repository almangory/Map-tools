import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in application:', error, errorInfo);
    this.setState({ errorInfo });
  }

  public handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#071923] text-white flex flex-col items-center justify-center p-6 text-center">
          <div className="max-w-md w-full bg-[#0b2d3d] border border-red-500/30 rounded-3xl p-8 space-y-6 shadow-2xl">
            <div className="w-16 h-16 bg-red-500/10 border border-red-500/30 rounded-2xl flex items-center justify-center mx-auto text-red-400">
              <AlertTriangle className="w-8 h-8" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-black text-white">حدث خطأ غير متوقع / Unexpected Error</h2>
              <p className="text-xs text-white/60 leading-relaxed">
                {this.state.error?.message || 'حدث خطأ في النظام أثناء عرض البيانات'}
              </p>
            </div>
            {this.state.error?.stack && (
              <div className="bg-black/40 p-3 rounded-xl border border-white/10 text-left overflow-x-auto max-h-36 font-mono text-[10px] text-red-300 custom-scrollbar dir-ltr">
                {this.state.error.stack}
              </div>
            )}
            <button
              onClick={() => {
                this.handleReset();
                window.location.reload();
              }}
              className="w-full bg-accent text-primary font-black py-3.5 rounded-xl flex items-center justify-center gap-2 hover:brightness-110 transition-all text-xs shadow-lg"
            >
              <RefreshCw className="w-4 h-4" />
              <span>إعادة تحميل التطبيق / Reload App</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
