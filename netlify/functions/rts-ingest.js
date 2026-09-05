import { createClient } from "@supabase/supabase-js";
import { requireClerkAuth } from "./_clerkAuth.js";
import { findTenantByOrg, isAdminAuth } from "./_tenantSettings.js";
import {
  RTS_CHUNK_SIZE,
  RTS_INGESTION_SYSTEM_PROMPT,
  chunkRows,
  contractStatusForMatrix,
  formatStateAppointments,
  mergeChunkResults,
  normalizeChunkResult,
  parseAnthropicJson,
  parseRtsFile,
  sha256Hex,
} from "./_rtsIngestion.js";

const JSON_HEADERS = { "Content-Type": "application/json" };
const AI_TIMEOUT_MS = 90000;
const MAX_ROWS = 3000;
const AI_CONCURRENCY = 3;

function json(status, payload) {
  return new Response(JSON.stringify(payload), { status, headers: JSON_HEADERS });
}

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase service-role environment variables are not configured.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function clean(value, maxLength = 500) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function normalizedKey(value) {
  return clean(value).toLowerCase().replace(/\s+/g, " ");
}

function agentMappingKey(name, npn) {
  return `${normalizedKey(npn)}\u0000${normalizedKey(name)}`;
}

function isMissingIngestionSchema(error) {
  const message = `${error?.code || ""} ${error?.message || ""} ${error?.details || ""}`;
  return /rts_ingestion_log|tenant_id|state_appointments|schema cache|does not exist|relation/i.test(message);
}

async function resolveTenantContext(supabase, auth) {
  let tenant = auth.orgId ? await findTenantByOrg(supabase, auth.orgId) : null;
  let actor = null;

  if (tenant?.id && auth.userId !== "dev-bypass") {
    const { data, error } = await supabase
      .from("tenant_agents")
      .select("id, tenant_id, name, npn, clerk_user_id, role, is_active")
      .eq("tenant_id", tenant.id)
      .eq("clerk_user_id", auth.userId)
      .eq("is_active", true)
      .maybeSingle();
    if (error) throw error;
    actor = data || null;
  }

  if (!tenant && auth.userId !== "dev-bypass") {
    const { data, error } = await supabase
      .from("tenant_agents")
      .select("id, tenant_id, name, npn, clerk_user_id, role, is_active")
      .eq("clerk_user_id", auth.userId)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    actor = data || null;
    if (actor?.tenant_id) {
      const { data: tenantRow, error: tenantError } = await supabase
        .from("tenants")
        .select("*")
        .eq("id", actor.tenant_id)
        .single();
      if (tenantError) throw tenantError;
      tenant = tenantRow;
    }
  }

  if (auth.userId === "dev-bypass") {
    const { data: tenantRow, error: tenantError } = await supabase
      .from("tenants")
      .select("*")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (tenantError) throw tenantError;
    tenant = tenant || tenantRow;
    if (tenant?.id) {
      const { data: actorRow, error: actorError } = await supabase
        .from("tenant_agents")
        .select("id, tenant_id, name, npn, clerk_user_id, role, is_active")
        .eq("tenant_id", tenant.id)
        .eq("is_active", true)
        .order("role", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (actorError) throw actorError;
      actor = actor || actorRow;
    }
  }

  if (!tenant?.id) {
    const error = new Error("No EnrollGen tenant is linked to this Clerk organization.");
    error.status = 403;
    throw error;
  }
  if (!actor?.id) {
    const error = new Error("Your Clerk user is not linked to an active agent in this tenant.");
    error.status = 403;
    throw error;
  }
  return { tenant, actor };
}

async function getKnownData(supabase, tenantId) {
  const [{ data: agentRows, error: agentError }, { data: carrierRows, error: carrierError }] =
    await Promise.all([
      supabase
        .from("tenant_agents")
        .select("id, name, npn, clerk_user_id, role")
        .eq("tenant_id", tenantId)
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("carrier_rts")
        .select("id, carrier, product_line")
        .eq("tenant_id", tenantId)
        .order("carrier"),
    ]);
  if (agentError) throw agentError;
  if (carrierError) throw carrierError;

  const carriersByName = new Map();
  for (const row of carrierRows || []) {
    const key = normalizedKey(row.carrier);
    if (!key) continue;
    if (!carriersByName.has(key)) {
      carriersByName.set(key, { id: row.id, name: row.carrier, product_lines: [] });
    }
    const carrier = carriersByName.get(key);
    if (row.product_line && !carrier.product_lines.includes(row.product_line)) {
      carrier.product_lines.push(row.product_line);
    }
  }

  return {
    agents: (agentRows || []).map((agent) => ({
      id: agent.id,
      name: agent.name,
      npn: agent.npn || null,
    })),
    carriers: [...carriersByName.values()],
  };
}

async function callNormalizer(knownCarriers, knownAgents, rows) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured.");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.RTS_INGESTION_MODEL || "claude-sonnet-4-6",
        max_tokens: 12000,
        temperature: 0,
        system: RTS_INGESTION_SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: `KNOWN_CARRIERS: ${JSON.stringify(knownCarriers)}\nKNOWN_AGENTS: ${JSON.stringify(
              knownAgents
            )}\nRAW_ROWS: ${JSON.stringify(rows)}`,
          },
        ],
      }),
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error?.message || `Anthropic API returned HTTP ${response.status}.`);
    }
    const text = (data.content || [])
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("")
      .trim();
    return parseAnthropicJson(text);
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("The RTS normalization request timed out.");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function mapConcurrent(items, concurrency, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

async function findExistingLog(supabase, tenantId, fileHash) {
  const { data, error } = await supabase
    .from("rts_ingestion_log")
    .select("id, source_filename, row_count, created_at")
    .eq("tenant_id", tenantId)
    .eq("file_hash", fileHash)
    .maybeSingle();
  if (error) {
    if (isMissingIngestionSchema(error)) {
      const schemaError = new Error(
        "RTS ingestion database migration 030 has not been applied yet."
      );
      schemaError.status = 503;
      throw schemaError;
    }
    throw error;
  }
  return data || null;
}

async function handleUpload(request, supabase, context) {
  let form;
  try {
    form = await request.formData();
  } catch {
    return json(400, { error: "Expected a multipart file upload." });
  }
  const file = form.get("file");
  if (!file || typeof file.arrayBuffer !== "function") {
    return json(400, { error: "Choose a CSV, TSV, XLSX, or XLS file to upload." });
  }

  const [parsed, fileHash, known] = await Promise.all([
    parseRtsFile(file),
    sha256Hex(file),
    getKnownData(supabase, context.tenant.id),
  ]);
  if (!parsed.rows.length) return json(400, { error: "The uploaded file does not contain data rows." });
  if (parsed.rows.length > MAX_ROWS) {
    return json(413, {
      error: `The file contains ${parsed.rows.length} rows. RTS ingestion currently supports up to ${MAX_ROWS} rows per upload.`,
    });
  }
  const duplicate = await findExistingLog(supabase, context.tenant.id, fileHash);
  if (duplicate) {
    return json(409, {
      error: "This file has already been committed for this tenant.",
      duplicate,
    });
  }

  const chunks = chunkRows(parsed.rows, RTS_CHUNK_SIZE);
  const chunkResults = await mapConcurrent(chunks, AI_CONCURRENCY, async (chunk) => {
    const raw = await callNormalizer(known.carriers, known.agents, chunk.rows);
    return normalizeChunkResult(raw, chunk.start, chunk.rows.length);
  });
  const result = mergeChunkResults(chunkResults, parsed.rows.length);
  if (parsed.sheetNames.length > 1) {
    result.warnings.unshift({
      type: "PARSE_ERROR",
      message: `Workbook contains ${parsed.sheetNames.length} sheets; only "${parsed.sheetName}" was ingested.`,
      row_index: null,
    });
  }

  return json(200, {
    ...result,
    ingestion: {
      filename: clean(file.name, 255),
      file_hash: fileHash,
      sheet_name: parsed.sheetName,
      sheet_names: parsed.sheetNames,
      headers: parsed.headers,
      chunk_count: chunks.length,
    },
    known_carriers: known.carriers,
    known_agents: known.agents,
  });
}

function resolveAgentForRecord(record, mappings, agentsById) {
  const exact = mappings.get(agentMappingKey(record.agent_raw_name, record.agent_npn));
  const byNpn = record.agent_npn
    ? [...mappings.values()].find((item) => normalizedKey(item.raw_npn) === normalizedKey(record.agent_npn))
    : null;
  const byName = [...mappings.values()].find(
    (item) => normalizedKey(item.raw_name) === normalizedKey(record.agent_raw_name)
  );
  const mapping = exact || byNpn || byName;
  return mapping?.matched_agent_id ? agentsById.get(mapping.matched_agent_id) || null : null;
}

function buildNotes(record) {
  const parts = [];
  if (record.writing_number) parts.push(`Writing #: ${clean(record.writing_number, 160)}`);
  for (const certification of record.certifications || []) {
    const details = [certification.status, certification.date].filter(Boolean).join(", ");
    parts.push(`Certification: ${clean(certification.name, 160)}${details ? ` (${details})` : ""}`);
  }
  if (record.effective_date) parts.push(`Effective: ${record.effective_date}`);
  if (record.termination_date) parts.push(`Termination: ${record.termination_date}`);
  return parts.join(" | ").slice(0, 2000);
}

function channelForSource(sourceType) {
  return {
    SMS_sureLC: "SMS/SureLC",
    Ritter: "Ritter",
    Savoy: "Savoy/RPS",
    Messer: "Messer",
  }[sourceType] || "Imported";
}

async function handleCommit(supabase, context, body) {
  const admin = context.actor.role === "admin" || isAdminAuth(context.auth);
  if (!admin) return json(403, { error: "Only a tenant admin can commit an RTS ingestion." });

  const filename = clean(body.source_filename || body.ingestion?.filename, 255);
  const fileHash = clean(body.file_hash || body.ingestion?.file_hash, 64).toLowerCase();
  if (!filename || !/^[a-f0-9]{64}$/.test(fileHash)) {
    return json(400, { error: "The ingestion filename or SHA-256 hash is invalid." });
  }
  const duplicate = await findExistingLog(supabase, context.tenant.id, fileHash);
  if (duplicate) {
    return json(409, { error: "This file has already been committed for this tenant.", duplicate });
  }

  const rawRecords = Array.isArray(body.rts_records) ? body.rts_records : [];
  if (!rawRecords.length) return json(400, { error: "Select at least one RTS record to commit." });
  if (rawRecords.length > MAX_ROWS) return json(413, { error: `A commit may contain at most ${MAX_ROWS} records.` });

  const normalized = normalizeChunkResult(
    {
      source_format: body.source_format,
      agents_matched: body.agents_matched,
      carrier_mappings: body.carrier_mappings,
      rts_records: rawRecords,
      warnings: body.warnings,
    },
    0,
    rawRecords.length
  );
  const rawCarrierMappings = Array.isArray(body.carrier_mappings) ? body.carrier_mappings : [];
  const approvedNew = new Set(
    rawCarrierMappings
      .filter((mapping) => mapping?.approved === true)
      .map((mapping) => normalizedKey(mapping.raw_carrier_name))
  );
  const known = await getKnownData(supabase, context.tenant.id);
  const { data: tenantAgentRows, error: tenantAgentError } = await supabase
    .from("tenant_agents")
    .select("id, name, npn, clerk_user_id")
    .eq("tenant_id", context.tenant.id)
    .eq("is_active", true);
  if (tenantAgentError) throw tenantAgentError;
  const agentsById = new Map(
    (tenantAgentRows || []).map((agent) => [agent.id, agent])
  );
  const knownCarriersById = new Map(known.carriers.map((carrier) => [carrier.id, carrier]));
  const knownCarriersByName = new Map(
    known.carriers.map((carrier) => [normalizedKey(carrier.name), carrier])
  );
  const agentMappings = new Map(
    normalized.agents_matched.map((mapping) => [
      agentMappingKey(mapping.raw_name, mapping.raw_npn),
      mapping,
    ])
  );
  const carrierMappings = new Map(
    normalized.carrier_mappings.map((mapping) => [normalizedKey(mapping.raw_carrier_name), mapping])
  );
  const channel = channelForSource(normalized.source_format.source_type);
  const skippedWarnings = [];
  const rowsByKey = new Map();

  for (const [index, record] of normalized.rts_records.entries()) {
    const agent = resolveAgentForRecord(record, agentMappings, agentsById);
    if (!agent) {
      skippedWarnings.push({
        type: "UNKNOWN_AGENT",
        message: `Skipped ${record.agent_raw_name || "unnamed agent"}: no tenant agent was selected.`,
        row_index: index,
      });
      continue;
    }
    const carrierMapping = carrierMappings.get(normalizedKey(record.carrier_raw_name));
    if (!carrierMapping) {
      skippedWarnings.push({
        type: "NEW_CARRIER",
        message: `Skipped ${record.carrier_raw_name || "unnamed carrier"}: no carrier mapping was supplied.`,
        row_index: index,
      });
      continue;
    }

    let carrierName = "";
    let carrierId = null;
    if (carrierMapping.match_status === "MATCHED") {
      const knownCarrier =
        knownCarriersById.get(carrierMapping.matched_carrier_id) ||
        knownCarriersByName.get(normalizedKey(carrierMapping.matched_carrier_name));
      carrierName = knownCarrier?.name || "";
      carrierId = knownCarrier?.id || null;
    } else if (approvedNew.has(normalizedKey(carrierMapping.raw_carrier_name))) {
      carrierName = clean(carrierMapping.suggested_name || record.carrier_raw_name, 255);
    }
    if (!carrierName) {
      skippedWarnings.push({
        type: "NEW_CARRIER",
        message: `Skipped ${record.carrier_raw_name || "unnamed carrier"}: the new carrier was not approved.`,
        row_index: index,
      });
      continue;
    }

    const certDate = record.certifications.find((certification) => certification.date)?.date || "";
    const row = {
      tenant_id: context.tenant.id,
      channel,
      carrier: carrierName,
      carrier_source_id: carrierId,
      product_line: record.product_line,
      agent_id: agent.id,
      agent_name: agent.name,
      agent_npn: agent.npn || record.agent_npn,
      clerk_user_id: agent.clerk_user_id || null,
      status: contractStatusForMatrix(record.contract_status),
      states: formatStateAppointments(record.states),
      state_appointments: record.states,
      writing_number: record.writing_number,
      certifications: record.certifications,
      cert_date: certDate,
      termination_date: record.termination_date,
      effective_date: record.effective_date,
      notes: buildNotes(record),
      source_file_hash: fileHash,
    };
    const rowKey = [channel, carrierName, record.product_line, agent.name]
      .map(normalizedKey)
      .join("\u0000");
    if (rowsByKey.has(rowKey)) {
      skippedWarnings.push({
        type: "DUPLICATE_ROW",
        message: `Duplicate ${carrierName} / ${record.product_line} row for ${agent.name}; the last row was used.`,
        row_index: index,
      });
    }
    rowsByKey.set(rowKey, row);
  }

  const rows = [...rowsByKey.values()];
  if (!rows.length) {
    return json(400, {
      error: "No records are ready to commit. Resolve unknown agents and approve or map new carriers.",
      warnings: skippedWarnings,
    });
  }

  const warnings = [...normalized.warnings, ...skippedWarnings];
  const recordsDetected = Math.max(
    rawRecords.length,
    Number(body.records_detected) || rawRecords.length
  );
  const recordsSkipped = Math.max(0, recordsDetected - rows.length);
  const sourceRowCount = Math.max(
    rawRecords.length,
    Number(body.source_format?.row_count) || rawRecords.length
  );
  const { data: commitRows, error: commitError } = await supabase.rpc("commit_rts_ingestion", {
    p_tenant_id: context.tenant.id,
    p_uploaded_by: context.actor.id,
    p_source_filename: filename,
    p_source_type: normalized.source_format.source_type,
    p_file_hash: fileHash,
    p_row_count: sourceRowCount,
    p_records_skipped: recordsSkipped,
    p_warnings: warnings,
    p_rows: rows,
  });
  if (commitError) throw commitError;
  const commitResult = commitRows?.[0];
  if (!commitResult?.ingestion_id) throw new Error("RTS ingestion did not return an audit ID.");

  return json(200, {
    ingestion_id: commitResult.ingestion_id,
    committed_at: commitResult.committed_at,
    records_created: commitResult.records_created,
    records_updated: commitResult.records_updated,
    records_skipped: recordsSkipped,
    warnings,
  });
}

export default async (request) => {
  if (request.method !== "POST") return json(405, { error: "Method not allowed" });
  const auth = await requireClerkAuth(request);
  if (auth.response) return auth.response;

  try {
    const supabase = getSupabase();
    const context = { ...(await resolveTenantContext(supabase, auth)), auth };
    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const body = await request.json().catch(() => null);
      if (!body || body.action !== "commit") {
        return json(400, { error: "Invalid RTS ingestion action." });
      }
      return await handleCommit(supabase, context, body);
    }
    return await handleUpload(request, supabase, context);
  } catch (error) {
    console.error("[rts-ingest] failed:", error);
    return json(error.status || 500, {
      error: error.message || "RTS ingestion failed.",
    });
  }
};

export const config = { path: "/api/rts-ingest" };
