import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { scoreCall, calculateAverageConfidence } from "../src/compliance/engine/ScoringEngine.js";
import { classifyCall, detectCallDirection } from "../src/compliance/engine/IntentClassifier.js";
import { ALL_INTENTS, CATEGORY_WEIGHTS } from "../src/compliance/intents/index.js";

const PAGE_SIZE = 1000;
const AI_TIMEOUT_MS = 45000;
const RUN_NOTE_PREFIX = "Re-score with calibrated intent taxonomy";
const DEFAULT_PRODUCT_TYPE = "MA";
const REQUIRED_POINTS_TOTAL = Object.values(CATEGORY_WEIGHTS)
  .reduce((sum, category) => sum + Number(category.max_points || 0), 0);

const intentByCode = new Map(ALL_INTENTS.map((intent) => [intent.intent_code, intent]));
const violationDetectorCodes = new Set([
  "ELIG_011_NO_PII_FOR_OPTIONS",
  "ELIG_012_ZIP_ONLY_FOR_PLANS",
]);

function parseArgs(argv = process.argv.slice(2)) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const [key, inlineValue] = arg.slice(2).split("=");
    if (inlineValue !== undefined) {
      args[key] = inlineValue;
    } else if (argv[i + 1] && !argv[i + 1].startsWith("--")) {
      args[key] = argv[i + 1];
      i += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
}

async function loadLocalEnv() {
  for (const file of [".env.local", ".env"]) {
    try {
      const content = await fs.readFile(path.resolve(process.cwd(), file), "utf8");
      for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const match =
          trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/) ||
          trimmed.match(/^\$env:([A-Za-z_][A-Za-z0-9_]*)=(.*)$/i);
        if (!match) continue;
        const [, key, rawValue] = match;
        if (process.env[key]) continue;
        process.env[key] = rawValue.replace(/^['"]|['"]$/g, "");
      }
    } catch {
      // Env files are optional in hosted or scheduled environments.
    }
  }
}

async function createSupabaseAdminClient() {
  await loadLocalEnv();
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

  if (!url || !key) {
    throw new Error("Missing Supabase env. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function callClaude(system, user) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is required when using --classify-missing.");
  }

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
        model: "claude-sonnet-4-6",
        max_tokens: 8192,
        system,
        messages: [{ role: "user", content: user }],
      }),
      signal: controller.signal,
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error?.message || `Anthropic API error ${response.status}`);
    }

    return data.content
      ?.map((block) => (block.type === "text" ? block.text : ""))
      .join("") || "";
  } finally {
    clearTimeout(timeout);
  }
}

async function checkClaudeAvailable() {
  try {
    const response = await callClaude("Return only OK.", "OK");
    return /ok/i.test(response);
  } catch (error) {
    console.warn(`Claude classification unavailable: ${error.message}`);
    return false;
  }
}

async function fetchAll(supabase, table, select, applyQuery = query => query) {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const to = from + PAGE_SIZE - 1;
    const query = applyQuery(supabase.from(table).select(select)).range(from, to);
    const { data, error } = await query;
    if (error) throw new Error(`${table} select failed: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}

function chunkArray(items, size = 500) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function selectInBatches(supabase, table, column, values, select) {
  const uniqueValues = [...new Set((values || []).filter(Boolean))];
  const rows = [];
  for (const chunk of chunkArray(uniqueValues, 250)) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .in(column, chunk);
    if (error) throw new Error(`${table} select failed: ${error.message}`);
    rows.push(...(data || []));
  }
  return rows;
}

async function insertInBatches(supabase, table, rows, size = 500) {
  for (const chunk of chunkArray(rows, size)) {
    const { error } = await supabase.from(table).insert(chunk);
    if (error) throw new Error(`${table} insert failed: ${error.message}`);
  }
}

function isRescoreScorecard(scorecard) {
  return String(scorecard.review_notes || "").startsWith(RUN_NOTE_PREFIX);
}

function pickLatestSourceScorecards(scorecards, includePriorRescores = false) {
  const byCall = new Map();
  for (const scorecard of scorecards) {
    if (!scorecard.call_id) continue;
    if (!includePriorRescores && isRescoreScorecard(scorecard)) continue;

    const current = byCall.get(scorecard.call_id);
    const currentTime = current ? new Date(current.created_at || 0).getTime() : -1;
    const nextTime = new Date(scorecard.created_at || 0).getTime();
    if (!current || nextTime >= currentTime) {
      byCall.set(scorecard.call_id, scorecard);
    }
  }
  return [...byCall.values()];
}

function severityWeight(severity) {
  if (severity === "critical") return 3;
  if (severity === "major") return 2;
  return 1;
}

function allocateCategoryPoints(requiredItems) {
  const pointsByCode = new Map();
  const byCategory = new Map();

  for (const item of requiredItems) {
    const list = byCategory.get(item.category) || [];
    list.push(item);
    byCategory.set(item.category, list);
  }

  for (const [category, items] of byCategory.entries()) {
    const maxPoints = Number(CATEGORY_WEIGHTS[category]?.max_points || 0);
    if (maxPoints <= 0 || items.length === 0) continue;

    const totalWeight = items.reduce((sum, item) => sum + severityWeight(item.failure_severity), 0);
    const allocations = items.map((item) => {
      const exact = (maxPoints * severityWeight(item.failure_severity)) / totalWeight;
      return {
        item,
        exact,
        points: Math.max(1, Math.floor(exact)),
        remainder: exact - Math.floor(exact),
      };
    });

    let allocated = allocations.reduce((sum, entry) => sum + entry.points, 0);

    if (allocated < maxPoints) {
      for (const entry of allocations.slice().sort((left, right) => right.remainder - left.remainder)) {
        if (allocated >= maxPoints) break;
        entry.points += 1;
        allocated += 1;
      }
    }

    if (allocated > maxPoints) {
      for (const entry of allocations.slice().sort((left, right) => left.remainder - right.remainder)) {
        while (allocated > maxPoints && entry.points > 1) {
          entry.points -= 1;
          allocated -= 1;
        }
        if (allocated <= maxPoints) break;
      }
    }

    for (const entry of allocations) {
      pointsByCode.set(entry.item.intent_code, entry.points);
    }
  }

  return pointsByCode;
}

function intentAppliesToDirection(intent, direction) {
  const subcategory = String(intent?.subcategory || "").toUpperCase();
  if (subcategory === "OUTBOUND" && direction !== "outbound") return false;
  if (subcategory === "INBOUND" && direction !== "inbound") return false;
  return true;
}

function findBestDetection(detections, intentId, intentCode) {
  const matches = detections.filter((detection) =>
    (intentId && detection.intent_id === intentId) ||
    (intentCode && detection.intent_code === intentCode)
  );
  if (matches.length === 0) return null;
  return matches.reduce((best, detection) =>
    !best || Number(detection.confidence || 0) > Number(best.confidence || 0)
      ? detection
      : best
  , null);
}

function normalizeDetection(detection) {
  return {
    ...detection,
    detected: Boolean(detection.detected),
    confidence: Number(detection.confidence || 0),
    sequence_violation: Boolean(detection.sequence_violation),
    anti_pattern_match: Boolean(detection.anti_pattern_match),
    direction_excluded:
      Boolean(detection.direction_excluded) ||
      detection.detection_method === "direction_filter",
  };
}

function isViolationDetector(intent) {
  if (!intent || intent.is_required) return false;
  return intent.category === "SALES_CONDUCT" || violationDetectorCodes.has(intent.intent_code);
}

function buildTemplateIntentRows(rawTemplateItems) {
  const byCode = new Map();
  const rows = [];

  for (const item of rawTemplateItems) {
    const intentCode = item.compliance_intents?.intent_code || item.intent_code;
    const localIntent = intentByCode.get(intentCode);
    if (!localIntent) continue;
    const row = {
      ...item,
      intent_code: intentCode,
      localIntent,
      category: localIntent.category || item.category,
      question_text: item.question_text || localIntent.description,
      display_order: Number(item.display_order ?? localIntent.sequence_position ?? 900),
    };
    rows.push(row);
    byCode.set(intentCode, row);
  }

  for (const intent of ALL_INTENTS) {
    if (!intent.is_required || byCode.has(intent.intent_code)) continue;
    rows.push({
      id: null,
      intent_id: null,
      intent_code: intent.intent_code,
      localIntent: intent,
      question_text: intent.description,
      category: intent.category,
      display_order: Number(intent.sequence_position ?? 900),
      points_possible: 0,
      is_auto_fail: Boolean(intent.auto_fail),
    });
  }

  return rows.sort((left, right) =>
    Number(left.display_order || 0) - Number(right.display_order || 0) ||
    String(left.intent_code).localeCompare(String(right.intent_code))
  );
}

function buildScoringTemplateItems(rawTemplateItems, detections, direction) {
  const rows = buildTemplateIntentRows(rawTemplateItems);
  const requiredRows = rows
    .filter((row) => row.localIntent.is_required)
    .map((row) => ({
      ...row,
      failure_severity: row.localIntent.failure_severity || "moderate",
    }));
  const pointsByCode = allocateCategoryPoints(requiredRows);
  const scoringItems = [];

  for (const row of rows) {
    const intent = row.localIntent;
    const detection = findBestDetection(detections, row.intent_id, row.intent_code);
    const directionExcluded = !intentAppliesToDirection(intent, direction);

    if (intent.is_required) {
      scoringItems.push({
        ...row,
        points_possible: directionExcluded ? 0 : Number(pointsByCode.get(row.intent_code) || 1),
        is_auto_fail: Boolean(intent.auto_fail),
        is_critical: Boolean(intent.auto_fail),
      });
      continue;
    }

    if (directionExcluded || !detection) continue;

    if (detection.anti_pattern_match && isViolationDetector(intent)) {
      scoringItems.push({
        ...row,
        points_possible: severityWeight(intent.failure_severity),
        is_auto_fail: false,
        is_critical: false,
      });
      continue;
    }

    if (detection.detected && !detection.anti_pattern_match) {
      scoringItems.push({
        ...row,
        points_possible: 0,
        is_auto_fail: false,
        is_critical: false,
      });
    }
  }

  return scoringItems;
}

function addDirectionExcludedDetections(detections, scoringItems, direction) {
  const detectionsWithSynthetic = [...detections];

  for (const item of scoringItems) {
    const intent = item.localIntent || intentByCode.get(item.intent_code);
    if (!intent || intentAppliesToDirection(intent, direction)) continue;
    const existing = findBestDetection(detectionsWithSynthetic, item.intent_id, item.intent_code);
    if (existing) {
      existing.direction_excluded = true;
      continue;
    }

    detectionsWithSynthetic.push({
      id: null,
      intent_id: item.intent_id || null,
      intent_code: item.intent_code,
      detected: false,
      confidence: 0,
      detection_method: "direction_filter",
      direction_excluded: true,
      speaker: null,
      transcript_segment: null,
      segment_start_ms: null,
      segment_end_ms: null,
      sequence_position_actual: null,
      sequence_violation: false,
      sequence_violation_detail: null,
      anti_pattern_match: false,
      anti_pattern_detail: null,
      llm_reasoning: `Not applicable - ${intent.subcategory} intent on ${direction} call`,
    });
  }

  return detectionsWithSynthetic;
}

function prepareDiarizedTranscript(call) {
  if (Array.isArray(call.transcript_diarized) && call.transcript_diarized.length > 0) {
    return call.transcript_diarized;
  }

  if (call.transcript_raw) {
    return [{
      speaker: "agent",
      text: call.transcript_raw,
      start_ms: 0,
      end_ms: (call.call_duration_seconds || 600) * 1000,
    }];
  }

  return [];
}

function buildIntentIdByCode(templateItems) {
  const ids = new Map();
  for (const item of templateItems) {
    const intentCode = item.compliance_intents?.intent_code || item.intent_code;
    if (intentCode && item.intent_id) ids.set(intentCode, item.intent_id);
  }
  return ids;
}

function buildDetectionRows(callId, detections, intentIdByCode) {
  return detections.map((detection) => ({
    call_id: callId,
    intent_id: intentIdByCode.get(detection.intent_code) || null,
    intent_code: detection.intent_code,
    detected: Boolean(detection.detected),
    confidence: Number(detection.confidence || 0),
    detection_method: detection.detection_method || "intent_classifier",
    speaker: detection.speaker || null,
    transcript_segment: detection.transcript_segment || null,
    segment_start_ms: detection.segment_start_ms ?? null,
    segment_end_ms: detection.segment_end_ms ?? null,
    sequence_position_actual: detection.sequence_position_actual ?? null,
    sequence_violation: Boolean(detection.sequence_violation),
    sequence_violation_detail: detection.sequence_violation_detail || null,
    anti_pattern_match: Boolean(detection.anti_pattern_match),
    anti_pattern_detail: detection.anti_pattern_detail || null,
    llm_reasoning: detection.llm_reasoning || null,
  }));
}

function buildDetectionsFromScorecardItems(callId, scorecardItems, templateItems) {
  const templateItemById = new Map(templateItems.map((item) => [item.id, item]));
  const detections = [];

  for (const item of scorecardItems) {
    const templateItem = templateItemById.get(item.template_item_id);
    const intentCode = templateItem?.compliance_intents?.intent_code;
    if (!intentCode) continue;

    const result = String(item.result || "").toLowerCase();
    if (result === "na" || result === "not_applicable") {
      detections.push(normalizeDetection({
        id: item.detection_id || null,
        call_id: callId,
        intent_id: item.intent_id || templateItem.intent_id || null,
        intent_code: intentCode,
        detected: false,
        confidence: 0,
        detection_method: "direction_filter",
        direction_excluded: true,
        transcript_segment: item.evidence_text || null,
        segment_start_ms: item.evidence_timestamp_ms ?? null,
        llm_reasoning: item.notes || "Reconstructed as not applicable from scorecard item",
      }));
      continue;
    }

    if (result !== "pass" && result !== "partial" && result !== "fail") continue;

    const antiPattern = result === "fail" && /anti-pattern/i.test(`${item.notes || ""} ${item.evidence_text || ""}`);
    const detected = result === "pass" || result === "partial" || antiPattern;
    const fallbackConfidence = result === "pass" ? 0.75 : result === "partial" ? 0.5 : 0;

    detections.push(normalizeDetection({
      id: item.detection_id || null,
      call_id: callId,
      intent_id: item.intent_id || templateItem.intent_id || null,
      intent_code: intentCode,
      detected,
      confidence: Number(item.confidence || fallbackConfidence),
      detection_method: "scorecard_item_reconstruction",
      speaker: null,
      transcript_segment: item.evidence_text || null,
      segment_start_ms: item.evidence_timestamp_ms ?? null,
      segment_end_ms: null,
      sequence_position_actual: null,
      sequence_violation: result === "partial" && /sequence/i.test(item.notes || ""),
      sequence_violation_detail: result === "partial" && /sequence/i.test(item.notes || "") ? item.notes : null,
      anti_pattern_match: antiPattern,
      anti_pattern_detail: antiPattern ? item.notes : null,
      llm_reasoning: item.notes || "Reconstructed from prior scorecard item",
    }));
  }

  return detections;
}

function filenameFromCall(call) {
  const metadata = call.metadata || {};
  const candidates = [
    metadata.original_file_name,
    metadata.original_filename,
    metadata.filename,
    metadata.file_name,
    metadata.name,
    call.recording_storage_path,
    call.recording_url,
    call.external_call_id,
    call.id,
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    const withoutQuery = String(candidate).split("?")[0];
    const normalized = withoutQuery.replace(/\\/g, "/").split("/").filter(Boolean).pop();
    if (normalized) return normalized;
  }
  return "Unknown call";
}

function formatPercent(value) {
  if (value == null || Number.isNaN(Number(value))) return "N/A";
  return `${Number(value).toFixed(1)}%`;
}

function printSummaryTable(results) {
  const rows = results.map((result) => ({
    call: result.filename,
    oldScore: formatPercent(result.oldScore),
    newScore: result.skipped ? "SKIPPED" : formatPercent(result.newScore),
    grade: result.skipped ? "-" : result.grade,
    passFail: result.skipped ? result.reason : result.passFail,
  }));

  const widths = {
    call: Math.max("Call".length, ...rows.map((row) => row.call.length)),
    oldScore: Math.max("Old Score".length, ...rows.map((row) => row.oldScore.length)),
    newScore: Math.max("New Score".length, ...rows.map((row) => row.newScore.length)),
    grade: Math.max("Grade".length, ...rows.map((row) => String(row.grade).length)),
    passFail: Math.max("Pass/Fail".length, ...rows.map((row) => String(row.passFail).length)),
  };

  const header = [
    "Call".padEnd(widths.call),
    "Old Score".padStart(widths.oldScore),
    "New Score".padStart(widths.newScore),
    "Grade".padStart(widths.grade),
    "Pass/Fail".padStart(widths.passFail),
  ].join(" | ");

  const separator = [
    "-".repeat(widths.call),
    "-".repeat(widths.oldScore),
    "-".repeat(widths.newScore),
    "-".repeat(widths.grade),
    "-".repeat(widths.passFail),
  ].join("-|-");

  console.log("");
  console.log(header);
  console.log(separator);
  for (const row of rows) {
    console.log([
      row.call.padEnd(widths.call),
      row.oldScore.padStart(widths.oldScore),
      row.newScore.padStart(widths.newScore),
      String(row.grade).padStart(widths.grade),
      String(row.passFail).padStart(widths.passFail),
    ].join(" | "));
  }
}

async function loadTemplateForProduct(supabase, cache, productType) {
  const key = productType || DEFAULT_PRODUCT_TYPE;
  if (cache.has(key)) return cache.get(key);

  let { data: template, error } = await supabase
    .from("scoring_templates")
    .select("*")
    .eq("product_type", key)
    .eq("is_active", true)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if ((!template || error) && key !== DEFAULT_PRODUCT_TYPE) {
    ({ data: template, error } = await supabase
      .from("scoring_templates")
      .select("*")
      .eq("product_type", DEFAULT_PRODUCT_TYPE)
      .eq("is_active", true)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle());
  }

  if (error) throw new Error(`scoring_templates select failed: ${error.message}`);
  if (!template) throw new Error(`No active scoring template found for ${key}`);

  const { data: templateItems, error: itemError } = await supabase
    .from("scoring_template_items")
    .select("*, compliance_intents(intent_code)")
    .eq("template_id", template.id)
    .order("display_order");

  if (itemError) throw new Error(`scoring_template_items select failed: ${itemError.message}`);

  const calibratedTemplate = {
    ...template,
    categories: CATEGORY_WEIGHTS,
    total_possible_points: REQUIRED_POINTS_TOTAL,
  };

  const loaded = { template: calibratedTemplate, templateItems: templateItems || [] };
  cache.set(key, loaded);
  return loaded;
}

function buildScorecardRow({ call, sourceScorecard, template, scoreResult, avgConfidence, runId }) {
  return {
    call_id: call.id,
    template_id: template.id,
    thread_id: call.thread_id || sourceScorecard.thread_id || null,
    is_thread_composite: false,
    overall_score: scoreResult.overall_score,
    overall_grade: scoreResult.overall_grade,
    total_points_earned: scoreResult.total_points_earned,
    total_points_possible: scoreResult.total_points_possible,
    pass_fail: scoreResult.pass_fail,
    auto_fail_triggered: scoreResult.auto_fail_triggered,
    auto_fail_reasons: scoreResult.auto_fail_reasons,
    category_scores: scoreResult.category_scores,
    risk_level: scoreResult.risk_level,
    risk_flags: scoreResult.risk_flags,
    sequence_violations: scoreResult.sequence_violations,
    sentiment_summary: sourceScorecard.sentiment_summary || {},
    coaching_notes: scoreResult.coaching_notes,
    corrective_actions_needed: scoreResult.corrective_actions_needed,
    reviewed: false,
    review_notes: `${RUN_NOTE_PREFIX} ${runId}; source_scorecard_id=${sourceScorecard.id}; avg_confidence=${avgConfidence.toFixed(4)}`,
  };
}

function buildScorecardItemRows(scorecardId, scoreResult) {
  return scoreResult.scorecard_items.map((item) => ({
    scorecard_id: scorecardId,
    template_item_id: item.template_item_id,
    intent_id: item.intent_id,
    detection_id: item.detection_id,
    question_text: item.question_text,
    category: item.category,
    result: item.result,
    points_earned: item.points_earned,
    points_possible: item.points_possible,
    confidence: item.confidence,
    is_auto_fail: item.is_auto_fail,
    auto_fail_triggered: item.auto_fail_triggered,
    notes: item.notes,
    evidence_text: item.evidence_text,
    evidence_timestamp_ms: item.evidence_timestamp_ms,
    display_order: item.display_order,
  }));
}

async function main() {
  const args = parseArgs();
  const dryRun = Boolean(args["dry-run"]);
  const classifyMissing = Boolean(args["classify-missing"]);
  const includePriorRescores = Boolean(args["include-rescores"]);
  const limit = args.limit ? Number(args.limit) : null;
  const runId = new Date().toISOString();
  const supabase = await createSupabaseAdminClient();

  console.log(`Loading existing scorecards${includePriorRescores ? "" : " (excluding prior re-scores)"}...`);
  if (classifyMissing) {
    console.log("Missing intent detections will be classified from existing transcripts.");
  }
  const allScorecards = await fetchAll(
    supabase,
    "compliance_scorecards",
    [
      "id",
      "call_id",
      "template_id",
      "thread_id",
      "overall_score",
      "overall_grade",
      "total_points_earned",
      "total_points_possible",
      "pass_fail",
      "auto_fail_triggered",
      "auto_fail_reasons",
      "category_scores",
      "risk_level",
      "risk_flags",
      "sequence_violations",
      "sentiment_summary",
      "coaching_notes",
      "corrective_actions_needed",
      "review_notes",
      "created_at",
    ].join(", "),
    (query) => query.order("created_at", { ascending: true })
  );

  let sourceScorecards = pickLatestSourceScorecards(allScorecards, includePriorRescores);
  if (limit && limit > 0) sourceScorecards = sourceScorecards.slice(0, limit);

  if (sourceScorecards.length === 0) {
    console.log("No source scorecards found.");
    return;
  }

  console.log(`Found ${sourceScorecards.length} call(s) with source scorecards.`);

  const calls = await selectInBatches(
    supabase,
    "call_records",
    "id",
    sourceScorecards.map((scorecard) => scorecard.call_id),
    [
      "id",
      "external_call_id",
      "thread_id",
      "agent_name",
      "call_direction",
      "call_type",
      "call_duration_seconds",
      "recording_url",
      "recording_storage_path",
      "transcript_raw",
      "transcript_diarized",
      "product_type",
      "metadata",
    ].join(", ")
  );

  const detections = await selectInBatches(
    supabase,
    "intent_detections",
    "call_id",
    sourceScorecards.map((scorecard) => scorecard.call_id),
    [
      "id",
      "call_id",
      "intent_id",
      "intent_code",
      "detected",
      "confidence",
      "detection_method",
      "speaker",
      "transcript_segment",
      "segment_start_ms",
      "segment_end_ms",
      "sequence_position_actual",
      "sequence_violation",
      "sequence_violation_detail",
      "anti_pattern_match",
      "anti_pattern_detail",
      "llm_reasoning",
    ].join(", ")
  );

  const sourceScorecardItems = await selectInBatches(
    supabase,
    "scorecard_items",
    "scorecard_id",
    sourceScorecards.map((scorecard) => scorecard.id),
    [
      "id",
      "scorecard_id",
      "template_item_id",
      "intent_id",
      "detection_id",
      "result",
      "confidence",
      "notes",
      "evidence_text",
      "evidence_timestamp_ms",
      "is_auto_fail",
      "auto_fail_triggered",
      "display_order",
    ].join(", ")
  );

  const callById = new Map(calls.map((call) => [call.id, call]));
  const detectionsByCall = new Map();
  for (const detection of detections.map(normalizeDetection)) {
    const list = detectionsByCall.get(detection.call_id) || [];
    list.push(detection);
    detectionsByCall.set(detection.call_id, list);
  }
  const scorecardItemsByScorecard = new Map();
  for (const item of sourceScorecardItems) {
    const list = scorecardItemsByScorecard.get(item.scorecard_id) || [];
    list.push(item);
    scorecardItemsByScorecard.set(item.scorecard_id, list);
  }

  const templateCache = new Map();
  const results = [];
  let writtenScorecards = 0;
  let writtenItems = 0;
  let classifiedMissing = 0;
  let writtenDetections = 0;
  let reconstructedFromItems = 0;
  let claudeAvailable = null;

  for (let index = 0; index < sourceScorecards.length; index += 1) {
    const sourceScorecard = sourceScorecards[index];
    const call = callById.get(sourceScorecard.call_id);
    const filename = call ? filenameFromCall(call) : sourceScorecard.call_id;
    process.stdout.write(`\rScoring ${index + 1}/${sourceScorecards.length}: ${filename.slice(0, 70).padEnd(70)}`);

    if (!call) {
      results.push({
        filename,
        oldScore: sourceScorecard.overall_score,
        skipped: true,
        reason: "call not found",
      });
      continue;
    }

    let callDetections = detectionsByCall.get(call.id) || [];
    const productType = call.product_type || DEFAULT_PRODUCT_TYPE;
    const { template, templateItems } = await loadTemplateForProduct(supabase, templateCache, productType);

    if (callDetections.length === 0) {
      const sourceItems = scorecardItemsByScorecard.get(sourceScorecard.id) || [];
      if (sourceItems.length > 0) {
        callDetections = buildDetectionsFromScorecardItems(call.id, sourceItems, templateItems);
        if (callDetections.length > 0) reconstructedFromItems += 1;
      }
    }

    if (callDetections.length === 0 && classifyMissing) {
      const diarized = prepareDiarizedTranscript(call);
      if (diarized.length === 0) {
        results.push({
          filename,
          oldScore: sourceScorecard.overall_score,
          skipped: true,
          reason: "no transcript",
        });
        continue;
      }

      if (claudeAvailable == null) {
        process.stdout.write("\nChecking Claude classifier connectivity...\n");
        claudeAvailable = await checkClaudeAvailable();
      }

      if (!claudeAvailable) {
        results.push({
          filename,
          oldScore: sourceScorecard.overall_score,
          skipped: true,
          reason: "classification unavailable",
        });
        continue;
      }

      process.stdout.write(`\rClassifying ${index + 1}/${sourceScorecards.length}: ${filename.slice(0, 66).padEnd(66)}`);
      let llmSuccessCount = 0;
      let llmFailed = false;
      const guardedCallLLM = async (system, user) => {
        if (llmFailed) {
          throw new Error("Skipping remaining transcript segments after classifier failure.");
        }
        try {
          const response = await callClaude(system, user);
          llmSuccessCount += 1;
          return response;
        } catch (error) {
          llmFailed = true;
          throw error;
        }
      };

      const originalConsoleError = console.error;
      let classificationResult;
      try {
        console.error = (...messages) => {
          if (String(messages[0] || "").startsWith("Classification error for segment")) return;
          originalConsoleError(...messages);
        };
        classificationResult = await classifyCall({
          diarized,
          callContext: {
            call_type: call.call_type,
            product_type: call.product_type,
            call_direction: call.call_direction,
          },
          callLLM: guardedCallLLM,
        });
      } finally {
        console.error = originalConsoleError;
      }

      if (llmSuccessCount === 0) {
        results.push({
          filename,
          oldScore: sourceScorecard.overall_score,
          skipped: true,
          reason: "classification unavailable",
        });
        continue;
      }

      const intentIdByCode = buildIntentIdByCode(templateItems);
      if (dryRun) {
        callDetections = classificationResult.detections.map((detection) =>
          normalizeDetection({
            ...detection,
            call_id: call.id,
            intent_id: intentIdByCode.get(detection.intent_code) || null,
          })
        );
      } else {
        const detectionRows = buildDetectionRows(call.id, classificationResult.detections, intentIdByCode);
        const { data: insertedDetections, error } = await supabase
          .from("intent_detections")
          .insert(detectionRows)
          .select();
        if (error) throw new Error(`intent_detections insert failed: ${error.message}`);
        callDetections = (insertedDetections || []).map(normalizeDetection);
        writtenDetections += insertedDetections?.length || 0;
      }

      classifiedMissing += 1;
    }

    if (callDetections.length === 0) {
      results.push({
        filename,
        oldScore: sourceScorecard.overall_score,
        skipped: true,
        reason: "no detections",
      });
      continue;
    }

    const direction = Array.isArray(call.transcript_diarized) && call.transcript_diarized.length > 0
      ? detectCallDirection(call.transcript_diarized)
      : call.call_direction || "inbound";
    const scoringItems = buildScoringTemplateItems(templateItems, callDetections, direction);
    const detectionsForScoring = addDirectionExcludedDetections(callDetections, scoringItems, direction);

    const scoreResult = scoreCall({
      detections: detectionsForScoring,
      templateItems: scoringItems,
      template,
    });
    const avgConfidence = calculateAverageConfidence(scoreResult.scorecard_items);

    if (!dryRun) {
      const scorecardRow = buildScorecardRow({
        call,
        sourceScorecard,
        template,
        scoreResult,
        avgConfidence,
        runId,
      });
      const { data: insertedScorecard, error } = await supabase
        .from("compliance_scorecards")
        .insert(scorecardRow)
        .select("id")
        .single();
      if (error) throw new Error(`compliance_scorecards insert failed: ${error.message}`);

      const itemRows = buildScorecardItemRows(insertedScorecard.id, scoreResult);
      await insertInBatches(supabase, "scorecard_items", itemRows, 500);
      writtenScorecards += 1;
      writtenItems += itemRows.length;
    }

    results.push({
      filename,
      oldScore: sourceScorecard.overall_score,
      newScore: scoreResult.overall_score,
      grade: scoreResult.overall_grade,
      passFail: scoreResult.pass_fail,
      sourceScorecardId: sourceScorecard.id,
    });
  }

  process.stdout.write("\n");
  printSummaryTable(results);

  const scored = results.filter((result) => !result.skipped);
  const skipped = results.length - scored.length;
  const averageScore = scored.length > 0
    ? scored.reduce((sum, result) => sum + Number(result.newScore || 0), 0) / scored.length
    : 0;

  console.log("");
  console.log(`Source calls: ${sourceScorecards.length}`);
  console.log(`Re-scored: ${scored.length}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Reconstructed from scorecard items: ${reconstructedFromItems}`);
  console.log(`Classified missing detections: ${classifiedMissing}`);
  console.log(`Average new score: ${formatPercent(averageScore)}`);
  console.log(dryRun
    ? "Dry run only: no scorecards or scorecard items were written."
    : `Inserted ${writtenScorecards} scorecard(s), ${writtenItems} scorecard item(s), and ${writtenDetections} detection row(s).`);
}

main().catch((error) => {
  console.error("");
  console.error(error);
  process.exitCode = 1;
});
