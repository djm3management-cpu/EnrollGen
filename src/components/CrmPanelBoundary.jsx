import { Component } from 'react';
import { debugLog } from '../lib/debugLog.js';

// Keep CRM navigation and adjacent panels mounted when a record cannot render.
export default class CrmPanelBoundary extends Component {
  state = { failed: false, resetKey: this.props.resetKey };

  static getDerivedStateFromError() { return { failed: true }; }

  static getDerivedStateFromProps(props, state) {
    return props.resetKey !== state.resetKey ? { failed: false, resetKey: props.resetKey } : null;
  }

  componentDidCatch() { debugLog("[CRM] Sub-panel render failed"); }

  render() {
    if (!this.state.failed) return this.props.children;
    const fallback = <section className="contacts-section" aria-label={this.props.label}>
      <div className="ops-error" role="alert">{this.props.label || 'CRM panel'} failed to load.</div>
      <button data-key-role="secondary" type="button" className="contacts-mini-btn" onClick={() => this.setState({ failed: false })}>Retry</button>
    </section>;
    // Row boundaries must preserve valid table markup when a record fails.
    return this.props.tableColumns
      ? <tr className="call-log-expand-row"><td colSpan={this.props.tableColumns}>{fallback}</td></tr>
      : fallback;
  }
}
