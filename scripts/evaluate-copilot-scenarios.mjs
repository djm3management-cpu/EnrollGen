import fs from "node:fs";
import path from "node:path";

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function collectScenarioFiles(inputPath) {
  const resolved = path.resolve(inputPath);
  const stat = fs.statSync(resolved);

  if (stat.isFile()) {
    return [resolved];
  }

  return fs
    .readdirSync(resolved)
    .filter((name) => name.endsWith(".json"))
    .map((name) => path.join(resolved, name));
}

function scoreScenario(scenario) {
  const messages = scenario.messages || [];
  const feedback = scenario.feedbackDataset || [];
  const taggedMessages = messages.filter((msg) => msg.issueTag);
  const duplicateTags = new Map();

  for (const msg of taggedMessages) {
    const key = `${msg.section || scenario.currentSection?.label || "unknown"}:${msg.issueTag}`;
    duplicateTags.set(key, (duplicateTags.get(key) || 0) + 1);
  }

  const duplicateIssueCount = [...duplicateTags.values()].filter((count) => count > 1)
    .length;
  const feedbackCounts = feedback.reduce((acc, entry) => {
    const verdict = entry.feedback?.verdict;
    if (verdict) acc[verdict] = (acc[verdict] || 0) + 1;
    return acc;
  }, {});

  return {
    transcriptChars: (scenario.transcript || "").length,
    messageCount: messages.length,
    issueTaggedCount: taggedMessages.length,
    duplicateIssueBuckets: duplicateIssueCount,
    feedbackCounts,
  };
}

function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error("Usage: node scripts/evaluate-copilot-scenarios.mjs <file-or-directory>");
    process.exit(1);
  }

  const files = collectScenarioFiles(inputPath);
  const results = files.map((file) => {
    const scenario = readJson(file);
    return {
      file: path.basename(file),
      ...scoreScenario(scenario),
    };
  });

  const totals = results.reduce(
    (acc, result) => {
      acc.scenarios += 1;
      acc.messages += result.messageCount;
      acc.issueTagged += result.issueTaggedCount;
      acc.duplicateBuckets += result.duplicateIssueBuckets;
      for (const [verdict, count] of Object.entries(result.feedbackCounts)) {
        acc.feedbackCounts[verdict] = (acc.feedbackCounts[verdict] || 0) + count;
      }
      return acc;
    },
    { scenarios: 0, messages: 0, issueTagged: 0, duplicateBuckets: 0, feedbackCounts: {} }
  );

  console.log(JSON.stringify({ totals, scenarios: results }, null, 2));
}

main();
