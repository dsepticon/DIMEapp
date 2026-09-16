import React, { Component, ErrorInfo } from 'react';
import { createRoot } from 'react-dom/client';
import Home from './activeHome';
import './globals.css';
class ErrorBoundary extends Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(_error: Error, _info: ErrorInfo) {
    /* Never log tokens or private component state. */
  }
  render() {
    return this.state.failed ? (
      <main>
        <h1>D.I.M.E. could not open this view</h1>
        <p>
          {import.meta.env.VITE_DIME_MODE === 'guest'
            ? 'Guest progress is not saved. Reload to start a fresh demo.'
            : 'Your server state is preserved.'}
        </p>
        <button onClick={() => location.reload()}>
          {import.meta.env.VITE_DIME_MODE === 'guest' ? 'Reload demo' : 'Reload extension'}
        </button>
      </main>
    ) : (
      this.props.children
    );
  }
}
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <Home />
    </ErrorBoundary>
  </React.StrictMode>,
);
