# ROI Calculator Integrations

The ROI calculator is now wired to the same GA4 property used on `why57.com`:

- `G-358H0FHG50`

The page loads the Google tag directly and the calculator emits:

- `calculator_started`
- `calculator_completed`
- `result_bucket_viewed`
- `assumptions_opened`
- `cta_clicked`
- `generate_lead`

Each event is enriched with attribution and result context when available, including:

- `session_id`
- `utm_source`
- `utm_medium`
- `utm_campaign`
- `project_type`
- `recommendation`
- `readiness_score`
- `break_even_months`

## Cross-site handoff

The calculator also writes a first-party cookie on `.why57.com`:

- Cookie name: `why57_roi_context`
- Lifetime: 7 days

The cookie contains a compact JSON payload with the latest calculator result and attribution context so the main site, a future booking page, or a backend endpoint can read it and attach ROI context to leads.

## Lead capture endpoint

The calculator now sends a best-effort JSON POST on booking CTA clicks to:

- `https://why57-roi-intake.gera-695.workers.dev/`

The endpoint is configured in [index.html](/Users/gerayeremin/Documents/New%20project/custom-software-roi-calculator/index.html) through:

- `window.ROI_INTEGRATIONS.leadCaptureEndpoint`

Each request contains:

- `event_type`
- `sent_at`
- `context`
- `detail`

The booking flow does not block on this request.

## Remaining account-side setup

The core setup is now live and completed:

1. GA4
   The calculator uses the same GA4 property as `why57.com`, and the related custom dimensions, custom metrics, and `generate_lead` key event are already configured in GA4 admin.

2. Server-side lead capture
   The Cloudflare Worker at `why57-roi-intake.gera-695.workers.dev` is live and storing normalized lead context in KV.

3. Main-site bridge
   `why57.com` reads the shared cookie, renders personalized handoff copy, and sends server-side lead context again on booking CTA clicks.

## Optional next layers

These are optional upgrades, not blockers:

1. CRM or webhook forwarding
   The Worker supports forwarding normalized payloads through `ROI_FORWARD_WEBHOOK_URL` and `ROI_FORWARD_WEBHOOK_SECRET`, but no external CRM is attached by default.

2. GTM or additional tags
   The calculator already pushes flat event objects to `dataLayer`, so a future GTM container can route the same events to Google Ads, Meta, or other tools without changing calculator logic.

3. Session replay / UX tooling
   If you add Microsoft Clarity or another replay tool later, keep the same session and attribution fields aligned with the calculator events.

## Ready-to-use assets

Two helper assets are included in this repo:

- [why57-main-site-bridge.js](/Users/gerayeremin/Documents/New%20project/custom-software-roi-calculator/integration-assets/why57-main-site-bridge.js)
- [lead-capture-endpoint.example.mjs](/Users/gerayeremin/Documents/New%20project/custom-software-roi-calculator/integration-assets/lead-capture-endpoint.example.mjs)

The Worker source is versioned in the main-site repo at:

- [worker.js](/Users/gerayeremin/Documents/New%20project/why57/cloudflare/why57-roi-intake/worker.js)
- [ROI-INTEGRATION.md](/Users/gerayeremin/Documents/New%20project/why57/ROI-INTEGRATION.md)

## Verification summary

As of April 4, 2026:

- `https://why57-roi-intake.gera-695.workers.dev/` returns a healthy JSON response
- POSTs from both `https://roi.why57.com` and `https://why57.com` are accepted and stored
- the live frontend endpoint is wired through [index.html](/Users/gerayeremin/Documents/New%20project/custom-software-roi-calculator/index.html)
