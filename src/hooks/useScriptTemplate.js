import { useCallback, useEffect, useMemo, useState } from "react";
import { useTenantConfig } from "./useTenantConfig";
import { getDefaultScriptSections } from "../data/defaultScriptTemplates";

const templateCache = new Map();
const MA_GATE_SECTION_NUMBERS = {
  recordingOk: 1,
  tpmoOk: 2,
  soaOk: 3,
  qualOk: 4,
  neadsOk: 5,
  sobOk: 6,
  enrollOk: 7,
};

async function fetchActiveTemplate(supabaseClient, flowType, tenantId) {
  const baseSelect = "id, tenant_id, flow_type, version, is_active, sections, updated_at";

  if (tenantId) {
    const tenantResult = await supabaseClient
      .from("script_templates")
      .select(baseSelect)
      .eq("tenant_id", tenantId)
      .eq("flow_type", flowType)
      .eq("is_active", true)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (tenantResult.error || tenantResult.data) {
      return tenantResult;
    }
  }

  return supabaseClient
    .from("script_templates")
    .select(baseSelect)
    .is("tenant_id", null)
    .eq("flow_type", flowType)
    .eq("is_active", true)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
}

export function applyFlowSectionNumbers(sections, flowType) {
  if (flowType !== "ma") {
    return sections;
  }

  return sections.map((section, index) => {
    if (section.key === "wrapup") {
      return { ...section, section_number: 8 };
    }
    if (section.gate_field && MA_GATE_SECTION_NUMBERS[section.gate_field]) {
      return { ...section, section_number: MA_GATE_SECTION_NUMBERS[section.gate_field] };
    }

    const nextGated = sections.slice(index + 1).find((item) =>
      item.key === "wrapup" || MA_GATE_SECTION_NUMBERS[item.gate_field]
    );
    const nextSectionNumber =
      nextGated?.key === "wrapup" ? 8 : MA_GATE_SECTION_NUMBERS[nextGated?.gate_field];

    if (nextSectionNumber) {
      return { ...section, section_number: nextSectionNumber };
    }

    return { ...section, section_number: Number(section.section_number || index + 1) };
  });
}

function normalizeSections(sections, flowType) {
  const fallback = getDefaultScriptSections(flowType);
  const source = Array.isArray(sections) && sections.length ? sections : fallback;
  const normalized = [...source]
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

  return applyFlowSectionNumbers(normalized, flowType);
}

export function useScriptTemplate(flowType = "ma") {
  const { tenantId, supabaseClient, loading: tenantLoading } = useTenantConfig();
  const cacheKey = `${tenantId || "default"}:${flowType}`;
  const [state, setState] = useState(() => {
    const cached = templateCache.get(cacheKey);
    return {
      sections: cached?.sections || normalizeSections(null, flowType),
      template: cached?.template || null,
      loading: !cached,
      error: "",
    };
  });

  const load = useCallback(async () => {
    if (tenantLoading) return;
    setState((current) => ({ ...current, loading: true, error: "" }));

    try {
      const { data, error } = await fetchActiveTemplate(supabaseClient, flowType, tenantId);
      if (error) throw error;

      const next = {
        sections: normalizeSections(data?.sections, flowType),
        template: data || null,
        loading: false,
        error: "",
      };
      templateCache.set(cacheKey, next);
      setState(next);
    } catch (error) {
      const next = {
        sections: normalizeSections(null, flowType),
        template: null,
        loading: false,
        error: error?.message || "Script template unavailable.",
      };
      templateCache.set(cacheKey, next);
      setState(next);
    }
  }, [cacheKey, flowType, supabaseClient, tenantId, tenantLoading]);

  useEffect(() => {
    load();
  }, [load]);

  return useMemo(() => ({
    sections: state.sections,
    template: state.template,
    loading: state.loading,
    error: state.error,
    refetch: load,
  }), [load, state]);
}
