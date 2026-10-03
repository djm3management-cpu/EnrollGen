import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DndContext, DragOverlay, KeyboardSensor, MouseSensor, TouchSensor, closestCorners, useDroppable, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { ChevronDown, ChevronRight, LayoutGrid, List, MessageCircle, Phone, Settings, Plus, Search, Tag, FileText, MoreHorizontal } from 'lucide-react';
import { useOpportunities } from '../../hooks/useOpportunities';
import { useContactsList } from '../../hooks/useContacts';
import { useUnreadMessages } from '../../hooks/useMessages';
import { useContactTags } from '../../hooks/useContactTags';
import { useInboundCall } from '../../context/InboundCallContext';
import { openContactDialer } from '../../lib/dialerUi';
import { LINES_OF_BUSINESS, daysInStage, filterOpportunities, money, sortOpportunities, opportunityKeyboardCoordinates, opportunityStatus, canDeleteOpportunity } from '../../lib/opportunities';
import NewOpportunityModal from './OpportunityEditor';
import OpportunityDrawer, { StageBadge } from './OpportunityDrawer';
import PipelineSettings from './PipelineSettings';
import ContactTagsPopover from './ContactTagsPopover';
import DeleteOpportunityDialog from './DeleteOpportunityDialog';
import OpportunityRowMenu from './OpportunityRowMenu';

function CardAction({ label, count = 0, children, onClick, disabled, expanded }) {
  return <button type="button" className="opps-card-action" aria-label={label} title={label} disabled={disabled} aria-expanded={expanded}
    onPointerDown={(event) => event.stopPropagation()} onKeyDown={(event) => { if (event.key === ' ' || event.key === 'Enter') event.stopPropagation(); }}
    onClick={(event) => { event.stopPropagation(); onClick(event); }}>{children}
    {count > 0 && <span className="opps-action-count" aria-label={`${count} ${label.toLowerCase()}`}>{count > 99 ? '99+' : count}</span>}
  </button>;
}

function CardSummary({ row, source }) {
  return <><div className="opps-card-top"><strong>{row.contact_name}</strong><span className="opps-days" title="Days in stage">{daysInStage(row)}d</span></div>
    <dl className="opps-card-values"><div><dt>Source:</dt><dd>{source?.name || 'No source'}</dd></div><div><dt>Value:</dt><dd>{money(row.est_value)}</dd></div></dl>
  </>;
}

function OpportunityCard({ row, stage, source, pending, onOpen, actions }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.id, data: { stageId: row.stage_id }, disabled: pending });
  return <article ref={setNodeRef} className={`opps-card${isDragging ? ' is-dragging' : ''}`} style={{ '--stage-color': stage.color,
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined, transition }} aria-busy={pending} onClick={() => { if (!pending && !isDragging) onOpen(); }}>
    <div className="opps-card-body" {...attributes} {...listeners} aria-label={`Move ${row.contact_name} to another stage`} onKeyDown={(event) => {
      if (event.key === 'Enter' && !pending && !isDragging) { event.preventDefault(); onOpen(); }
      else listeners?.onKeyDown?.(event);
    }}><CardSummary row={row} source={source} /></div>
    <div className="opps-card-icons">
      <CardAction label="Call" disabled={pending || !actions.canCall(row.contact_id)} onClick={() => actions.call(row.contact_id)}><Phone size={16} strokeWidth={1.5} /></CardAction>
      <CardAction label="Conversation" count={actions.unread[row.contact_id] || 0} disabled={pending} onClick={() => actions.conversation(row.contact_id)}><MessageCircle size={16} strokeWidth={1.5} /></CardAction>
      <CardAction label="Tags" count={actions.tags.tags.filter((tag) => tag.contact_id === row.contact_id).length} disabled={pending} expanded={actions.tagContact === row.contact_id} onClick={(event) => actions.openTags(row, event.currentTarget)}><Tag size={16} strokeWidth={1.5} /></CardAction>
      <CardAction label="Notes" count={row.notes?.trim() ? 1 : 0} disabled={pending} onClick={() => actions.notes(row.id)}><FileText size={16} strokeWidth={1.5} /></CardAction>
    </div>
  </article>;
}

function StageColumn({ stage, rows, data, onOpen, actions }) {
  const [collapsed, setCollapsed] = useState(false);
  const { setNodeRef, isOver } = useDroppable({ id: stage.id, data: { stageId: stage.id } });
  return <section ref={setNodeRef} className={`opps-column${isOver ? ' is-over' : ''}`} style={{ '--stage-color': stage.color }} aria-label={`${stage.name} stage`}>
    <header className="opps-column-head"><div><h3>{stage.name}</h3><span>{rows.length} opportunities&nbsp; {money(rows.reduce((total, row) => total + Number(row.est_value || 0), 0))}</span></div>
      <button type="button" aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${stage.name}`} aria-expanded={!collapsed} aria-controls={`opps-stage-${stage.id}`} onClick={() => setCollapsed((current) => !current)}>{collapsed ? <ChevronRight size={17} /> : <ChevronDown size={17} />}</button>
    </header>
    <SortableContext items={rows.map((row) => row.id)} strategy={verticalListSortingStrategy}>
      <div id={`opps-stage-${stage.id}`} className="opps-column-cards" hidden={collapsed}>{rows.map((row) => <OpportunityCard key={row.id} row={row} stage={stage} source={data.sources.find((item) => item.id === row.lead_source_id)} pending={data.pendingIds.has(row.id)} onOpen={() => onOpen(row.id)} actions={actions} />)}
        {!rows.length && <div className="opps-empty-column">Drop an opportunity here</div>}
      </div>
    </SortableContext>
  </section>;
}

function ScrollBoard({ children }) {
  const board = useRef(null);
  const [scroll, setScroll] = useState({ max: 0, left: 0, thumb: 32 });
  useEffect(() => {
    const element = board.current;
    const update = () => {
      const next = { max: Math.max(0, element.scrollWidth - element.clientWidth), left: element.scrollLeft,
        thumb: Math.max(32, Math.round(element.clientWidth ** 2 / Math.max(1, element.scrollWidth))) };
      setScroll((current) => current.max === next.max && current.left === next.left && current.thumb === next.thumb ? current : next);
    };
    const resize = new ResizeObserver(update);
    resize.observe(element); update(); element.addEventListener('scroll', update);
    return () => { resize.disconnect(); element.removeEventListener('scroll', update); };
  }, [children]);
  return <div className="opps-board-wrap">
    <div ref={board} id="opps-pipeline-board" className="opps-board" role="region" tabIndex={0} aria-label="Opportunities board">{children}</div>
    {scroll.max > 1 && <input className="opps-board-scrollbar" type="range" min={0} max={scroll.max} value={scroll.left}
      aria-label="Scroll pipeline stages" aria-controls="opps-pipeline-board" aria-valuetext={`${Math.round(scroll.left / scroll.max * 100)}%`}
      style={{ '--opps-scroll-thumb-width': `${scroll.thumb}px` }} onChange={(event) => { board.current.scrollLeft = Number(event.target.value); }} />}
  </div>;
}

const COLUMNS = [
  ['contact_name', 'Contact'], ['title', 'Title'], ['stage_id', 'Stage'], ['status', 'Status'],
  ['line_of_business', 'Business'], ['carrier', 'Carrier'], ['plan_name', 'Plan'],
  ['assigned_agent_id', 'Agent'], ['days', 'Days in stage'], ['lead_source_id', 'Source'],
  ['effective_date', 'Effective date'], ['est_value', 'Est. value'],
];

export default function OpportunitiesView({ onOpenContact }) {
  const data = useOpportunities();
  const [filters, setFilters] = useState({ pipeline: '', agent: '', lob: '', carrier: '', source: '', search: '' });
  const [layout, setLayout] = useState('board');
  const [sort, setSort] = useState({ key: 'contact_name', direction: 'asc' });
  const [creating, setCreating] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [drawerSection, setDrawerSection] = useState(null);
  const [tagPopover, setTagPopover] = useState(null);
  const [settings, setSettings] = useState(false);
  const [draggingId, setDraggingId] = useState(null);
  const [rowMenu, setRowMenu] = useState(null);
  const [deleteId, setDeleteId] = useState(null);
  const pipelineId = data.pipelines.some((row) => row.id === filters.pipeline) ? filters.pipeline : data.pipelines.find((row) => row.is_default)?.id || data.pipelines[0]?.id || '';
  const stageRows = data.stages.filter((row) => row.pipeline_id === pipelineId);
  const visible = useMemo(() => filterOpportunities(data.rows, { ...filters, pipeline: pipelineId }), [data.rows, filters, pipelineId]);
  const selected = data.rows.find((row) => row.id === selectedId);
  const deleting = data.rows.find((row) => row.id === deleteId);
  const menuRow = data.rows.find((row) => row.id === rowMenu?.id);
  const dragging = data.rows.find((row) => row.id === draggingId);
  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: opportunityKeyboardCoordinates }));
  const setFilter = (key, value) => setFilters((current) => ({ ...current, [key]: value }));
  const valueFor = (row, key) => {
    if (key === 'stage_id') return data.stages.find((stage) => stage.id === row.stage_id)?.name || '';
    if (key === 'assigned_agent_id') return data.agents.find((agent) => agent.id === row.assigned_agent_id)?.name || 'Unassigned';
    if (key === 'lead_source_id') return data.sources.find((source) => source.id === row.lead_source_id)?.name || 'No source';
    if (key === 'days') return daysInStage(row);
    if (key === 'status') return opportunityStatus(row, data.stages.find((stage) => stage.id === row.stage_id));
    if (key === 'est_value') return Number(row.est_value || 0);
    return row[key] || '';
  };
  const sorted = sortOpportunities(visible, sort.key, sort.direction, (row) => valueFor(row, sort.key));
  const carriers = [...new Set(data.rows.map((row) => row.carrier).filter(Boolean))].sort();
  const { contacts, error: contactsError } = useContactsList('', data.agentUuid, true);
  const { unreadByContact } = useUnreadMessages();
  const tags = useContactTags(data.rows.map((row) => row.contact_id));
  const inbound = useInboundCall();
  const closeTags = useCallback(() => setTagPopover(null), []);
  const closeRowMenu = useCallback(() => setRowMenu(null), []);
  const openDrawer = (id, section = null) => { closeTags(); setDrawerSection(section); setSelectedId(id); };
  const actions = {
    canCall: (contactId) => Boolean(inbound?.enabled && !inbound.activeCall && !inbound.dialingCall && contacts.find((contact) => contact.id === contactId)?.phone),
    call: (contactId) => openContactDialer(contacts.find((contact) => contact.id === contactId)),
    conversation: onOpenContact, unread: unreadByContact, tags, tagContact: tagPopover?.contactId,
    openTags: (row, anchor) => setTagPopover((current) => current?.anchor === anchor ? null : { contactId: row.contact_id, contactName: row.contact_name, anchor }),
    notes: (id) => openDrawer(id, 'notes'),
  };

  return <div className="opps-view">
    <header className="opps-header"><div className="opps-pipeline-picker"><label className="contacts-edit-field"><span>PIPELINE</span><select aria-label="Pipeline" className="contacts-edit-input" value={pipelineId} onChange={(event) => { setFilter('pipeline', event.target.value); closeTags(); }}>{data.pipelines.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label><span className="opps-total-pill">{visible.length} opportunities</span></div>
      <div className="opps-actions"><div className="opps-layout-toggle" role="group" aria-label="Opportunity layout"><button type="button" className={layout === 'board' ? 'is-active' : ''} aria-label="Board view" title="Board view" aria-pressed={layout === 'board'} onClick={() => { setLayout('board'); closeTags(); }}><LayoutGrid size={17} /></button><button type="button" className={layout === 'list' ? 'is-active' : ''} aria-label="List view" title="List view" aria-pressed={layout === 'list'} onClick={() => { setLayout('list'); closeTags(); }}><List size={17} /></button></div>
        <button className="contacts-mini-btn" aria-label="Pipeline settings" title="Pipeline settings" disabled={data.loading || !pipelineId} onClick={() => setSettings(true)}><Settings size={16} /></button>
        <button className="contacts-mini-btn opps-primary" disabled={data.loading || !stageRows.length || !data.agentUuid} onClick={() => setCreating(true)}><Plus size={15} /> NEW OPPORTUNITY</button>
      </div>
    </header>
    <div className="opps-filters">
      <label className="contacts-edit-field"><span>AGENT</span><select className="contacts-edit-input" value={filters.agent} onChange={(event) => setFilter('agent', event.target.value)}><option value="">All agents</option>{data.agents.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
      <label className="contacts-edit-field"><span>LINE OF BUSINESS</span><select className="contacts-edit-input" value={filters.lob} onChange={(event) => setFilter('lob', event.target.value)}><option value="">All lines</option>{LINES_OF_BUSINESS.map((line) => <option key={line}>{line}</option>)}</select></label>
      <label className="contacts-edit-field"><span>CARRIER</span><select className="contacts-edit-input" value={filters.carrier} onChange={(event) => setFilter('carrier', event.target.value)}><option value="">All carriers</option>{carriers.map((carrier) => <option key={carrier}>{carrier}</option>)}</select></label>
      <label className="contacts-edit-field"><span>SOURCE</span><select className="contacts-edit-input" value={filters.source} onChange={(event) => setFilter('source', event.target.value)}><option value="">All sources</option>{data.sources.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
      <label className="contacts-edit-field opps-search"><span><Search size={10} /> CONTACT NAME</span><input className="contacts-edit-input" placeholder="Search contact name…" value={filters.search} onChange={(event) => setFilter('search', event.target.value)} /></label>
      <button type="button" className="contacts-mini-btn" onClick={() => setFilters({ pipeline: pipelineId, agent: '', lob: '', carrier: '', source: '', search: '' })}>CLEAR</button>
      <button type="button" className="contacts-mini-btn" disabled={data.loading || data.pendingIds.size > 0} onClick={() => data.refresh()}>REFRESH</button>
    </div>
    {data.error && <div className="ops-error" role="alert">{data.error}</div>}
    {contactsError && <div className="ops-error" role="alert">Contact phone numbers could not be loaded: {contactsError}</div>}
    {data.loading ? <div className="contacts-muted">Loading opportunities…</div> : layout === 'board' ? <DndContext sensors={sensors} collisionDetection={closestCorners}
      accessibility={{ screenReaderInstructions: { draggable: 'Press Space to pick up an opportunity, use Left and Right to choose a stage, and press Space to drop. Press Escape to cancel.' } }}
      onDragStart={({ active }) => { closeTags(); setDraggingId(active.id); }} onDragCancel={() => setDraggingId(null)} onDragEnd={({ active, over }) => {
        setDraggingId(null);
        const destination = over?.data.current?.stageId;
        if (destination) void data.moveStage(active.id, destination).catch(() => {});
      }}>
      <ScrollBoard>{stageRows.map((stage) => <StageColumn key={stage.id} stage={stage} rows={visible.filter((row) => row.stage_id === stage.id)} data={data} onOpen={openDrawer} actions={actions} />)}</ScrollBoard>
      <DragOverlay>{dragging && <div className="opps-card opps-card-overlay" style={{ '--stage-color': data.stages.find((row) => row.id === dragging.stage_id)?.color }}><CardSummary row={dragging} source={data.sources.find((row) => row.id === dragging.lead_source_id)} /></div>}</DragOverlay>
    </DndContext> : <div className="contacts-table-wrap"><table className="contacts-table opps-table"><thead><tr>{COLUMNS.map(([key, label]) => <th key={key} aria-sort={sort.key === key ? sort.direction === 'asc' ? 'ascending' : 'descending' : 'none'}><button type="button" onClick={() => setSort({ key, direction: sort.key === key && sort.direction === 'asc' ? 'desc' : 'asc' })}>{label}{sort.key === key ? sort.direction === 'asc' ? ' ↑' : ' ↓' : ''}</button></th>)}<th scope="col">Actions</th></tr></thead>
      <tbody>{sorted.map((row) => <tr key={row.id}>{COLUMNS.map(([key]) => <td key={key}>{key === 'contact_name' ? <button type="button" className="opps-contact-link" onClick={() => openDrawer(row.id)}>{row.contact_name}</button> : key === 'stage_id' ? <StageBadge stage={data.stages.find((stage) => stage.id === row.stage_id)} /> : key === 'est_value' ? money(row.est_value) : valueFor(row, key) === '' ? '—' : String(valueFor(row, key))}</td>)}
        <td><button type="button" className="contacts-mini-btn" aria-label={`Actions for ${row.contact_name}`} aria-haspopup="menu" aria-expanded={rowMenu?.id === row.id} disabled={data.pendingIds.has(row.id)} onClick={(event) => {
          const anchor = event.currentTarget;
          setRowMenu((current) => current?.id === row.id ? null : { id: row.id, anchor });
        }}><MoreHorizontal size={16} /></button></td>
      </tr>)}
        {!sorted.length && <tr><td colSpan={COLUMNS.length + 1} className="contacts-muted">No opportunities match these filters.</td></tr>}
      </tbody></table></div>}
    {creating && <NewOpportunityModal data={data} prefill={{ pipeline_id: pipelineId }} onClose={() => setCreating(false)} />}
    {selected && <OpportunityDrawer row={selected} data={data} initialSection={drawerSection} onClose={() => setSelectedId(null)} onOpenContact={onOpenContact} />}
    {tagPopover && <ContactTagsPopover {...tagPopover} tags={tags} onClose={closeTags} />}
    {settings && <PipelineSettings data={data} pipelineId={pipelineId} onClose={() => setSettings(false)} />}
    {menuRow && <OpportunityRowMenu row={menuRow} anchor={rowMenu.anchor} canDelete={canDeleteOpportunity(menuRow, data.agentUuid, data.isAdmin)} onClose={closeRowMenu} onOpen={() => { closeRowMenu(); openDrawer(menuRow.id); }} onDelete={() => { closeRowMenu(); setDeleteId(menuRow.id); }} />}
    {deleting && <DeleteOpportunityDialog row={deleting} data={data} onClose={() => setDeleteId(null)} onDeleted={() => setDeleteId(null)} />}
  </div>;
}
