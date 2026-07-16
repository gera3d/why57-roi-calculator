const ALLOWED_ORIGINS = new Set(["https://roi.why57.com", "https://why57.com"]);
const ALLOWED_EVENTS = new Set(["calendar_booking_clicked", "roi_report_requested"]);
const MAX_BODY_BYTES = 32_768;
const MIN_REPORT_FORM_TIME_MS = 1_500;

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin || "https://roi.why57.com",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin"
  };
}

function jsonResponse(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(origin)
    }
  });
}

function validEmail(value) {
  return (
    typeof value === "string" &&
    value.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
  );
}

function compact(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined && entry !== null));
}

export async function POST(request) {
  const origin = request.headers.get("origin") || "";

  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return jsonResponse({ ok: false, error: "forbidden_origin" }, 403, "");
  }

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_BODY_BYTES) {
    return jsonResponse({ ok: false, error: "payload_too_large" }, 413, origin);
  }

  let payload;
  try {
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).length > MAX_BODY_BYTES) {
      return jsonResponse({ ok: false, error: "payload_too_large" }, 413, origin);
    }
    payload = JSON.parse(rawBody);
  } catch (_error) {
    return jsonResponse({ ok: false, error: "invalid_json" }, 400, origin);
  }

  const eventType = payload?.event_type;
  if (!ALLOWED_EVENTS.has(eventType)) {
    return jsonResponse({ ok: false, error: "unsupported_event" }, 400, origin);
  }

  const context = payload?.context || {};
  const detail = payload?.detail || {};
  const normalized = compact({
    event_type: eventType,
    sent_at: payload?.sent_at || new Date().toISOString(),
    request_id: detail.request_id,
    session_id: context.session_id,
    recommendation: context.recommendation,
    readiness_score: context.readiness_score,
    break_even_months: context.break_even_months,
    project_type: context.project_type,
    landing_page: context.landing_page,
    first_seen_at: context.first_seen_at,
    utm_source: context.utm_source,
    utm_medium: context.utm_medium,
    utm_campaign: context.utm_campaign,
    cta_location: detail.cta_location
  });

  if (eventType === "roi_report_requested") {
    // Quietly accept honeypot submissions so bots receive no useful signal.
    if (detail.website) {
      return jsonResponse({ ok: true }, 202, origin);
    }

    if (!Number.isFinite(detail.form_elapsed_ms) || detail.form_elapsed_ms < MIN_REPORT_FORM_TIME_MS) {
      return jsonResponse({ ok: false, error: "request_too_fast" }, 429, origin);
    }

    if (!detail.consent) {
      return jsonResponse({ ok: false, error: "consent_required" }, 400, origin);
    }

    if (!validEmail(detail.email)) {
      return jsonResponse({ ok: false, error: "invalid_email" }, 400, origin);
    }

    normalized.email = detail.email.trim().toLowerCase();
    normalized.consent = true;
    normalized.consent_version = detail.consent_version;
    normalized.result_summary = detail.result_summary;
    normalized.recommended_plan = detail.recommended_plan;
    normalized.annual_total_current_cost = context.annual_total_current_cost;
    normalized.build_estimate_mid = context.build_estimate_mid;
    normalized.three_year_saas_cost = context.three_year_saas_cost;
    normalized.three_year_custom_cost = context.three_year_custom_cost;
  }

  const webhookUrl =
    eventType === "roi_report_requested"
      ? process.env.ROI_REPORT_WEBHOOK_URL
      : process.env.ROI_FORWARD_WEBHOOK_URL;
  const webhookSecret = process.env.ROI_FORWARD_WEBHOOK_SECRET;

  if (!webhookUrl) {
    // Do not log the email address. Configure a webhook before enabling report delivery in production.
    console.log("[roi-lead-capture]", JSON.stringify({ ...normalized, email: normalized.email ? "[redacted]" : undefined }));

    if (eventType === "roi_report_requested") {
      return jsonResponse({ ok: false, error: "delivery_not_configured" }, 503, origin);
    }

    return jsonResponse({ ok: true }, 200, origin);
  }

  const headers = { "Content-Type": "application/json" };
  if (webhookSecret) {
    headers.Authorization = `Bearer ${webhookSecret}`;
  }

  const forwarded = await fetch(webhookUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(normalized)
  });

  if (!forwarded.ok) {
    return jsonResponse({ ok: false, error: "delivery_failed" }, 502, origin);
  }

  return jsonResponse({ ok: true }, 200, origin);
}

export function OPTIONS(request) {
  const origin = request.headers.get("origin") || "";

  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return new Response(null, { status: 403 });
  }

  return new Response(null, {
    status: 204,
    headers: corsHeaders(origin)
  });
}
