import { useCallback, useEffect, useMemo, useState } from "react";
import { useUser } from "@clerk/clerk-react";
import { ArrowDown, ArrowUp, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { useTenantConfig } from "../hooks/useTenantConfig";
import { applyFlowSectionNumbers } from "../hooks/useScriptTemplate";
import { getDefaultScriptSections } from "../data/defaultScriptTemplates";
import "./ScriptEditor.css";

const FLOWS = [
  ["ma", "MA"],
  ["medsup", "MED SUP"],
  ["aca", "ACA"],
  ["u65", "U65"],
  ["ancillary", "ANCILLARY"],
];

function isAdminUser(user) {
  const role =
    user?.publicMetadata?.role ||
    user?.privateMetadata?.role ||
    user?.organizationMemberships?.[0]?.role ||
    "";
  return role === "admin" || role === "org:admin" || user?.publicMetadata?.isAdmin === true;
}

function normalizeSections(sections, flow) {
  const source = Array.isArray(sections) && sections.length ? sections : getDefaultScriptSections(flow);
  const normalized = source
    .map((section, index) => ({
      key: section.key || `section_${index + 1}`,
      section_number: Number(section.section_number || index + 1),
      title: section.title || `Section ${index + 1}`,
      gate_field: section.gate_field || null,
      body: section.body || "",
      compliance_locked: Boolean(section.compliance_locked),
      sort_order: Number(section.sort_order || index + 1),
      verbatim: section.verbatim !== false,
      lock_message: section.lock_message || "",
    }))
    .sort((a, b) => a.sort_order - b.sort_order || a.section_number - b.section_number);

  return applyFlowSectionNumbers(normalized, flow);
}

function createSection(flow, order) {
  return {
    key: `${flow}_custom_${Date.now()}`,
    section_number: order,
    title: "New Section",
    gate_field: null,
    body: "",
    compliance_locked: false,
    sort_order: order,
    verbatim: false,
    lock_message: "",
  };
}

export default function ScriptEditor() {
  const { user } = useUser();
  const { tenantId, supabaseClient, loading: tenantLoading } = useTenantConfig();
  const [flow, setFlow] = useState("ma");
  const [template, setTemplate] = useState(null);
  const [sections, setSections] = useState(() => normalizeSections(null, "ma"));
  const [originalSections, setOriginalSections] = useState(() => normalizeSections(null, "ma"));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const canAdmin = isAdminUser(user);

  const loadTemplate = useCallback(async () => {
    if (tenantLoading) return;
    if (!tenantId) {
      const fallback = normalizeSections(null, flow);
      setTemplate(null);
      setSections(fallback);
      setOriginalSections(fallback);
      setLoading(false);
      setMessage("Tenant configuration unavailable.");
      return;
    }
    setLoading(true);
    setMessage("");

    try {
      const { data, error } = await supabaseClient
        .from("script_templates")
        .select("id, tenant_id, flow_type, version, is_active, sections, updated_at")
        .eq("tenant_id", tenantId)
        .eq("flow_type", flow)
        .eq("is_active", true)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      const nextSections = normalizeSections(data?.sections, flow);
      setTemplate(data || null);
      setSections(nextSections);
      setOriginalSections(nextSections);
    } catch (error) {
      const fallback = normalizeSections(null, flow);
      setTemplate(null);
      setSections(fallback);
      setOriginalSections(fallback);
      setMessage(error?.message || "Using local default template.");
    } finally {
      setLoading(false);
    }
  }, [flow, supabaseClient, tenantId, tenantLoading]);

  useEffect(() => {
    loadTemplate();
  }, [loadTemplate]);

  const changedCount = useMemo(() => {
    const before = JSON.stringify(originalSections);
    const after = JSON.stringify(sections);
    return before === after ? 0 : sections.length;
  }, [originalSections, sections]);

  const patchSection = (index, patch) => {
    setSections((current) =>
      current.map((section, idx) => (idx === index ? { ...section, ...patch } : section))
    );
  };

  const moveSection = (index, delta) => {
    setSections((current) => {
      const nextIndex = index + delta;
      if (nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      const [item] = next.splice(index, 1);
      next.splice(nextIndex, 0, item);
      return next.map((section, idx) => ({
        ...section,
        sort_order: idx + 1,
        section_number: Number.isFinite(section.section_number) ? section.section_number : idx + 1,
      }));
    });
  };

  const deleteSection = (index) => {
    setSections((current) => current.filter((_, idx) => idx !== index));
  };

  const addSection = () => {
    setSections((current) => [...current, createSection(flow, current.length + 1)]);
  };

  const saveTemplate = async () => {
    if (!tenantId) return;
    setSaving(true);
    setMessage("");
    const payloadSections = applyFlowSectionNumbers(
      sections
        .slice()
        .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0))
        .map((section, index) => ({
          ...section,
          sort_order: index + 1,
        })),
      flow
    );

    try {
      if (template?.id) {
        const { error } = await supabaseClient
          .from("script_templates")
          .update({ sections: payloadSections, updated_at: new Date().toISOString() })
          .eq("id", template.id)
          .eq("tenant_id", tenantId);
        if (error) throw error;
      } else {
        const { data, error } = await supabaseClient
          .from("script_templates")
          .insert({
            tenant_id: tenantId,
            flow_type: flow,
            version: 1,
            is_active: true,
            sections: payloadSections,
          })
          .select("id, tenant_id, flow_type, version, is_active, sections, updated_at")
          .single();
        if (error) throw error;
        setTemplate(data);
      }

      setOriginalSections(payloadSections);
      setMessage("Saved.");
    } catch (error) {
      setMessage(error?.message || "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  if (!canAdmin) {
    return (
      <div className="script-editor-empty">
        <h2>Script Editor</h2>
        <p>Admin access required.</p>
      </div>
    );
  }

  return (
    <section className="script-editor">
      <div className="script-editor-top">
        <div>
          <h2>Script Editor</h2>
          <p>{loading ? "Loading template..." : `${sections.length} sections loaded`}</p>
        </div>
        <div className="script-editor-actions">
          <button type="button" className="secondary" onClick={loadTemplate} disabled={saving}>
            <RotateCcw size={14} /> Revert to Default
          </button>
          <button type="button" className="primary" onClick={saveTemplate} disabled={saving || !changedCount}>
            <Save size={14} /> {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>

      <div className="script-editor-tabs">
        {FLOWS.map(([id, label]) => (
          <button
            type="button"
            key={id}
            className={flow === id ? "is-active" : ""}
            onClick={() => setFlow(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {message ? <div className="script-editor-message">{message}</div> : null}

      <div className="script-editor-diff">
        {changedCount ? "Unsaved changes pending." : "No pending changes."}
      </div>

      <div className="script-editor-list">
        {sections.map((section, index) => (
          <article className="script-editor-card" key={section.key}>
            <div className="script-editor-card-head">
              <span>{String(index + 1).padStart(2, "0")}</span>
              <input
                value={section.title}
                onChange={(event) => patchSection(index, { title: event.target.value })}
              />
              <button type="button" title="Move up" onClick={() => moveSection(index, -1)}>
                <ArrowUp size={14} />
              </button>
              <button type="button" title="Move down" onClick={() => moveSection(index, 1)}>
                <ArrowDown size={14} />
              </button>
              <button
                type="button"
                title={section.compliance_locked ? "Compliance-locked sections cannot be deleted" : "Delete section"}
                disabled={section.compliance_locked}
                onClick={() => deleteSection(index)}
              >
                <Trash2 size={14} />
              </button>
            </div>

            <textarea
              value={section.body}
              onChange={(event) => patchSection(index, { body: event.target.value })}
              rows={8}
            />

            <div className="script-editor-options">
              <label>
                <input
                  type="checkbox"
                  checked={section.compliance_locked}
                  onChange={(event) =>
                    patchSection(index, { compliance_locked: event.target.checked })
                  }
                />
                Compliance locked
              </label>
              {section.compliance_locked ? (
                <span className="script-editor-lock-note">
                  Locking this section prevents agents from editing it.
                </span>
              ) : null}
              <label>
                <input
                  type="checkbox"
                  checked={section.verbatim}
                  onChange={(event) => patchSection(index, { verbatim: event.target.checked })}
                />
                Verbatim
              </label>
              <label>
                Sort
                <input
                  type="number"
                  value={section.sort_order}
                  onChange={(event) =>
                    patchSection(index, { sort_order: Number(event.target.value) || index + 1 })
                  }
                />
              </label>
            </div>
          </article>
        ))}
      </div>

      <button type="button" className="script-editor-add" onClick={addSection}>
        <Plus size={14} /> Add Section
      </button>
    </section>
  );
}
