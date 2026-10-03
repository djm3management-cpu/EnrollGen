import { useState } from 'react';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { GripVertical, ArrowUp, ArrowDown } from 'lucide-react';
import { LINES_OF_BUSINESS } from '../../lib/opportunities';
import { notifyOpportunitiesUpdated } from '../../hooks/useOpportunities';
import OpportunityDialog from './OpportunityDialog';

function StageSettingsRow({ stage, index, count, disabled, onChange, onMove, onDelete }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: stage.id, disabled });
  return <div className="opps-stage-settings" ref={setNodeRef} style={{ transform: transform ? `translate3d(${transform.x}px,${transform.y}px,0)` : undefined, transition }}>
    <button type="button" className="contacts-mini-btn opps-drag-handle" aria-label={`Reorder ${stage.name}`} {...attributes} {...listeners}><GripVertical size={16} /></button>
    <label className="contacts-edit-field"><span>STAGE NAME</span><input className="contacts-edit-input" required maxLength={100} value={stage.name} onChange={(event) => onChange({ name: event.target.value })} /></label>
    <label className="contacts-edit-field"><span>COLOR</span><input type="color" aria-label={`${stage.name} color`} value={stage.color} onChange={(event) => onChange({ color: event.target.value })} /></label>
    <label className="contacts-edit-field"><span>OUTCOME</span><select className="contacts-edit-input" value={stage.is_won ? 'won' : stage.is_lost ? 'lost' : 'open'} onChange={(event) => onChange({ is_won: event.target.value === 'won', is_lost: event.target.value === 'lost' })}><option value="open">Open</option><option value="won">Won</option><option value="lost">Lost</option></select></label>
    <div className="opps-actions"><button type="button" className="contacts-mini-btn" aria-label={`Move ${stage.name} up`} disabled={disabled || index === 0} onClick={() => onMove(index, index - 1)}><ArrowUp size={14} /></button><button type="button" className="contacts-mini-btn" aria-label={`Move ${stage.name} down`} disabled={disabled || index === count - 1} onClick={() => onMove(index, index + 1)}><ArrowDown size={14} /></button><button type="button" className="contacts-mini-btn" disabled={disabled || count === 1} onClick={onDelete}>DELETE</button></div>
  </div>;
}

function SettingsEditor({ data, pipeline, onClose, onBusyChange }) {
  const [name, setName] = useState(pipeline?.name || 'New Pipeline');
  const [lob, setLob] = useState(pipeline?.line_of_business || '');
  const [stages, setStages] = useState(() => pipeline ? data.stages.filter((row) => row.pipeline_id === pipeline.id).map((row) => ({ ...row })) : [{ id: crypto.randomUUID(), name: 'New Lead', color: '#a78bfa', is_won: false, is_lost: false }]);
  const [deleting, setDeleting] = useState(null);
  const [moveTo, setMoveTo] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const reorder = (from, to) => setStages((current) => arrayMove(current, from, to));
  const withBusy = async (work) => {
    setSaving(true); onBusyChange(true); setError('');
    try { await work(); } catch (err) { setError(err.message || 'Pipeline could not be saved.'); }
    finally { setSaving(false); onBusyChange(false); }
  };
  const removeStage = (stage) => {
    if (!data.stages.some((row) => row.id === stage.id)) { setStages((rows) => rows.filter((row) => row.id !== stage.id)); return; }
    setDeleting(stage); setMoveTo('');
  };
  const stageCount = data.rows.filter((row) => row.stage_id === deleting?.id).length;

  return <form className="opps-editor" onSubmit={(event) => {
    event.preventDefault();
    void withBusy(async () => {
      const { error: err } = await data.supabaseClient.rpc('save_opportunity_pipeline', {
        p_tenant_id: data.tenantId, p_requesting_agent_id: data.agentUuid, p_pipeline_id: pipeline?.id || null,
        p_name: name, p_line_of_business: lob || null, p_stages: stages,
      });
      if (err) throw err;
      notifyOpportunitiesUpdated(); onClose();
    });
  }}>
    {error && <div className="ops-error" role="alert">{error}</div>}
    <fieldset disabled={saving || !data.isAdmin}>
      <div className="contacts-edit-grid"><label className="contacts-edit-field"><span>PIPELINE NAME</span><input className="contacts-edit-input" required maxLength={100} value={name} onChange={(event) => setName(event.target.value)} /></label><label className="contacts-edit-field"><span>LINE OF BUSINESS (OPTIONAL)</span><select className="contacts-edit-input" value={lob} onChange={(event) => setLob(event.target.value)}><option value="">All lines</option>{LINES_OF_BUSINESS.map((line) => <option key={line}>{line}</option>)}</select></label></div>
      <p className="contacts-muted">Drag stages or use the arrows to reorder. Colors apply to headers, cards, and badges.</p>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={({ active, over }) => {
        if (over && active.id !== over.id) reorder(stages.findIndex((row) => row.id === active.id), stages.findIndex((row) => row.id === over.id));
      }}><SortableContext items={stages.map((row) => row.id)} strategy={verticalListSortingStrategy}>
        {stages.map((stage, index) => <StageSettingsRow key={stage.id} stage={stage} index={index} count={stages.length} disabled={saving || !data.isAdmin} onMove={reorder} onDelete={() => removeStage(stage)} onChange={(patch) => setStages((rows) => rows.map((row) => row.id === stage.id ? { ...row, ...patch } : row))} />)}
      </SortableContext></DndContext>
      <button type="button" className="contacts-mini-btn" onClick={() => setStages((rows) => [...rows, { id: crypto.randomUUID(), name: 'New Stage', color: '#a78bfa', is_won: false, is_lost: false }])}>+ ADD STAGE</button>
      {deleting && <div className="opps-delete-stage" role="alert"><strong>Delete “{deleting.name}”?</strong>
        <p>{stageCount ? `${stageCount} opportunities must be moved first. The move and deletion are saved together.` : 'Any opportunities added since loading must be moved first.'}</p>
        <label className="contacts-edit-field"><span>MOVE OPPORTUNITIES TO</span><select className="contacts-edit-input" value={moveTo} onChange={(event) => setMoveTo(event.target.value)}><option value="">Choose a stage</option>{stages.filter((row) => row.id !== deleting.id && data.stages.some((item) => item.id === row.id)).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
        <div className="opps-actions"><button type="button" className="contacts-mini-btn" disabled={saving || (stageCount > 0 && !moveTo)} onClick={() => { void withBusy(async () => {
          const { error: err } = await data.supabaseClient.rpc('delete_opportunity_stage', { p_stage_id: deleting.id, p_requesting_agent_id: data.agentUuid, p_move_to_stage_id: moveTo || null });
          if (err) throw err;
          setStages((rows) => rows.filter((row) => row.id !== deleting.id)); setDeleting(null); notifyOpportunitiesUpdated();
        }); }}> {moveTo ? 'MOVE & DELETE' : 'DELETE EMPTY STAGE'}</button><button type="button" className="contacts-mini-btn" onClick={() => setDeleting(null)}>CANCEL</button></div>
      </div>}
    </fieldset>
    {!data.isAdmin && <p className="contacts-muted">Only administrators can change pipeline settings.</p>}
    <button className="contacts-mini-btn opps-primary" disabled={saving || !data.isAdmin || Boolean(deleting)}>{saving ? 'SAVING…' : 'SAVE PIPELINE'}</button>
  </form>;
}

export default function PipelineSettings({ data, pipelineId, onClose }) {
  const [selected, setSelected] = useState(pipelineId);
  const [busy, setBusy] = useState(false);
  return <OpportunityDialog title="Pipeline Settings" busy={busy} onClose={onClose}>
    <div className="opps-actions"><label className="contacts-edit-field"><span>PIPELINE</span><select className="contacts-edit-input" value={selected || ''} disabled={busy} onChange={(event) => setSelected(event.target.value)}>{!selected && <option value="">New pipeline</option>}{data.pipelines.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
      {data.isAdmin && <button type="button" className="contacts-mini-btn" disabled={busy} onClick={() => setSelected(null)}>+ NEW PIPELINE</button>}
    </div>
    <SettingsEditor key={selected || 'new'} data={data} pipeline={data.pipelines.find((row) => row.id === selected)} onBusyChange={setBusy} onClose={onClose} />
  </OpportunityDialog>;
}
