export async function POST(request) {
  const allowedOrigins = ["https://roi.why57.com", "https://why57.com"];
  const origin = request.headers.get("origin") || "";

  if (origin && !allowedOrigins.includes(origin)) {
    return new Response(JSON.stringify({ ok: false, error: "forbidden_origin" }), {
      status: 403,
      headers: { "Content-Type": "application/json" }
    });
  }

  let payload;
  try {
    payload = await request.json();
  } catch (_error) {
    return new Response(JSON.stringify({ ok: false, error: "invalid_json" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  const context = payload?.context || {};
  const detail = payload?.detail || {};

  const normalized = {
    event_type: payload?.event_type || "generate_lead",
    sent_at: payload?.sent_at || new Date().toISOString(),
    session_id: context.session_id || null,
    recommendation: context.recommendation || null,
    readiness_score: context.readiness_score || null,
    break_even_months: context.break_even_months || null,
    project_type: context.project_type || null,
    utm_source: context.utm_source || null,
    utm_medium: context.utm_medium || null,
    utm_campaign: context.utm_campaign || null,
    cta_location: detail.cta_location || null,
    raw: payload
  };

  const forwardWebhook = process.env.ROI_FORWARD_WEBHOOK_URL;
  if (forwardWebhook) {
    await fetch(forwardWebhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(normalized)
    });
  } else {
    console.log("[roi-lead-capture]", JSON.stringify(normalized));
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": origin || "*"
    }
  });
}

export function OPTIONS(request) {
  const origin = request.headers.get("origin") || "*";

  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    }
  });
}
