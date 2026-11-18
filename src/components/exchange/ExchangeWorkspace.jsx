import './exchange.css';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAppAuth } from '../../context/AuthContext';
import { useExchangeRead, errorLine } from './exchangeUi.jsx';
import { CampaignsPanel, ScorecardPanel, UsagePanel, RetentionPanel, ScreenerPanel } from './BuyerPanels.jsx';
import { PublishersPanel, RoutesPanel, PlansPanel, NetworkPanel, ApiKeysPanel } from './OperatorPanels.jsx';

/** Sub tabs for this administrator. Operator tabs appear only when the server says this tenant is the operator. */
export function exchangeTabs(context) {
  const f = context?.features || {};
  const tabs = [{ id: 'campaigns', label: 'Campaigns' }];
  if (f.scorecard) tabs.push({ id: 'scorecard', label: 'Scorecard' }, { id: 'usage', label: 'Usage' });
  tabs.push({ id: 'retention', label: 'Retention' });
  if (f.screener) tabs.push({ id: 'screener', label: 'Screener' });
  if (context?.operator === true) {
    tabs.push({ id: 'publishers', label: 'Publishers', operator: true }, { id: 'routes', label: 'Routes', operator: true },
      { id: 'plans', label: 'Plans', operator: true });
    if (f.scorecard) tabs.push({ id: 'network', label: 'Network', operator: true });
    tabs.push({ id: 'keys', label: 'API Keys', operator: true });
  }
  return tabs;
}

const PANELS = { campaigns: CampaignsPanel, scorecard: ScorecardPanel, usage: UsagePanel, retention: RetentionPanel,
  screener: ScreenerPanel, publishers: PublishersPanel, routes: RoutesPanel, plans: PlansPanel, network: NetworkPanel,
  keys: ApiKeysPanel };

export function ExchangeWorkspaceView({ getToken, initialTab = 'campaigns' }) {
  const { read, error } = useExchangeRead(getToken);
  const [context, setContext] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [active, setActive] = useState(initialTab);
  useEffect(() => {
    let live = true;
    Promise.all([read('buyer', 'context', {}), read('buyer', 'campaigns', {})]).then(([ctx, list]) => {
      if (!live) return;
      if (ctx) setContext({ ...ctx, operator: ctx.operator === true });
      if (list) setCampaigns(list.campaigns);
    });
    return () => { live = false; };
  }, [read]);
  const tabs = useMemo(() => exchangeTabs(context), [context]);
  const current = tabs.some(tab => tab.id === active) ? active : 'campaigns';
  const onCampaign = useCallback(updated => setCampaigns(list => list.map(c => (c.id === updated.id ? { ...c, ...updated } : c))), []);
  if (!context) return <div className="exchange-workspace">{errorLine(error) || <div className="exchange-empty">Loading</div>}</div>;
  const Panel = PANELS[current];
  return <div className="exchange-workspace">
    <div className="exchange-subtabs" role="tablist" aria-label="Exchange">
      {tabs.map(tab => <button key={tab.id} type="button" role="tab" data-tab={tab.id} aria-selected={current === tab.id}
        className={`exchange-subtab${current === tab.id ? ' is-active' : ''}`} onClick={() => setActive(tab.id)}>{tab.label}</button>)}
    </div>
    {errorLine(error)}
    <Panel key={current} getToken={getToken} context={context} campaigns={campaigns} onCampaign={onCampaign} />
  </div>;
}

export default function ExchangeWorkspace() {
  const { getToken } = useAppAuth();
  return <ExchangeWorkspaceView getToken={getToken} />;
}
