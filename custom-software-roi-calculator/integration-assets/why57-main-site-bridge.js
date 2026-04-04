(() => {
  const COOKIE_NAME = "why57_roi_context";
  const BOOKING_URL = "https://calendar.app.google/93NLV73sQd1DXuUB6";

  function readCookie(name) {
    const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
    return match ? match[1] : null;
  }

  function parseContext() {
    const encoded = readCookie(COOKIE_NAME);
    if (!encoded) return null;

    try {
      return JSON.parse(decodeURIComponent(encoded));
    } catch (_error) {
      return null;
    }
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

  const context = parseContext();
  pushContextEvent(context);
  annotateBookingLinks(context);
})();
