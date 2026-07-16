const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const projectRoot = __dirname;
const calculatorSource = fs.readFileSync(path.join(projectRoot, "calculator.js"), "utf8");
const indexSource = fs.readFileSync(path.join(projectRoot, "index.html"), "utf8");

function functionBody(name) {
  const marker = `function ${name}(`;
  const start = calculatorSource.indexOf(marker);
  assert.notEqual(start, -1, `Missing ${name}`);

  const bodyStart = calculatorSource.indexOf("{", start);
  let depth = 0;
  for (let index = bodyStart; index < calculatorSource.length; index += 1) {
    if (calculatorSource[index] === "{") depth += 1;
    if (calculatorSource[index] === "}") depth -= 1;
    if (depth === 0) return calculatorSource.slice(bodyStart + 1, index);
  }

  throw new Error(`Unclosed function body for ${name}`);
}

test("the initial render cannot emit started, completed, or bucket-viewed events", () => {
  const renderBody = functionBody("render");
  const resultBody = functionBody("renderResult");

  assert.doesNotMatch(renderBody, /TRACKED_EVENTS\.(started|completed)/);
  assert.doesNotMatch(resultBody, /trackEvent|TRACKED_EVENTS\.bucketViewed/);
  assert.match(renderBody, /trackResultBucket\(result\)/);
});

test("intentional interaction gates calculator lifecycle events", () => {
  const inputBody = functionBody("handleInputChange");
  const completionBody = functionBody("markCalculatorCompleted");

  assert.match(inputBody, /markCalculatorStarted\("input_change"\)/);
  assert.match(inputBody, /recordTouchedStep\(event\.target\)/);
  assert.match(inputBody, /touchedSteps\.size === stepGroups\.length/);
  assert.match(completionBody, /if \(!latestResult \|\| hasCompleted\) return/);
  assert.match(completionBody, /completion_trigger/);
});

test("the ROI page mirrors the main-site GA4 cross-domain linker", () => {
  assert.match(indexSource, /linkerDomains: \["why57\.com", "roi\.why57\.com"\]/);
  assert.match(indexSource, /gtag\("set", "linker"/);
  assert.match(indexSource, /accept_incoming: true/);
});

test("the existing report gate owns identified lead intake without changing the production default", () => {
  const requestBody = functionBody("requestReportCapture");

  assert.match(indexSource, /leadCaptureEndpoint: "https:\/\/why57-roi-intake\.gera-695\.workers\.dev\/"/);
  assert.match(indexSource, /enabled: why57LocalLeadIntake/);
  assert.match(indexSource, /endpoint: why57LocalLeadIntake \? "http:\/\/127\.0\.0\.1:8787\/v1\/leads" : ""/);
  assert.doesNotMatch(indexSource, /data-roi-lead-form|result-lead-capture\.js/);
  assert.match(requestBody, /if \(!IDENTIFIED_LEAD_INTAKE_ENABLED\)/);
  assert.match(requestBody, /requestLeadCapture\(TRACKED_EVENTS\.reportRequested, context, detail\)/);
  assert.match(requestBody, /event_type: "lead_submission"/);
  assert.match(requestBody, /source: "roi_calculator_result"/);
});

test("report retries reuse one submission id and report the actual safety mode", () => {
  const submitBody = functionBody("handleReportSubmit");
  const successBody = functionBody("showReportSuccess");

  assert.match(calculatorSource, /const reportSubmissionId = createId\(\)/);
  assert.match(submitBody, /request_id: reportSubmissionId/);
  assert.doesNotMatch(submitBody, /const requestId = createId\(\)/);
  assert.match(successBody, /deliveryMode === "test"/);
  assert.match(successBody, /A real test email may be sent only to the approved test inbox/);
  assert.match(successBody, /deliveryMode === "dry-run"/);
  assert.match(successBody, /No email, Slack alert, or spreadsheet row was sent/);
});
