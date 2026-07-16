(() => {
  const ROI_CONTEXT_COOKIE = "why57_roi_context";
  const ATTRIBUTION_COOKIE = "why57_acquisition";
  const COOKIE_DOMAIN = "why57.com";
  const BOOKING_URL = "https://calendar.app.google/93NLV73sQd1DXuUB6";
  const ATTRIBUTION_MAX_AGE_SECONDS = 60 * 60 * 24 * 90;

  function readCookie(name) {
    const prefix = `${name}=`;
    const match = document.cookie
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(prefix));

    return match ? match.slice(prefix.length) : null;
  }

  function parseCookie(name) {
    const encoded = readCookie(name);
    if (!encoded) return null;

    try {
      return JSON.parse(decodeURIComponent(encoded));
    } catch (_error) {
      return null;
    }
  }

  function clean(value) {
    if (value == null) return undefined;
    const normalized = String(value).trim();
    return normalized || undefined;
  }

  function compact(value) {
    return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined && entry !== ""));
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

  function pickCampaignParams(searchParams) {
    return compact({
      utm_source: clean(searchParams.get("utm_source")),
      utm_medium: clean(searchParams.get("utm_medium")),
      utm_campaign: clean(searchParams.get("utm_campaign")),
      utm_content: clean(searchParams.get("utm_content")),
      utm_term: clean(searchParams.get("utm_term")),
      gclid: clean(searchParams.get("gclid")),
      gbraid: clean(searchParams.get("gbraid")),
      wbraid: clean(searchParams.get("wbraid")),
      msclkid: clean(searchParams.get("msclkid"))
    });
  }

  function withoutInternalCampaign(campaign, internalReferral) {
    if (!internalReferral) return campaign;

    const source = campaign.utm_source?.toLowerCase();
    const internalSources = new Set(["57", "why57", "why57.com", "roi.why57.com", "internal", "website"]);
    if (!source || !internalSources.has(source)) return campaign;

    return compact({
      gclid: campaign.gclid,
      gbraid: campaign.gbraid,
      wbraid: campaign.wbraid,
      msclkid: campaign.msclkid
    });
  }

  function writeAttributionCookie(attribution) {
    const encoded = encodeURIComponent(JSON.stringify(attribution));
    document.cookie = `${ATTRIBUTION_COOKIE}=${encoded}; Domain=${COOKIE_DOMAIN}; Path=/; Max-Age=${ATTRIBUTION_MAX_AGE_SECONDS}; SameSite=Lax; Secure`;
  }

  function preserveOriginalAcquisition() {
    const existing = parseCookie(ATTRIBUTION_COOKIE);
    if (existing?.first_seen_at && existing?.landing_page) return existing;

    const referrer = clean(document.referrer);
    const internalReferral = isWhy57Url(referrer);
    const campaign = withoutInternalCampaign(
      pickCampaignParams(new URLSearchParams(window.location.search)),
      internalReferral
    );
    const acquisition = compact({
      version: 2,
      landing_page: window.location.href,
      referrer: internalReferral ? undefined : referrer,
      first_seen_at: new Date().toISOString(),
      ...campaign
    });

    writeAttributionCookie(acquisition);
    return acquisition;
  }

  function pushContextEvent(context) {
    if (!context) return;

    window.__why57RoiContext = context;
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({
      event: "roi_context_loaded",
      session_id: context.session_id,
      recommendation: context.recommendation,
      readiness_score: context.readiness_score,
      break_even_months: context.break_even_months,
      project_type: context.project_type
    });
  }

  function annotateBookingLinks(context) {
    if (!context) return;

    document.querySelectorAll(`a[href="${BOOKING_URL}"]`).forEach((link) => {
      link.dataset.roiSessionId = context.session_id || "";
      link.dataset.roiRecommendation = context.recommendation || "";
      link.dataset.roiScore = String(context.readiness_score || "");
      link.dataset.roiProjectType = context.project_type || "";
    });
  }

  preserveOriginalAcquisition();
  const context = parseCookie(ROI_CONTEXT_COOKIE);
  pushContextEvent(context);
  annotateBookingLinks(context);
})();
