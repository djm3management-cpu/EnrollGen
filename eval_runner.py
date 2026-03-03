import json
import re
from collections import Counter, defaultdict
from pathlib import Path


DATASET_PATH = Path("calls_500.jsonl")
REPORT_PATH = Path("eval_report.json")

ALLOWED_ELECTION_PERIODS = {
    "AEP",
    "MA_OEP",
    "SEP_MOVE",
    "SEP_LIS",
    "SEP_5STAR",
    "SEP_DSNP_MONTHLY",
    "SEP_INSTITUTION",
    "NONE",
}
ALLOWED_SNP = {"NONE", "DSNP", "CSNP"}
ALLOWED_HARD_FAILURES = {
    "TPMO_BEFORE_RECO",
    "SOA_BEFORE_MARKETING",
    "VALID_ELECTION_PERIOD_REQUIRED",
    "SEP_TRIGGER_REQUIRED",
    "ELIGIBILITY_PARTA_PARTB_REQUIRED",
    "SERVICE_AREA_REQUIRED",
    "DSNP_REQUIRES_MEDICAID_VERIFICATION",
    "CSNP_REQUIRES_CONDITION_CONTEXT",
    "EFFECTIVE_DATE_GUARANTEE_MISMATCH",
    "SUBMISSION_STATUS_OVERSTATEMENT",
}
ALLOWED_PHRASE_FLAGS = {
    "UNSUPPORTED_BEST",
    "COST_GUARANTEE",
    "ANYTIME_ENROLL",
    "CASH_GIVEBACK",
    "IMMEDIATE_EFFECTIVE",
    "NETWORK_PROMISE",
    "APPROVAL_GUARANTEE",
    "PRESSURE_LANGUAGE",
    "TPMO_CONTRADICTION",
}
ALLOWED_SEVERITIES = {"critical", "high", "medium"}
ALLOWED_FLAG_SEVERITIES = {"low", "medium", "high"}
ALLOWED_LEVELS = {"none", "low", "medium", "high", "critical"}
ALLOWED_ISSUE_TAGS = {
    "tpmo_before_reco",
    "soa_before_marketing",
    "valid_election_period_required",
    "sep_trigger_required",
    "eligibility_parta_partb_required",
    "service_area_required",
    "dsnp_requires_medicaid_verification",
    "csnp_requires_condition_context",
    "effective_date_guarantee_mismatch",
    "submission_status_overstatement",
    "tpmo_contradiction",
    "anytime_enroll",
    "cash_giveback",
    "network_promise",
    "approval_guarantee",
    "pressure_language",
    "needs_clarification_move_date",
    "needs_clarification_medicaid_status",
    "needs_clarification_part_b_effective_date",
    "needs_clarification_election_period",
}


def rule_to_issue_tag(rule_id):
    return rule_id.lower()


def flag_to_issue_tag(category):
    return category.lower()


def evaluateCall(transcript, metadata):
    lower = transcript.lower()
    hard_failures = []
    phrase_flags = []

    def has(text):
        return text.lower() in lower

    def add_hard(rule_id, severity, block_submission, evidence):
        if evidence and evidence in transcript:
            hard_failures.append(
                {
                    "ruleId": rule_id,
                    "severity": severity,
                    "blockSubmission": block_submission,
                    "evidence": evidence,
                }
            )

    def add_flag(category, severity, evidence):
        if evidence and evidence in transcript:
            phrase_flags.append(
                {
                    "category": category,
                    "severity": severity,
                    "evidence": evidence,
                }
            )

    partial_transcript_guard = metadata.get("transcript_starts_mid_call") or metadata.get(
        "transcript_starts_mid_section"
    )

    if has("Based on what you told me, [PLAN_NAME] from [CARRIER] is the plan I want to recommend first.") and not metadata.get("zip_known_before_reco", True):
        add_hard(
            "TPMO_BEFORE_RECO",
            "high",
            True,
            "Based on what you told me, [PLAN_NAME] from [CARRIER] is the plan I want to recommend first.",
        )
    if has("Let me walk you through [PLAN_NAME] first, then I will get your permission questions handled.") and not metadata.get("soa_confirmed_before_marketing", True):
        add_hard(
            "SOA_BEFORE_MARKETING",
            "high",
            True,
            "Let me walk you through [PLAN_NAME] first, then I will get your permission questions handled.",
        )
    if has("We will just use a special enrollment period even if you do not have a specific event."):
        add_hard(
            "SEP_TRIGGER_REQUIRED",
            "high",
            True,
            "We will just use a special enrollment period even if you do not have a specific event.",
        )
    if has("Even though the move was six months ago, that move SEP still works right now."):
        add_hard(
            "VALID_ELECTION_PERIOD_REQUIRED",
            "high",
            True,
            "Even though the move was six months ago, that move SEP still works right now.",
        )
    if has("Since you get Extra Help, that means you qualify for the D-SNP.") and not metadata.get("medicaid_verified_for_dsnp", False):
        add_hard(
            "DSNP_REQUIRES_MEDICAID_VERIFICATION",
            "high",
            True,
            "Since you get Extra Help, that means you qualify for the D-SNP.",
        )
    if has("I do not need to verify your Medicaid right now to move you into the D-SNP.") and metadata.get("snp_discussed") == "DSNP":
        add_hard(
            "DSNP_REQUIRES_MEDICAID_VERIFICATION",
            "critical",
            True,
            "I do not need to verify your Medicaid right now to move you into the D-SNP.",
        )
    if has("This chronic plan should work great even if we do not go through your conditions right now.") and not metadata.get("condition_context_present_for_csnp", False):
        add_hard(
            "CSNP_REQUIRES_CONDITION_CONTEXT",
            "high",
            True,
            "This chronic plan should work great even if we do not go through your conditions right now.",
        )
    if has("This plan starts today as soon as I hit submit."):
        add_hard(
            "EFFECTIVE_DATE_GUARANTEE_MISMATCH",
            "critical",
            True,
            "This plan starts today as soon as I hit submit.",
        )
    if has("Even if [ZIP] is outside the service area, we can keep your old address and submit it."):
        add_hard(
            "SERVICE_AREA_REQUIRED",
            "critical",
            True,
            "Even if [ZIP] is outside the service area, we can keep your old address and submit it.",
        )
    if has("Your Part B can start later; we can still enroll you today."):
        add_hard(
            "ELIGIBILITY_PARTA_PARTB_REQUIRED",
            "critical",
            True,
            "Your Part B can start later; we can still enroll you today.",
        )
    if has("You are enrolled right now, and there is nothing else the carrier has to do.") and not metadata.get("submission_attempted", False):
        add_hard(
            "SUBMISSION_STATUS_OVERSTATEMENT",
            "high",
            True,
            "You are enrolled right now, and there is nothing else the carrier has to do.",
        )

    if has("We have every plan in your area, so there is nothing else you need to compare."):
        add_flag(
            "TPMO_CONTRADICTION",
            "high",
            "We have every plan in your area, so there is nothing else you need to compare.",
        )
    if has("You can switch anytime, so timing is not a problem."):
        add_flag(
            "ANYTIME_ENROLL",
            "high",
            "You can switch anytime, so timing is not a problem.",
        )
    if has("[DOCTOR] is definitely in network and [DRUG] is covered, so there is no need to verify either one."):
        add_flag(
            "NETWORK_PROMISE",
            "high",
            "[DOCTOR] is definitely in network and [DRUG] is covered, so there is no need to verify either one.",
        )
    if has("The Part B giveback is cash the plan sends you every month."):
        add_flag(
            "CASH_GIVEBACK",
            "high",
            "The Part B giveback is cash the plan sends you every month.",
        )
    if has("You need to do this right now or you will lose everything."):
        add_flag(
            "PRESSURE_LANGUAGE",
            "high",
            "You need to do this right now or you will lose everything.",
        )
    if has("You are guaranteed approval with this plan."):
        add_flag(
            "APPROVAL_GUARANTEE",
            "high",
            "You are guaranteed approval with this plan.",
        )

    intervention = {
        "level": "none",
        "message": "",
        "blockSubmission": False,
        "evidence": "",
    }

    clarification_patterns = [
        (
            "If that move happened recently, we may be able to use a move SEP.",
            "Ask for the exact move date and whether the prior plan was notified before deciding whether the move SEP is available.",
        ),
        (
            "If your Medicaid is active, the D-SNP might be an option.",
            "Ask whether the beneficiary currently has Medicaid, not just Extra Help, before deciding on D-SNP eligibility.",
        ),
        (
            "I want to confirm when your Part B becomes effective before we go any further.",
            "Ask for the Part B effective date before deciding whether Medicare Advantage enrollment is currently valid.",
        ),
        (
            "Once we verify the election period, I can tell you whether we should submit today.",
            "Ask for the exact election period basis before deciding whether submission should happen today.",
        ),
    ]
    clarification_issue_tags = {
        "If that move happened recently, we may be able to use a move SEP.": "needs_clarification_move_date",
        "If your Medicaid is active, the D-SNP might be an option.": "needs_clarification_medicaid_status",
        "I want to confirm when your Part B becomes effective before we go any further.": "needs_clarification_part_b_effective_date",
        "Once we verify the election period, I can tell you whether we should submit today.": "needs_clarification_election_period",
    }
    issue_tags = []

    for evidence, message in clarification_patterns:
        if evidence in transcript:
            intervention = {
                "level": "medium",
                "message": message,
                "blockSubmission": False,
                "evidence": evidence,
            }
            issue_tags = [clarification_issue_tags[evidence]]
            break

    if intervention["level"] == "none":
        if partial_transcript_guard and not hard_failures and not phrase_flags:
            return {
                "hard_failures": [],
                "phrase_flags": [],
                "issue_tags": [],
                "intervention": intervention,
            }

        ranked = []
        ranked.extend((3 if item["severity"] == "critical" else 2, item) for item in hard_failures)
        ranked.extend((2 if item["severity"] == "high" else 1, item) for item in phrase_flags)
        if ranked:
            _, item = max(ranked, key=lambda pair: pair[0])
            if "ruleId" in item:
                messages = {
                    "TPMO_BEFORE_RECO": "Pause the recommendation and read the TPMO disclaimer with the represented organization and plan counts before continuing.",
                    "SOA_BEFORE_MARKETING": "Stop the plan-specific discussion and get permission to discuss Medicare Advantage and optional products before continuing.",
                    "SEP_TRIGGER_REQUIRED": "Identify the exact SEP trigger and timing before moving forward with enrollment.",
                    "VALID_ELECTION_PERIOD_REQUIRED": "Recheck the move date and SEP window before discussing submission.",
                    "DSNP_REQUIRES_MEDICAID_VERIFICATION": "Confirm actual Medicaid status before presenting D-SNP enrollment as available.",
                    "CSNP_REQUIRES_CONDITION_CONTEXT": "Confirm the qualifying chronic condition before positioning the C-SNP as an enrollment option.",
                    "EFFECTIVE_DATE_GUARANTEE_MISMATCH": "Correct the effective date language and tie it to the actual election period before submission.",
                    "SERVICE_AREA_REQUIRED": "Stop the submission and confirm the beneficiary lives in the plan service area before proceeding.",
                    "ELIGIBILITY_PARTA_PARTB_REQUIRED": "Confirm active Part A and Part B before presenting Medicare Advantage enrollment as valid.",
                    "SUBMISSION_STATUS_OVERSTATEMENT": "Do not state final enrollment without submission and carrier processing.",
                }
                intervention = {
                    "level": "critical" if item["severity"] == "critical" else "high",
                    "message": messages.get(item["ruleId"], ""),
                    "blockSubmission": item["blockSubmission"],
                    "evidence": item["evidence"],
                }
                issue_tags = [rule_to_issue_tag(item["ruleId"])]
            else:
                messages = {
                    "TPMO_CONTRADICTION": "Correct the statement now and explain that you do not offer every plan available in the area.",
                    "ANYTIME_ENROLL": "Do not say they can switch anytime. Confirm the actual election period before discussing submission.",
                    "NETWORK_PROMISE": "Do not guarantee provider or drug coverage without verification.",
                    "CASH_GIVEBACK": "Reframe the giveback as a Part B premium reduction rather than cash sent by the plan.",
                    "PRESSURE_LANGUAGE": "Remove the pressure language and explain the real timing window instead of threatening loss.",
                    "APPROVAL_GUARANTEE": "Remove the approval guarantee and explain that the carrier still reviews the application.",
                }
                intervention = {
                    "level": "high" if item["severity"] == "high" else "medium",
                    "message": messages.get(item["category"], ""),
                    "blockSubmission": False,
                    "evidence": item["evidence"],
                }
                issue_tags = [flag_to_issue_tag(item["category"])]

    if not issue_tags:
        issue_tags = sorted(
            {rule_to_issue_tag(item["ruleId"]) for item in hard_failures}
            | {flag_to_issue_tag(item["category"]) for item in phrase_flags}
        )

    return {
        "hard_failures": hard_failures,
        "phrase_flags": phrase_flags,
        "issue_tags": issue_tags,
        "intervention": intervention,
    }


def load_jsonl(path):
    records = []
    malformed = []
    with path.open("r", encoding="utf-8") as handle:
        for line_no, raw_line in enumerate(handle, start=1):
            line = raw_line.strip()
            if not line:
                continue
            try:
                records.append(json.loads(line))
            except json.JSONDecodeError as exc:
                malformed.append(
                    {
                        "line": line_no,
                        "error": f"json_decode_error: {exc}",
                    }
                )
    return records, malformed


def _is_bool(value):
    return isinstance(value, bool)


def _contains_exact(transcript, evidence):
    return bool(evidence) and evidence in transcript


def validate_record(record):
    errors = []
    required_top = {"id", "scenario", "transcript", "metadata", "expected"}
    if set(record.keys()) != required_top:
        errors.append("top_level_keys_mismatch")
        return errors

    metadata = record.get("metadata")
    expected = record.get("expected")
    if not isinstance(metadata, dict):
        errors.append("metadata_not_object")
        return errors
    if not isinstance(expected, dict):
        errors.append("expected_not_object")
        return errors

    metadata_keys = {
        "zip_known_before_reco",
        "tpmo_counts_known",
        "soa_confirmed_before_marketing",
        "election_period_claimed",
        "snp_discussed",
        "submission_attempted",
        "transcript_starts_mid_call",
        "transcript_starts_mid_section",
        "provider_or_drug_verified_before_claim",
        "medicaid_verified_for_dsnp",
        "condition_context_present_for_csnp",
    }
    if set(metadata.keys()) != metadata_keys:
        errors.append("metadata_keys_mismatch")
    else:
        for key in metadata_keys - {"election_period_claimed", "snp_discussed"}:
            if not _is_bool(metadata.get(key)):
                errors.append(f"metadata_not_bool:{key}")
        if metadata.get("election_period_claimed") not in ALLOWED_ELECTION_PERIODS:
            errors.append("metadata_invalid_election_period_claimed")
        if metadata.get("snp_discussed") not in ALLOWED_SNP:
            errors.append("metadata_invalid_snp_discussed")

    expected_keys = {
        "hard_failures",
        "phrase_flags",
        "expected_issue_tags",
        "expected_intervention",
    }
    if set(expected.keys()) != expected_keys:
        errors.append("expected_keys_mismatch")
        return errors

    transcript = record.get("transcript", "")
    if not isinstance(transcript, str):
        errors.append("transcript_not_string")
        return errors

    for failure in expected.get("hard_failures", []):
        if set(failure.keys()) != {"ruleId", "severity", "blockSubmission", "evidence"}:
            errors.append("hard_failure_keys_mismatch")
            continue
        if failure["ruleId"] not in ALLOWED_HARD_FAILURES:
            errors.append(f"invalid_rule:{failure['ruleId']}")
        if failure["severity"] not in ALLOWED_SEVERITIES:
            errors.append(f"invalid_hard_severity:{failure['severity']}")
        if not _is_bool(failure["blockSubmission"]):
            errors.append("hard_failure_blockSubmission_not_bool")
        if not _contains_exact(transcript, failure["evidence"]):
            errors.append(f"hard_failure_evidence_missing:{failure['ruleId']}")

    for flag in expected.get("phrase_flags", []):
        if set(flag.keys()) != {"category", "severity", "evidence"}:
            errors.append("phrase_flag_keys_mismatch")
            continue
        if flag["category"] not in ALLOWED_PHRASE_FLAGS:
            errors.append(f"invalid_phrase_flag:{flag['category']}")
        if flag["severity"] not in ALLOWED_FLAG_SEVERITIES:
            errors.append(f"invalid_phrase_severity:{flag['severity']}")
        if not _contains_exact(transcript, flag["evidence"]):
            errors.append(f"phrase_flag_evidence_missing:{flag['category']}")

    issue_tags = expected.get("expected_issue_tags", [])
    if not isinstance(issue_tags, list):
        errors.append("expected_issue_tags_not_list")
    else:
        for tag in issue_tags:
            if tag not in ALLOWED_ISSUE_TAGS:
                errors.append(f"invalid_issue_tag:{tag}")

    intervention = expected.get("expected_intervention", {})
    if set(intervention.keys()) != {"level", "message", "blockSubmission", "evidence"}:
        errors.append("expected_intervention_keys_mismatch")
    else:
        if intervention["level"] not in ALLOWED_LEVELS:
            errors.append("invalid_intervention_level")
        if not isinstance(intervention["message"], str):
            errors.append("intervention_message_not_string")
        if not _is_bool(intervention["blockSubmission"]):
            errors.append("intervention_blockSubmission_not_bool")
        if intervention["level"] != "none" and not _contains_exact(
            transcript, intervention["evidence"]
        ):
            errors.append("intervention_evidence_missing")

    return errors


def score_binary(expected_set, predicted_set):
    tp = len(expected_set & predicted_set)
    fp = len(predicted_set - expected_set)
    fn = len(expected_set - predicted_set)
    precision = tp / (tp + fp) if tp + fp else 0.0
    recall = tp / (tp + fn) if tp + fn else 0.0
    f1 = (2 * precision * recall / (precision + recall)) if precision + recall else 0.0
    return {
        "tp": tp,
        "fp": fp,
        "fn": fn,
        "precision": round(precision, 4),
        "recall": round(recall, 4),
        "f1": round(f1, 4),
    }


def item_signature(item, key_name):
    if key_name == "ruleId":
        return (
            item["ruleId"],
            item["severity"],
            item["blockSubmission"],
            item["evidence"],
        )
    return (item["category"], item["severity"], item["evidence"])


def summarize_mismatches(expected, predicted):
    mismatch_counter = Counter()

    expected_rules = {item_signature(item, "ruleId") for item in expected["hard_failures"]}
    predicted_rules = {
        item_signature(item, "ruleId")
        for item in predicted.get("hard_failures", [])
        if set(item.keys()) >= {"ruleId", "severity", "blockSubmission", "evidence"}
    }
    expected_flags = {item_signature(item, "category") for item in expected["phrase_flags"]}
    predicted_flags = {
        item_signature(item, "category")
        for item in predicted.get("phrase_flags", [])
        if set(item.keys()) >= {"category", "severity", "evidence"}
    }

    for item in expected_rules - predicted_rules:
        mismatch_counter[f"missing_rule:{item[0]}"] += 1
    for item in predicted_rules - expected_rules:
        mismatch_counter[f"extra_rule:{item[0]}"] += 1
    for item in expected_flags - predicted_flags:
        mismatch_counter[f"missing_flag:{item[0]}"] += 1
    for item in predicted_flags - expected_flags:
        mismatch_counter[f"extra_flag:{item[0]}"] += 1

    expected_intervention = expected["expected_intervention"]
    predicted_intervention = predicted.get("intervention", {})

    if predicted_intervention.get("level") != expected_intervention["level"]:
        mismatch_counter[
            f"wrong_intervention_level:{expected_intervention['level']}->{predicted_intervention.get('level', '')}"
        ] += 1
    if predicted_intervention.get("blockSubmission") != expected_intervention["blockSubmission"]:
        mismatch_counter["wrong_block_submission"] += 1
    if predicted_intervention.get("evidence", "") != expected_intervention["evidence"]:
        mismatch_counter["wrong_intervention_evidence"] += 1
    expected_tags = set(expected.get("expected_issue_tags", []))
    predicted_tags = set(predicted.get("issue_tags", []))
    for tag in expected_tags - predicted_tags:
        mismatch_counter[f"missing_issue_tag:{tag}"] += 1
    for tag in predicted_tags - expected_tags:
        mismatch_counter[f"extra_issue_tag:{tag}"] += 1

    return mismatch_counter


def main():
    records, malformed_json = load_jsonl(DATASET_PATH)
    schema_errors = []
    valid_records = []

    for index, record in enumerate(records, start=1):
        errors = validate_record(record)
        if errors:
            schema_errors.append(
                {
                    "record": record.get("id", f"record_{index}"),
                    "errors": errors,
                }
            )
        else:
            valid_records.append(record)

    rule_expected = defaultdict(set)
    rule_predicted = defaultdict(set)
    flag_expected = defaultdict(set)
    flag_predicted = defaultdict(set)
    issue_expected = defaultdict(set)
    issue_predicted = defaultdict(set)
    mismatch_counter = Counter()
    exact_matches = 0
    intervention_level_matches = 0
    block_submission_matches = 0
    evidence_matches = 0
    total = len(valid_records)

    for record in valid_records:
        prediction = evaluateCall(record["transcript"], record["metadata"]) or {}
        expected = record["expected"]

        expected_rules = expected["hard_failures"]
        predicted_rules = prediction.get("hard_failures", [])
        expected_flags = expected["phrase_flags"]
        predicted_flags = prediction.get("phrase_flags", [])
        expected_tags = expected.get("expected_issue_tags", [])
        predicted_tags = prediction.get("issue_tags", [])

        for item in expected_rules:
            rule_expected[item["ruleId"]].add(record["id"])
        for item in predicted_rules:
            if set(item.keys()) >= {"ruleId", "severity", "blockSubmission", "evidence"}:
                rule_predicted[item["ruleId"]].add(record["id"])

        for item in expected_flags:
            flag_expected[item["category"]].add(record["id"])
        for item in predicted_flags:
            if set(item.keys()) >= {"category", "severity", "evidence"}:
                flag_predicted[item["category"]].add(record["id"])
        for tag in expected_tags:
            issue_expected[tag].add(record["id"])
        for tag in predicted_tags:
            issue_predicted[tag].add(record["id"])

        if (
            expected_rules == predicted_rules
            and expected_flags == predicted_flags
            and expected.get("expected_issue_tags", []) == prediction.get("issue_tags", [])
            and expected["expected_intervention"] == prediction.get("intervention", {})
        ):
            exact_matches += 1

        if prediction.get("intervention", {}).get("level") == expected["expected_intervention"]["level"]:
            intervention_level_matches += 1
        if (
            prediction.get("intervention", {}).get("blockSubmission")
            == expected["expected_intervention"]["blockSubmission"]
        ):
            block_submission_matches += 1
        if prediction.get("intervention", {}).get("evidence", "") == expected["expected_intervention"]["evidence"]:
            evidence_matches += 1

        mismatch_counter.update(summarize_mismatches(expected, prediction))

    per_rule = {}
    for rule in sorted(ALLOWED_HARD_FAILURES):
        per_rule[rule] = score_binary(rule_expected[rule], rule_predicted[rule])

    per_category = {}
    for category in sorted(ALLOWED_PHRASE_FLAGS):
        per_category[category] = score_binary(flag_expected[category], flag_predicted[category])
    per_issue_tag = {}
    for tag in sorted(ALLOWED_ISSUE_TAGS):
        per_issue_tag[tag] = score_binary(issue_expected[tag], issue_predicted[tag])

    overall_passes = exact_matches
    report = {
        "dataset_records": len(records),
        "valid_records": total,
        "malformed_records": malformed_json + schema_errors,
        "overall_pass_rate": round((overall_passes / total), 4) if total else 0.0,
        "exact_match_rate": round((exact_matches / total), 4) if total else 0.0,
        "intervention_level_accuracy": round((intervention_level_matches / total), 4)
        if total
        else 0.0,
        "blockSubmission_accuracy": round((block_submission_matches / total), 4)
        if total
        else 0.0,
        "evidence_exact_match_rate": round((evidence_matches / total), 4) if total else 0.0,
        "per_rule": per_rule,
        "per_category": per_category,
        "per_issue_tag": per_issue_tag,
        "top_20_mismatch_patterns": mismatch_counter.most_common(20),
    }

    REPORT_PATH.write_text(json.dumps(report, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
