const BUILD_BASE_RANGES = {
  workflow_automation: [18000, 45000],
  internal_ops_tool: [30000, 70000],
  custom_crm: [45000, 110000],
  customer_portal: [40000, 95000],
  reporting_dashboard: [20000, 55000]
};

const GROWTH_MULTIPLIERS = {
  flat: [1.0, 1.05, 1.1],
  moderate: [1.0, 1.15, 1.3],
  fast: [1.0, 1.25, 1.55]
};

const COMPLEXITY_MULTIPLIERS = {
  workflowFit: { standard: 0, somewhat_unique: 0.1, very_unique: 0.2 },
  integrationNeeds: { simple: 0, moderate: 0.15, complex: 0.3 },
  complianceNeeds: { none: 0, moderate: 0.1, strict: 0.25 }
};

const TRACKED_EVENTS = {
  started: "calculator_started",
  completed: "calculator_completed",
  bucketViewed: "result_bucket_viewed",
  assumptionsOpened: "assumptions_opened",
  ctaClicked: "cta_clicked",
  bookingClicked: "calendar_booking_clicked",
  resultShared: "roi_result_shared",
  reportRequested: "roi_report_requested"
};

const STORAGE_KEYS = {
  sessionId: "why57_roi_session_id_v1",
  attribution: "why57_roi_attribution_v1",
  context: "why57_roi_context_v1"
};

const ROI_INTEGRATIONS = window.ROI_INTEGRATIONS || {};
const CROSS_SUBDOMAIN_COOKIE_NAME = ROI_INTEGRATIONS.crossSubdomainCookieName || "why57_roi_context";
const CROSS_SUBDOMAIN_COOKIE_DOMAIN = ROI_INTEGRATIONS.crossSubdomainCookieDomain || "why57.com";
const ATTRIBUTION_COOKIE_NAME = ROI_INTEGRATIONS.attributionCookieName || "why57_first_touch";
const LEAD_CAPTURE_ENDPOINT = ROI_INTEGRATIONS.leadCaptureEndpoint || "";
const IDENTIFIED_LEAD_INTAKE = ROI_INTEGRATIONS.identifiedLeadIntake || {};
const IDENTIFIED_LEAD_INTAKE_ENABLED =
  IDENTIFIED_LEAD_INTAKE.enabled === true && Boolean(IDENTIFIED_LEAD_INTAKE.endpoint);
const BOOKING_URL = "https://calendar.app.google/93NLV73sQd1DXuUB6";
const SHARE_URL = "https://roi.why57.com/";
const ATTRIBUTION_MAX_AGE_SECONDS = 60 * 60 * 24 * 730;

const DEFAULT_INPUT = {
  projectType: "workflow_automation",
  monthlySaaSSpend: 1800,
  monthlyAutomationSpend: 250,
  toolCount: 6,
  userCount: 8,
  manualHoursPerWeek: 12,
  hourlyTeamCost: 45,
  growth12Months: "moderate",
  workflowFit: "somewhat_unique",
  integrationNeeds: "moderate",
  complianceNeeds: "none",
  urgency: "this_quarter"
};

const form = document.querySelector("#roi-form");
const assumptions = document.querySelector("#assumptions");
const ctaLink = document.querySelector("#cta-link");
const mobileResultCta = document.querySelector(".mobile-result-cta");
const resultsPanel = document.querySelector("#results");
const numericInputs = Array.from(document.querySelectorAll("input[data-number]"));
const stepGroups = Array.from(document.querySelectorAll(".input-group"));
const prevButton = document.querySelector("#step-prev");
const nextButton = document.querySelector("#step-next");
const stepCurrent = document.querySelector("#mobile-step-current");
const stepTitle = document.querySelector("#mobile-step-title");
const stepProgress = document.querySelector("#stepper-progress");
const shareButton = document.querySelector("#share-result");
const shareSummary = document.querySelector("#share-summary");
const shareStatus = document.querySelector("#share-status");
const reportCapture = document.querySelector("#report-capture");
const reportForm = document.querySelector("#report-form");
const reportNameField = document.querySelector("#report-name-field");
const reportName = document.querySelector("#report-name");
const reportNameError = document.querySelector("#report-name-error");
const reportEmail = document.querySelector("#report-email");
const reportConsent = document.querySelector("#report-consent");
const reportSubmit = document.querySelector("#report-submit");
const reportStatus = document.querySelector("#report-form-status");
const reportSuccess = document.querySelector("#report-success");

let currentStep = 0;
let hasStarted = false;
let hasCompleted = false;
const touchedSteps = new Set();
let lastTrackedBucket = "";
let latestContext = null;
let latestResult = null;
let reportFormStartedAt = Date.now();
const reportSubmissionId = createId();

function createId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }

  return `roi_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function getSessionId() {
  const existing = sessionStorage.getItem(STORAGE_KEYS.sessionId);
  if (existing) return existing;

  const created = createId();
  sessionStorage.setItem(STORAGE_KEYS.sessionId, created);
  return created;
}

function cleanParamValue(value) {
  if (value == null) return undefined;
  const normalized = String(value).trim();
  return normalized === "" ? undefined : normalized;
}

function readCookie(name) {
  const prefix = `${name}=`;
  const match = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));

  return match ? match.slice(prefix.length) : null;
}

function parseJson(value) {
  if (!value) return null;

  try {
    return JSON.parse(value);
  } catch (_error) {
    return null;
  }
}

function readJsonCookie(name) {
  const encoded = readCookie(name);
  if (!encoded) return null;

  try {
    return parseJson(decodeURIComponent(encoded));
  } catch (_error) {
    return null;
  }
}

function writeSharedCookie(name, value, maxAgeSeconds) {
  const serialized = encodeURIComponent(JSON.stringify(value));
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  const domain = window.location.hostname.endsWith("why57.com")
    ? `; Domain=${CROSS_SUBDOMAIN_COOKIE_DOMAIN}`
    : "";

  document.cookie = `${name}=${serialized}${domain}; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Lax${secure}`;
}

function isWhy57Url(value) {
  if (!value) return false;

  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname === "why57.com" || hostname.endsWith(".why57.com");
  } catch (_error) {
    return false;
  }
}

function hostnameFor(value) {
  if (!value) return undefined;
  try {
    return new URL(value).hostname.toLowerCase();
  } catch (_error) {
    return undefined;
  }
}

function pickCampaignParams(searchParams) {
  return {
    utm_source: cleanParamValue(searchParams.get("utm_source")),
    utm_medium: cleanParamValue(searchParams.get("utm_medium")),
    utm_campaign: cleanParamValue(searchParams.get("utm_campaign")),
    utm_content: cleanParamValue(searchParams.get("utm_content")),
    utm_term: cleanParamValue(searchParams.get("utm_term")),
    gclid: cleanParamValue(searchParams.get("gclid")),
    gbraid: cleanParamValue(searchParams.get("gbraid")),
    wbraid: cleanParamValue(searchParams.get("wbraid")),
    msclkid: cleanParamValue(searchParams.get("msclkid"))
  };
}

function withoutInternalCampaign(campaign, internalReferral) {
  if (!internalReferral) return campaign;

  const source = campaign.utm_source?.toLowerCase();
  const internalSources = new Set(["57", "why57", "why57.com", "roi.why57.com", "internal", "website"]);
  if (!source || !internalSources.has(source)) return campaign;

  return {
    gclid: campaign.gclid,
    gbraid: campaign.gbraid,
    wbraid: campaign.wbraid,
    msclkid: campaign.msclkid
  };
}

function sharedAttributionContext() {
  const shared = readJsonCookie(ATTRIBUTION_COOKIE_NAME);
  if (!shared || !shared.landing_page || !(shared.first_seen_at || shared.captured_at)) return null;

  return compactObject({
    ...shared,
    first_seen_at: shared.first_seen_at || shared.captured_at,
    referrer: shared.referrer,
    source: shared.source,
    medium: shared.medium
  });
}

function persistAttributionContext(attribution) {
  const referrerHost = hostnameFor(attribution.referrer);
  const shared = compactObject({
    version: 2,
    captured_at: attribution.first_seen_at,
    landing_page: attribution.landing_page,
    referrer_host: referrerHost,
    source: attribution.source || attribution.utm_source || referrerHost || "(direct)",
    medium: attribution.medium || attribution.utm_medium || (referrerHost ? "referral" : "(none)"),
    utm_source: attribution.utm_source,
    utm_medium: attribution.utm_medium,
    utm_campaign: attribution.utm_campaign,
    utm_content: attribution.utm_content,
    utm_term: attribution.utm_term,
    gclid: attribution.gclid,
    gbraid: attribution.gbraid,
    wbraid: attribution.wbraid,
    msclkid: attribution.msclkid
  });

  sessionStorage.setItem(STORAGE_KEYS.attribution, JSON.stringify(attribution));
  writeSharedCookie(ATTRIBUTION_COOKIE_NAME, shared, ATTRIBUTION_MAX_AGE_SECONDS);
}

function getAttributionContext() {
  const cached = sessionStorage.getItem(STORAGE_KEYS.attribution);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch (_error) {
      sessionStorage.removeItem(STORAGE_KEYS.attribution);
    }
  }

  const searchParams = new URLSearchParams(window.location.search);
  const shared = sharedAttributionContext();
  const referrer = cleanParamValue(document.referrer);
  const internalReferral = isWhy57Url(referrer);
  const campaign = withoutInternalCampaign(pickCampaignParams(searchParams), internalReferral);
  const externalReferrerHost = internalReferral ? undefined : hostnameFor(referrer);
  const paidSearchSource = campaign.gclid || campaign.gbraid || campaign.wbraid
    ? "google"
    : campaign.msclkid
      ? "bing"
      : undefined;
  const attribution = compactObject({
    ...shared,
    version: 2,
    session_id: getSessionId(),
    landing_page: shared?.landing_page || window.location.href,
    calculator_landing_page: window.location.href,
    page_path: window.location.pathname,
    page_title: document.title,
    referrer: shared?.referrer || (internalReferral ? undefined : referrer),
    internal_referrer: internalReferral ? referrer : undefined,
    first_seen_at: shared?.first_seen_at || new Date().toISOString(),
    source: shared?.source || campaign.utm_source || paidSearchSource || externalReferrerHost || "(direct)",
    medium: shared?.medium || campaign.utm_medium || (paidSearchSource ? "cpc" : externalReferrerHost ? "referral" : "(none)"),
    ...(shared ? {} : campaign)
  });

  persistAttributionContext(attribution);
  return attribution;
}

function compactObject(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined && entry !== ""));
}

function buildLeadContext(input, result) {
  const attribution = getAttributionContext();
  return compactObject({
    version: 2,
    session_id: attribution.session_id,
    captured_at: new Date().toISOString(),
    landing_page: attribution.landing_page,
    calculator_landing_page: attribution.calculator_landing_page,
    page_path: attribution.page_path,
    referrer: attribution.referrer,
    internal_referrer: attribution.internal_referrer,
    first_seen_at: attribution.first_seen_at,
    first_touch_source: attribution.source,
    first_touch_medium: attribution.medium,
    first_touch_campaign: attribution.utm_campaign,
    utm_source: attribution.utm_source,
    utm_medium: attribution.utm_medium,
    utm_campaign: attribution.utm_campaign,
    utm_content: attribution.utm_content,
    utm_term: attribution.utm_term,
    gclid: attribution.gclid,
    gbraid: attribution.gbraid,
    wbraid: attribution.wbraid,
    msclkid: attribution.msclkid,
    project_type: input.projectType,
    growth_12_months: input.growth12Months,
    workflow_fit: input.workflowFit,
    integration_needs: input.integrationNeeds,
    compliance_needs: input.complianceNeeds,
    urgency: input.urgency,
    monthly_saas_spend: input.monthlySaaSSpend,
    monthly_automation_spend: input.monthlyAutomationSpend,
    manual_hours_per_week: input.manualHoursPerWeek,
    hourly_team_cost: input.hourlyTeamCost,
    tool_count: input.toolCount,
    user_count: input.userCount,
    recommendation: result.recommendation,
    readiness_score: result.readinessScore,
    break_even_months: result.breakEvenMonths ?? undefined,
    annual_total_current_cost: Math.round(result.annualTotalCurrentCost),
    build_estimate_mid: Math.round(result.buildEstimateMid),
    three_year_saas_cost: Math.round(result.threeYearSaaSCost),
    three_year_custom_cost: Math.round(result.threeYearCustomCost)
  });
}

function persistLeadContext(context) {
  sessionStorage.setItem(STORAGE_KEYS.context, JSON.stringify(context));
  window.__why57RoiContext = context;
  writeSharedCookie(CROSS_SUBDOMAIN_COOKIE_NAME, context, 60 * 60 * 24 * 7);
}

function eventDefaults() {
  const attribution = getAttributionContext();
  return compactObject({
    page_path: attribution.page_path,
    page_title: attribution.page_title,
    session_id: attribution.session_id,
    utm_source: attribution.utm_source,
    utm_medium: attribution.utm_medium,
    utm_campaign: attribution.utm_campaign
  });
}

function currency(value, options = {}) {
  const maximumFractionDigits = options.maximumFractionDigits ?? 0;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits
  }).format(value);
}

function clampScore(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function trackEvent(name, detail = {}) {
  const payload = compactObject({ event: name, ...eventDefaults(), ...detail });
  const eventPayload = { ...payload };
  delete eventPayload.event;
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push(payload);

  if (typeof window.gtag === "function") {
    window.gtag("event", name, eventPayload);
  }

  if (typeof window.plausible === "function") {
    window.plausible(name, { props: eventPayload });
  }

  document.dispatchEvent(new CustomEvent("roi-calculator:event", { detail: payload }));
}

function resultEventDetail(result, detail = {}) {
  if (!result) return detail;

  return compactObject({
    recommendation: result.recommendation,
    readiness_score: result.readinessScore,
    break_even_months: result.breakEvenMonths ?? undefined,
    project_type: latestContext?.project_type,
    ...detail
  });
}

function markCalculatorStarted(interaction) {
  if (hasStarted) return;

  hasStarted = true;
  trackEvent(TRACKED_EVENTS.started, {
    interaction,
    project_type: latestContext?.project_type || collectInput().projectType
  });
}

function trackResultBucket(result) {
  if (!hasCompleted || !result || lastTrackedBucket === result.recommendation) return;

  lastTrackedBucket = result.recommendation;
  trackEvent(TRACKED_EVENTS.bucketViewed, {
    bucket: result.recommendation,
    readiness_score: result.readinessScore
  });
}

function markCalculatorCompleted(completionTrigger) {
  if (!latestResult || hasCompleted) return;

  markCalculatorStarted(completionTrigger);
  hasCompleted = true;
  trackEvent(TRACKED_EVENTS.completed, resultEventDetail(latestResult, {
    completion_trigger: completionTrigger,
    steps_touched: touchedSteps.size
  }));
  trackResultBucket(latestResult);
}

function recordTouchedStep(target) {
  const step = target?.closest?.(".input-group[data-step]");
  if (step?.dataset.step !== undefined) touchedSteps.add(step.dataset.step);
}

function sendLeadCapture(eventType, detail = {}) {
  if (!LEAD_CAPTURE_ENDPOINT || !latestContext) return;

  const payload = {
    event_type: eventType,
    sent_at: new Date().toISOString(),
    context: latestContext,
    detail: compactObject(detail)
  };

  const body = JSON.stringify(payload);

  try {
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon(LEAD_CAPTURE_ENDPOINT, blob);
      return;
    }
  } catch (_error) {
    // Fall back to fetch when sendBeacon is unavailable or blocked.
  }

  fetch(LEAD_CAPTURE_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body,
    keepalive: true,
    mode: "cors",
    credentials: "omit"
  }).catch(() => {
    // Best-effort delivery only. The booking flow should never fail because analytics or lead capture is down.
  });
}

function publicResultContext(context) {
  if (!context) return {};

  return compactObject({
    version: 2,
    session_id: context.session_id,
    captured_at: context.captured_at,
    landing_page: context.landing_page,
    calculator_landing_page: context.calculator_landing_page,
    referrer: context.referrer,
    first_seen_at: context.first_seen_at,
    first_touch_source: context.first_touch_source,
    first_touch_medium: context.first_touch_medium,
    first_touch_campaign: context.first_touch_campaign,
    utm_source: context.utm_source,
    utm_medium: context.utm_medium,
    utm_campaign: context.utm_campaign,
    gclid: context.gclid,
    gbraid: context.gbraid,
    wbraid: context.wbraid,
    msclkid: context.msclkid,
    project_type: context.project_type,
    recommendation: context.recommendation,
    readiness_score: context.readiness_score,
    break_even_months: context.break_even_months,
    annual_total_current_cost: context.annual_total_current_cost,
    build_estimate_mid: context.build_estimate_mid,
    three_year_saas_cost: context.three_year_saas_cost,
    three_year_custom_cost: context.three_year_custom_cost
  });
}

async function requestLeadCapture(eventType, context, detail = {}) {
  if (!LEAD_CAPTURE_ENDPOINT) {
    throw new Error("missing_endpoint");
  }

  const response = await fetch(LEAD_CAPTURE_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      event_type: eventType,
      sent_at: new Date().toISOString(),
      context,
      detail: compactObject(detail)
    }),
    mode: "cors",
    credentials: "omit"
  });

  if (!response.ok) {
    throw new Error(`capture_failed_${response.status}`);
  }

  return response;
}

async function requestReportCapture(context, detail) {
  if (!IDENTIFIED_LEAD_INTAKE_ENABLED) {
    await requestLeadCapture(TRACKED_EVENTS.reportRequested, context, detail);
    return {};
  }

  const response = await fetch(IDENTIFIED_LEAD_INTAKE.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      event_type: "lead_submission",
      submission_id: detail.request_id,
      sent_at: new Date().toISOString(),
      source: "roi_calculator_result",
      contact: {
        name: detail.name,
        email: detail.email
      },
      interest: "custom software ROI result",
      message: detail.result_summary,
      website: detail.website,
      page_url: window.location.href,
      referrer: document.referrer || undefined,
      consent: detail.consent,
      consent_version: detail.consent_version,
      context: {
        ...context,
        site_source: "roi_calculator"
      }
    }),
    mode: "cors",
    credentials: "omit"
  });

  let result = {};
  try {
    result = await response.json();
  } catch (_error) {
    // A successful intake response must still be valid JSON so the UI can report the actual delivery mode.
  }

  if (!response.ok || result.ok !== true) {
    throw new Error(`capture_failed_${response.status}`);
  }

  return result;
}

function firstBuildPlan(recommendation) {
  const plans = {
    stay: {
      title: "Optimize the current stack before building",
      steps: [
        "Audit overlapping tools and remove one avoidable subscription or handoff.",
        "Document the single workaround that costs the team the most time each week.",
        "Set a spend, workload, or growth threshold for running the build decision again."
      ]
    },
    hybrid: {
      title: "Build around the highest-friction workflow",
      steps: [
        "Keep the commodity systems that already work as systems of record.",
        "Map the handoffs, duplicate entry, and reporting gap that create the most drag.",
        "Prototype one focused bridge or workflow layer before considering replacement."
      ]
    },
    custom: {
      title: "Start with the smallest valuable custom core",
      steps: [
        "Define the one end-to-end workflow where ownership creates the clearest advantage.",
        "Ship a focused first version for the smallest real user group and measure time saved.",
        "Add integrations and edge cases in phases after the core workflow proves its ROI."
      ]
    }
  };

  return plans[recommendation] || plans.hybrid;
}

function shareableResult(result) {
  const breakEven = result.breakEvenMonths ? `${result.breakEvenMonths} months` : "longer than 36 months";
  return `${result.headline}. Readiness: ${result.readinessScore}/100. Directional break-even: ${breakEven}. Three-year paths: ${currency(result.threeYearSaaSCost)} for SaaS + workarounds vs. ${currency(result.threeYearCustomCost)} for custom + maintenance.`;
}

function shareableResultText(result) {
  return `My 57 custom software ROI result\n\n${shareableResult(result)}\n\nThis summary excludes the worksheet inputs. Run the calculator: ${SHARE_URL}`;
}

async function copyText(value) {
  if (navigator.clipboard?.writeText) {
    try {
      await Promise.race([
        navigator.clipboard.writeText(value),
        new Promise((_, reject) => window.setTimeout(() => reject(new Error("clipboard_timeout")), 1_500))
      ]);
      return;
    } catch (_error) {
      // Fall through to the selection-based copy path when permission is unavailable or delayed.
    }
  }

  const fallback = document.createElement("textarea");
  fallback.value = value;
  fallback.setAttribute("readonly", "");
  fallback.style.position = "fixed";
  fallback.style.opacity = "0";
  document.body.appendChild(fallback);
  fallback.select();
  const copied = document.execCommand("copy");
  fallback.remove();

  if (!copied) throw new Error("copy_failed");
}

function getFormValue(name) {
  const field = form.elements[name];
  if (!field) return DEFAULT_INPUT[name];

  if (field instanceof RadioNodeList) {
    return field.value || DEFAULT_INPUT[name];
  }

  return field.value || DEFAULT_INPUT[name];
}

function getNumericValue(name) {
  const raw = Number(getFormValue(name));
  return Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_INPUT[name];
}

function collectInput() {
  return {
    projectType: getFormValue("projectType"),
    monthlySaaSSpend: getNumericValue("monthlySaaSSpend"),
    monthlyAutomationSpend: getNumericValue("monthlyAutomationSpend"),
    toolCount: getNumericValue("toolCount"),
    userCount: getNumericValue("userCount"),
    manualHoursPerWeek: getNumericValue("manualHoursPerWeek"),
    hourlyTeamCost: getNumericValue("hourlyTeamCost"),
    growth12Months: getFormValue("growth12Months"),
    workflowFit: getFormValue("workflowFit"),
    integrationNeeds: getFormValue("integrationNeeds"),
    complianceNeeds: getFormValue("complianceNeeds"),
    urgency: getFormValue("urgency")
  };
}

function annualSpendScore(annualSoftwareCost) {
  if (annualSoftwareCost < 12000) return 0;
  if (annualSoftwareCost < 24000) return 8;
  if (annualSoftwareCost < 48000) return 15;
  return 20;
}

function manualBurdenScore(hours) {
  if (hours < 5) return 0;
  if (hours <= 10) return 8;
  if (hours <= 20) return 15;
  return 20;
}

function toolSprawlScore(toolCount) {
  if (toolCount < 4) return 0;
  if (toolCount <= 6) return 4;
  return 7;
}

function growthScore(growth) {
  return { flat: 0, moderate: 5, fast: 10 }[growth] ?? 0;
}

function urgencyPenalty(urgency) {
  return { immediate: -10, this_quarter: -4, strategic_investment: 0 }[urgency] ?? 0;
}

function recommendationForScore(score) {
  if (score < 35) return "stay";
  if (score < 65) return "hybrid";
  return "custom";
}

function recommendationContent(recommendation, result) {
  const breakEvenText = result.breakEvenMonths ? `${result.breakEvenMonths} months` : "longer than 36 months";

  const content = {
    stay: {
      kicker: "Recommendation",
      headline: "Stay with SaaS for now",
      narrative:
        "You probably do not need custom software yet. The pain looks real, but it does not look expensive enough or strategic enough to justify a full build right now. That is not a loss. It usually means your smarter move is to tighten the current stack, simplify the workflow, and revisit this later.",
      cta:
        "If you want a second opinion, book a call and I can help you figure out whether to optimize the current stack first or map out what a future custom path would look like."
    },
    hybrid: {
      kicker: "Recommendation",
      headline: "Hybrid is probably the smartest move",
      narrative:
        "You are spending enough money and losing enough time that this deserves a real look. That does not automatically mean replacing everything. In a lot of businesses, the best answer is to keep the commodity tools and build around the part of the workflow that actually creates friction or advantage.",
      cta:
        "A call is useful here because the biggest win is usually deciding what not to build as much as what to build."
    },
    custom: {
      kicker: "Recommendation",
      headline: "You likely have a strong case for custom software",
      narrative:
        `At this point, you are probably paying the software tax anyway. Between subscriptions, manual admin, and process mismatch, custom software starts looking less like a luxury and more like a cleaner operating model. Based on these inputs, the break-even window is around ${breakEvenText}.`,
      cta:
        "This is the point where a focused call can turn a rough calculator result into an actual phased build plan and real ROI target."
    }
  };

  return content[recommendation];
}

function topReasons(input, factorScores, recommendation) {
  const candidates = [
    {
      key: "annualSoftwareSpend",
      value: factorScores.annualSoftwareSpend,
      positive:
        "Your current software spend is high enough that replacement math is worth taking seriously.",
      caution:
        "Your current software spend is still low enough that full replacement math is harder to justify."
    },
    {
      key: "manualBurden",
      value: factorScores.manualBurden,
      positive:
        "Your team is losing enough time to workarounds that the inefficiency cost is no longer small.",
      caution:
        "The manual burden is still relatively contained, which reduces the pressure to build right now."
    },
    {
      key: "workflowUniqueness",
      value: factorScores.workflowUniqueness,
      positive:
        "The workflow is not generic, which makes a one-size-fits-all tool more likely to keep getting in the way.",
      caution:
        "The workflow sounds fairly standard, which makes off-the-shelf software more defensible."
    },
    {
      key: "integrationNeeds",
      value: factorScores.integrationNeeds,
      positive:
        "Integration and data flow matter here, and that is usually where generic stacks start getting brittle.",
      caution:
        "The integration requirements are simple enough that custom software may be overkill for now."
    },
    {
      key: "compliance",
      value: factorScores.compliance,
      positive:
        "Compliance and security requirements increase the value of owning how the system works.",
      caution:
        "There are no major compliance constraints pushing you toward a custom build."
    },
    {
      key: "toolSprawl",
      value: factorScores.toolSprawl,
      positive:
        "You already have enough tools in the workflow that operational sprawl is part of the problem.",
      caution:
        "Tool sprawl does not look severe yet, which lowers the urgency for a custom replacement."
    },
    {
      key: "growth",
      value: factorScores.growth,
      positive:
        "Growth pressure means today’s tolerable inefficiency can get expensive fast.",
      caution:
        "Growth pressure looks modest right now, so there is less penalty for keeping the current stack a bit longer."
    },
    {
      key: "urgencyPenalty",
      value: Math.abs(factorScores.urgencyPenalty),
      positive:
        "Your timeline is not forcing a rushed build, which makes a proper custom approach more realistic.",
      caution:
        "Urgency is working against a custom build here. If you need something immediately, buying first is often smarter."
    }
  ];

  if (recommendation === "custom") {
    return candidates
      .filter((item) => item.key !== "urgencyPenalty" || input.urgency === "strategic_investment")
      .sort((a, b) => b.value - a.value)
      .slice(0, 3)
      .map((item) => item.positive);
  }

  if (recommendation === "hybrid") {
    const positives = candidates
      .filter((item) => item.value > 0 && item.key !== "urgencyPenalty")
      .sort((a, b) => b.value - a.value)
      .slice(0, 2)
      .map((item) => item.positive);

    const balancingReason =
      input.urgency === "immediate"
        ? "Speed still matters here, which is part of why a phased hybrid approach usually beats an all-at-once replacement."
        : "You have enough friction to justify building around the weak spots, but not necessarily enough to replace every tool you already pay for.";

    return [...positives, balancingReason].slice(0, 3);
  }

  const cautionRank = candidates
    .sort((a, b) => a.value - b.value)
    .slice(0, 2)
    .map((item) => item.caution);

  const urgencyReason =
    input.urgency === "immediate"
      ? "The timeline is also working against a full custom build. If something needs to move now, off-the-shelf is usually the practical short-term answer."
      : "Nothing in these inputs says you need to force a custom build before the business case is stronger.";

  return [...cautionRank, urgencyReason];
}

function calculateResult(input) {
  const annualSoftwareCost = (input.monthlySaaSSpend + input.monthlyAutomationSpend) * 12;
  const annualManualCost = input.manualHoursPerWeek * input.hourlyTeamCost * 52;
  const annualTotalCurrentCost = annualSoftwareCost + annualManualCost;

  const threeYearSaaSCost = GROWTH_MULTIPLIERS[input.growth12Months].reduce(
    (sum, multiplier) => sum + annualTotalCurrentCost * multiplier,
    0
  );

  const baseRange = BUILD_BASE_RANGES[input.projectType];
  const complexityMultiplier =
    COMPLEXITY_MULTIPLIERS.workflowFit[input.workflowFit] +
    COMPLEXITY_MULTIPLIERS.integrationNeeds[input.integrationNeeds] +
    COMPLEXITY_MULTIPLIERS.complianceNeeds[input.complianceNeeds];

  const buildEstimateLow = baseRange[0] * (1 + complexityMultiplier);
  const buildEstimateHigh = baseRange[1] * (1 + complexityMultiplier);
  const buildEstimateMid = (buildEstimateLow + buildEstimateHigh) / 2;
  const annualMaintenance = Math.max(buildEstimateMid * 0.12, 3600);
  const threeYearCustomCost = buildEstimateMid + annualMaintenance * 3;

  const netAnnualSavings = annualTotalCurrentCost - annualMaintenance;
  let breakEvenMonths = null;

  if (netAnnualSavings > 0) {
    const months = Math.round((buildEstimateMid / netAnnualSavings) * 12);
    if (months <= 36) {
      breakEvenMonths = months;
    }
  }

  const factorScores = {
    annualSoftwareSpend: annualSpendScore(annualSoftwareCost),
    manualBurden: manualBurdenScore(input.manualHoursPerWeek),
    workflowUniqueness: { standard: 0, somewhat_unique: 10, very_unique: 18 }[input.workflowFit],
    integrationNeeds: { simple: 0, moderate: 8, complex: 15 }[input.integrationNeeds],
    compliance: { none: 0, moderate: 5, strict: 10 }[input.complianceNeeds],
    toolSprawl: toolSprawlScore(input.toolCount),
    growth: growthScore(input.growth12Months),
    urgencyPenalty: Math.abs(urgencyPenalty(input.urgency))
  };

  const rawScore =
    factorScores.annualSoftwareSpend +
    factorScores.manualBurden +
    factorScores.workflowUniqueness +
    factorScores.integrationNeeds +
    factorScores.compliance +
    factorScores.toolSprawl +
    factorScores.growth +
    urgencyPenalty(input.urgency);

  const readinessScore = clampScore(rawScore);
  const recommendation = recommendationForScore(readinessScore);
  const recommendationText = recommendationContent(recommendation, { breakEvenMonths });

  return {
    annualSoftwareCost,
    annualManualCost,
    annualTotalCurrentCost,
    threeYearSaaSCost,
    buildEstimateLow,
    buildEstimateHigh,
    buildEstimateMid,
    annualMaintenance,
    threeYearCustomCost,
    breakEvenMonths,
    recommendation,
    readinessScore,
    topReasons: topReasons(input, factorScores, recommendation),
    narrative: recommendationText.narrative,
    kicker: recommendationText.kicker,
    headline: recommendationText.headline,
    cta: recommendationText.cta
  };
}

function updateStepUI() {
  const isMobile = window.matchMedia("(max-width: 900px)").matches;
  stepGroups.forEach((group, index) => {
    group.classList.toggle("is-active", !isMobile || index === currentStep);
  });

  if (!isMobile) return;

  stepCurrent.textContent = String(currentStep + 1);
  stepTitle.textContent = stepGroups[currentStep].querySelector("legend").textContent;
  stepProgress.style.width = `${((currentStep + 1) / stepGroups.length) * 100}%`;
  prevButton.disabled = currentStep === 0;
  nextButton.textContent = currentStep === stepGroups.length - 1 ? "See result" : "Next";
}

function renderResult(result) {
  const resultState = document.querySelector("#result-state");
  document.querySelector("#result-kicker").textContent = result.kicker;
  document.querySelector("#result-headline").textContent = result.headline;
  document.querySelector("#result-narrative").textContent = result.narrative;
  document.querySelector("#readiness-score").textContent = String(result.readinessScore);
  document.querySelector("#break-even").textContent = result.breakEvenMonths
    ? `${result.breakEvenMonths} months`
    : "Longer than 36 months";
  document.querySelector("#annual-total").textContent = currency(result.annualTotalCurrentCost);
  document.querySelector("#three-year-saas").textContent = currency(result.threeYearSaaSCost);
  document.querySelector("#build-range").textContent = `${currency(result.buildEstimateLow)} - ${currency(
    result.buildEstimateHigh
  )}`;
  document.querySelector("#three-year-custom").textContent = currency(result.threeYearCustomCost);
  document.querySelector("#chart-saas-label").textContent = currency(result.threeYearSaaSCost);
  document.querySelector("#chart-custom-label").textContent = currency(result.threeYearCustomCost);
  document.querySelector("#cta-copy").textContent = result.cta;
  shareSummary.textContent = shareableResult(result);

  const list = document.querySelector("#top-reasons");
  list.innerHTML = "";
  result.topReasons.forEach((reason) => {
    const item = document.createElement("li");
    item.textContent = reason;
    list.appendChild(item);
  });

  const maxBarValue = Math.max(result.threeYearSaaSCost, result.threeYearCustomCost, 1);
  document.querySelector("#chart-saas-bar").style.width = `${(result.threeYearSaaSCost / maxBarValue) * 100}%`;
  document.querySelector("#chart-custom-bar").style.width = `${(result.threeYearCustomCost / maxBarValue) * 100}%`;

  resultState.dataset.tone = result.recommendation;

}

function clearFieldError(field, errorElement) {
  field.removeAttribute("aria-invalid");
  errorElement.textContent = "";
}

function setFieldError(field, errorElement, message) {
  field.setAttribute("aria-invalid", "true");
  errorElement.textContent = message;
}

function validateReportForm() {
  const nameError = reportNameError;
  const emailError = document.querySelector("#report-email-error");
  const consentError = document.querySelector("#report-consent-error");
  let valid = true;

  clearFieldError(reportName, nameError);
  clearFieldError(reportEmail, emailError);
  clearFieldError(reportConsent, consentError);

  if (IDENTIFIED_LEAD_INTAKE_ENABLED && !reportName.value.trim()) {
    setFieldError(reportName, nameError, "Enter your name so the test lead can be identified.");
    valid = false;
  }

  if (!reportEmail.value.trim()) {
    setFieldError(reportEmail, emailError, "Enter the email address where you want the result sent.");
    valid = false;
  } else if (!reportEmail.validity.valid) {
    setFieldError(reportEmail, emailError, "Enter a valid email address, such as name@company.com.");
    valid = false;
  }

  if (!reportConsent.checked) {
    setFieldError(reportConsent, consentError, "Confirm your email consent to request the report.");
    valid = false;
  }

  if (!valid) {
    const firstInvalid = reportForm.querySelector('[aria-invalid="true"]');
    firstInvalid?.focus();
  }

  return valid;
}

function setReportLoading(loading) {
  reportSubmit.disabled = loading;
  reportSubmit.setAttribute("aria-busy", String(loading));
  reportSubmit.textContent = loading ? "Sending request…" : "Email me my result and plan";
}

function showReportSuccess(deliveryMode) {
  const successMessage = reportSuccess.querySelector("p");
  if (successMessage && deliveryMode === "test") {
    successMessage.textContent =
      "Test request accepted. A real test email may be sent only to the approved test inbox.";
  } else if (successMessage && deliveryMode === "dry-run") {
    successMessage.textContent = "Dry run accepted. No email, Slack alert, or spreadsheet row was sent.";
  }
  reportForm.hidden = true;
  reportSuccess.hidden = false;
  reportSuccess.focus();
}

async function handleShareResult() {
  if (!latestResult) return;

  markCalculatorCompleted("result_share");

  shareStatus.textContent = "";
  const text = shareableResultText(latestResult);
  const analytics = {
    recommendation: latestResult.recommendation,
    readiness_score: latestResult.readinessScore
  };

  try {
    if (navigator.share) {
      await navigator.share({
        title: "My 57 custom software ROI result",
        text: `${shareableResult(latestResult)}\n\nThis summary excludes the worksheet inputs.`,
        url: SHARE_URL
      });
      shareStatus.textContent = "Result shared.";
      trackEvent(TRACKED_EVENTS.resultShared, { ...analytics, share_method: "native" });
      return;
    }

    await copyText(text);
    shareStatus.textContent = "Clean summary copied. Your worksheet inputs were not included.";
    trackEvent(TRACKED_EVENTS.resultShared, { ...analytics, share_method: "clipboard" });
  } catch (error) {
    if (error?.name === "AbortError") return;
    shareStatus.textContent = "We couldn’t copy the summary. Select the result text above and copy it manually.";
  }
}

async function handleReportSubmit(event) {
  event.preventDefault();
  reportStatus.textContent = "";

  const honeypot = reportForm.elements.companyWebsite.value.trim();
  if (honeypot) {
    showReportSuccess();
    return;
  }

  if (!validateReportForm() || !latestContext || !latestResult) return;

  setReportLoading(true);
  const formElapsedMs = Math.max(0, Date.now() - reportFormStartedAt);

  try {
    const result = await requestReportCapture(publicResultContext(latestContext), {
      request_id: reportSubmissionId,
      name: IDENTIFIED_LEAD_INTAKE_ENABLED ? reportName.value.trim() : "",
      email: reportEmail.value.trim(),
      consent: true,
      consent_version: "roi-report-v1-2026-07-15",
      website: honeypot,
      form_elapsed_ms: formElapsedMs,
      result_summary: shareableResult(latestResult),
      recommended_plan: firstBuildPlan(latestResult.recommendation)
    });

    markCalculatorCompleted("report_submit");
    trackEvent(TRACKED_EVENTS.reportRequested, {
      recommendation: latestResult.recommendation,
      readiness_score: latestResult.readinessScore,
      break_even_months: latestResult.breakEvenMonths ?? undefined,
      project_type: latestContext.project_type
    });
    showReportSuccess(result.delivery_mode);
  } catch (_error) {
    reportStatus.textContent =
      "We couldn’t send the request. Your result is still here—please try again in a moment.";
  } finally {
    setReportLoading(false);
  }
}

function applyDefaultsOnBlur(event) {
  const input = event.target;
  if (!(input instanceof HTMLInputElement) || !input.matches("[data-number]")) return;

  if (input.value === "" || Number(input.value) < 0 || Number.isNaN(Number(input.value))) {
    input.value = String(DEFAULT_INPUT[input.name]);
  }

  render();
}

function render() {
  const input = collectInput();
  const result = calculateResult(input);
  latestResult = result;
  latestContext = buildLeadContext(input, result);
  persistLeadContext(latestContext);
  renderResult(result);
  trackResultBucket(result);
}

function handleInputChange(event) {
  markCalculatorStarted("input_change");
  recordTouchedStep(event.target);
  render();

  if (touchedSteps.size === stepGroups.length) {
    markCalculatorCompleted("all_steps_changed");
  }
}

function setCurrentStep(nextStep) {
  currentStep = Math.max(0, Math.min(stepGroups.length - 1, nextStep));
  updateStepUI();
}

function initMobileResultVisibility() {
  if (!("IntersectionObserver" in window)) return;

  const observer = new IntersectionObserver(
    ([entry]) => {
      mobileResultCta.hidden = entry.isIntersecting;
    },
    { threshold: 0.01 }
  );

  observer.observe(resultsPanel);
}

function initEvents() {
  if (IDENTIFIED_LEAD_INTAKE_ENABLED) {
    reportNameField.hidden = false;
    reportNameError.hidden = false;
    reportName.required = true;
  }

  form.addEventListener("input", handleInputChange);
  form.addEventListener("change", handleInputChange);
  numericInputs.forEach((input) => input.addEventListener("blur", applyDefaultsOnBlur));

  assumptions.addEventListener("toggle", () => {
    if (assumptions.open) {
      markCalculatorCompleted("assumptions_opened");
      trackEvent(TRACKED_EVENTS.assumptionsOpened);
    }
  });

  ctaLink.addEventListener("click", () => {
    markCalculatorCompleted("results_booking_click");
    trackEvent(TRACKED_EVENTS.ctaClicked, { cta_location: "results_panel" });
    trackEvent(TRACKED_EVENTS.bookingClicked, { cta_location: "results_panel" });
    sendLeadCapture(TRACKED_EVENTS.bookingClicked, { cta_location: "results_panel", conversion_stage: "micro" });
  });

  document.querySelectorAll(`a[href="${BOOKING_URL}"]`).forEach((link) => {
    if (link === ctaLink) return;
    link.addEventListener("click", () => {
      trackEvent(TRACKED_EVENTS.ctaClicked, { cta_location: "page" });
      trackEvent(TRACKED_EVENTS.bookingClicked, { cta_location: "page" });
      sendLeadCapture(TRACKED_EVENTS.bookingClicked, { cta_location: "page", conversion_stage: "micro" });
    });
  });

  shareButton.addEventListener("click", handleShareResult);
  reportForm.addEventListener("submit", handleReportSubmit);
  reportName.addEventListener("input", () => {
    clearFieldError(reportName, reportNameError);
    reportStatus.textContent = "";
  });
  reportEmail.addEventListener("input", () => {
    clearFieldError(reportEmail, document.querySelector("#report-email-error"));
    reportStatus.textContent = "";
  });
  reportConsent.addEventListener("change", () => {
    clearFieldError(reportConsent, document.querySelector("#report-consent-error"));
    reportStatus.textContent = "";
  });
  reportCapture.addEventListener("toggle", () => {
    if (reportCapture.open) {
      reportFormStartedAt = Date.now();
      markCalculatorCompleted("report_form_opened");
    }
  });

  mobileResultCta.addEventListener("click", () => {
    markCalculatorCompleted("mobile_result_cta");
    window.location.hash = "results";
  });

  prevButton.addEventListener("click", () => {
    markCalculatorStarted("step_navigation");
    setCurrentStep(currentStep - 1);
  });
  nextButton.addEventListener("click", () => {
    markCalculatorStarted("step_navigation");
    if (currentStep === stepGroups.length - 1) {
      markCalculatorCompleted("see_result");
      document.querySelector("#results").scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    setCurrentStep(currentStep + 1);
  });

  window.addEventListener("resize", updateStepUI);
}

function init() {
  Object.entries(DEFAULT_INPUT).forEach(([key, value]) => {
    const field = form.elements[key];
    if (!field) return;

    if (field instanceof RadioNodeList) {
      const option = Array.from(field).find((item) => item.value === value);
      if (option) option.checked = true;
      return;
    }

    field.value = value;
  });

  updateStepUI();
  initEvents();
  initMobileResultVisibility();
  render();

  if (window.location.hash === "#calculator" || window.location.hash === "#results") {
    document.querySelector(window.location.hash)?.scrollIntoView({ block: "start" });
  }
}

init();
