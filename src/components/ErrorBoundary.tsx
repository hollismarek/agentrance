import React from 'react';
export class ErrorBoundary extends React.Component<{children: React.ReactNode; label: string}, {failed: boolean}> {
  state = {failed:false};
  static getDerivedStateFromError() {return {failed:true}}
  render() {
    if (this.state.failed) return <div role="alert" className="error render-error">
      <strong>{this.props.label} could not be displayed.</strong>
      <p>Your saved conversation is unchanged. Other panes and session controls remain available.</p>
      <button onClick={() => this.setState({failed:false})}>Retry display</button>
    </div>;
    return this.props.children;
  }
}
