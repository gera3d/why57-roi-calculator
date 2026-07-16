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

test("unsupported proof claims are replaced with process proof", () => {
  assert.doesNotMatch(indexSource, />15\+</);
  assert.doesNotMatch(indexSource, />50\+</);
  assert.doesNotMatch(indexSource, />10x</);
  assert.doesNotMatch(indexSource, /Years of experience|Clients served|Average ROI/);
  assert.match(indexSource, /You control the scenario/);
  assert.match(indexSource, /Assumptions stay visible/);
  assert.match(indexSource, /Directional, not a guarantee/);
});

test("ROI report delivery uses one request ID and a one-time conversion receipt", () => {
  const submitBody = functionBody("handleReportSubmit");

  assert.match(submitBody, /if \(!reportRequestId\) reportRequestId = createId\(\)/);
  assert.match(submitBody, /delivery\.stored !== true \|\| delivery\.forwarded !== true/);
  assert.match(submitBody, /claimConversionReceipt\(delivery\.receipt\)/);
  assert.match(submitBody, /receipt\.claimed === true/);
  assert.match(calculatorSource, /async function requestLeadCapture[\s\S]+await response\.json\(\)/);
  assert.match(calculatorSource, /async function claimConversionReceipt[\s\S]+CONVERSION_RECEIPT_ENDPOINT/);
});

test("ROI rate-limit copy names the one-hour wait and keeps the form contract", () => {
  const submitBody = functionBody("handleReportSubmit");
  assert.match(submitBody, /wait up to one hour/);
  assert.match(indexSource, /id="report-email"[^>]+required/);
  assert.match(indexSource, /id="report-consent"[^>]+required/);
  assert.match(indexSource, /name="companyWebsite"/);
});
