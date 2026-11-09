import React from 'react';
import AppFailureView from './AppFailureView';

/**
 * Only catches React rendering errors; network/auth failures have their own
 * non-destructive 503 state. Never log a raw exception carrying private data.
 */
export default class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    // No exception object, component stack or diary content in console.
    console.error('Reflect unexpected rendering error (500).');
  }

  render() {
    if (this.state.failed) return <AppFailureView code={500} />;
    return this.props.children;
  }
}
