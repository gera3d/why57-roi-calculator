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
  ctaClicked: "cta_clicked"
};

const STORAGE_KEYS = {
  sessionId: "why57_roi_session_id_v1",
  attribution: "why57_roi_attribution_v1",
  context: "why57_roi_context_v1"
};

const ROI_INTEGRATIONS = window.ROI_INTEGRATIONS || {};
const CROSS_SUBDOMAIN_COOKIE_NAME = ROI_INTEGRATIONS.crossSubdomainCookieName || "why57_roi_context";
const CROSS_SUBDOMAIN_COOKIE_DOMAIN = ROI_INTEGRATIONS.crossSubdomainCookieDomain || "why57.com";

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
const projectTypeInputs = Array.from(document.querySelectorAll('input[name="projectType"]'));
const numericInputs = Array.from(document.querySelectorAll("input[data-number]"));
const stepGroups = Array.from(document.querySelectorAll(".input-group"));
const prevButton = document.querySelector("#step-prev");
const nextButton = document.querySelector("#step-next");
const stepCurrent = document.querySelector("#mobile-step-current");
const stepTitle = document.querySelector("#mobile-step-title");
const stepProgress = document.querySelector("#stepper-progress");

let currentStep = 0;
let hasStarted = false;
let hasCompleted = false;
let lastTrackedBucket = "";
let latestContext = null;

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
  const attribution = {
    session_id: getSessionId(),
    landing_page: window.location.href,
    page_path: window.location.pathname,
    page_title: document.title,
    referrer: cleanParamValue(document.referrer),
    first_seen_at: new Date().toISOString(),
    ...pickCampaignParams(searchParams)
  };

  sessionStorage.setItem(STORAGE_KEYS.attribution, JSON.stringify(attribution));
  return attribution;
}

function compactObject(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined && entry !== ""));
}

function buildLeadContext(input, result) {
  const attribution = getAttributionContext();
  return compactObject({
    version: 1,
    session_id: attribution.session_id,
    captured_at: new Date().toISOString(),
    landing_page: attribution.landing_page,
    page_path: attribution.page_path,
    referrer: attribution.referrer,
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
  const serialized = encodeURIComponent(JSON.stringify(context));
  sessionStorage.setItem(STORAGE_KEYS.context, JSON.stringify(context));
  window.__why57RoiContext = context;

  document.cookie = `${CROSS_SUBDOMAIN_COOKIE_NAME}=${serialized}; Domain=${CROSS_SUBDOMAIN_COOKIE_DOMAIN}; Path=/; Max-Age=604800; SameSite=Lax; Secure`;
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

function trackLeadGenerated(detail = {}) {
  let fallbackContext = null;
  const storedContext = sessionStorage.getItem(STORAGE_KEYS.context);
  if (storedContext) {
    try {
      fallbackContext = JSON.parse(storedContext);
    } catch (_error) {
      sessionStorage.removeItem(STORAGE_KEYS.context);
    }
  }

  const context = latestContext || fallbackContext;
  const payload = compactObject({
    ...eventDefaults(),
    recommendation: context?.recommendation,
    readiness_score: context?.readiness_score,
    break_even_months: context?.break_even_months,
    project_type: context?.project_type,
    value: context?.build_estimate_mid,
    currency: "USD",
    ...detail
  });

  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ event: "generate_lead", ...payload });

  if (typeof window.gtag === "function") {
    window.gtag("event", "generate_lead", payload);
  }

  if (typeof window.plausible === "function") {
    window.plausible("generate_lead", { props: payload });
  }

  document.dispatchEvent(new CustomEvent("roi-calculator:lead", { detail: payload }));
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

  if (lastTrackedBucket !== result.recommendation) {
    lastTrackedBucket = result.recommendation;
    trackEvent(TRACKED_EVENTS.bucketViewed, {
      bucket: result.recommendation,
      readiness_score: result.readinessScore
    });
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
  latestContext = buildLeadContext(input, result);
  persistLeadContext(latestContext);
  renderResult(result);

  if (!hasStarted) {
    hasStarted = true;
    trackEvent(TRACKED_EVENTS.started, { project_type: input.projectType });
  }

  const meaningfulInputs = input.monthlySaaSSpend > 0 || input.manualHoursPerWeek > 0 || input.toolCount > 0;
  if (meaningfulInputs && !hasCompleted) {
    hasCompleted = true;
    trackEvent(TRACKED_EVENTS.completed, {
      recommendation: result.recommendation,
      readiness_score: result.readinessScore,
      break_even_months: result.breakEvenMonths ?? undefined,
      project_type: input.projectType
    });
  }
}

function handleInputChange() {
  render();
}

function setCurrentStep(nextStep) {
  currentStep = Math.max(0, Math.min(stepGroups.length - 1, nextStep));
  updateStepUI();
}

function initEvents() {
  form.addEventListener("input", handleInputChange);
  form.addEventListener("change", handleInputChange);
  numericInputs.forEach((input) => input.addEventListener("blur", applyDefaultsOnBlur));
  projectTypeInputs.forEach((input) => input.addEventListener("change", handleInputChange));

  assumptions.addEventListener("toggle", () => {
    if (assumptions.open) {
      trackEvent(TRACKED_EVENTS.assumptionsOpened);
    }
  });

  ctaLink.addEventListener("click", () => {
    trackLeadGenerated({ cta_location: "results_panel" });
    trackEvent(TRACKED_EVENTS.ctaClicked, { cta_location: "results_panel" });
  });

  document.querySelectorAll('a[href="https://calendar.app.google/93NLV73sQd1DXuUB6"]').forEach((link) => {
    if (link === ctaLink) return;
    link.addEventListener("click", () => {
      trackLeadGenerated({ cta_location: "page" });
      trackEvent(TRACKED_EVENTS.ctaClicked, { cta_location: "page" });
    });
  });

  mobileResultCta.addEventListener("click", () => {
    window.location.hash = "results";
  });

  prevButton.addEventListener("click", () => setCurrentStep(currentStep - 1));
  nextButton.addEventListener("click", () => {
    if (currentStep === stepGroups.length - 1) {
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
  render();

  if (window.location.hash === "#calculator" || window.location.hash === "#results") {
    document.querySelector(window.location.hash)?.scrollIntoView({ block: "start" });
  }
}

init();
