# ROI Calculator Integrations

## Front-end configuration

`window.ROI_INTEGRATIONS` in `index.html` is the only front-end configuration surface:

- `ga4MeasurementId`: GA4 property used by the calculator
- `crossSubdomainCookieDomain`: shared parent domain (`why57.com`)
- `crossSubdomainCookieName`: seven-day calculator result context cookie
- `attributionCookieName`: two-year, first-touch acquisition cookie shared by `why57.com` and `roi.why57.com`
- `linkerDomains`: GA4 cross-domain linker domains shared with the main site
- `leadCaptureEndpoint`: existing JSON intake URL for booking and report requests
- `identifiedLeadIntake`: localhost-only adapter for exercising the new `/v1/leads` contract through the existing report form

No email provider credentials, webhook secrets, or other secrets belong in this object.

The identified adapter is enabled only on `localhost` and `127.0.0.1`. On the deployed ROI domain its endpoint is empty, so the current production report and booking-event flow continues to use `leadCaptureEndpoint` unchanged. Do not put a staging submission token in front-end code.

## Analytics events

The calculator pushes flat events to `dataLayer`, GA4, and the existing custom DOM event bridge:

- `calculator_started`
- `calculator_completed`
- `result_bucket_viewed`
- `assumptions_opened`
- `roi_result_shared`
- `roi_report_requested` (only after the intake returns a successful response)
- `calendar_booking_clicked` (a micro-conversion, not a completed lead)
- `cta_clicked` (kept for existing dashboards)

Analytics payloads never include the submitted email address or worksheet inputs.

`calculator_started` fires once after the first intentional form or step-navigation interaction. It never fires from the initial default render. `calculator_completed` fires once only after an explicit result action (`See result`, result share, report form, result assumptions, or result booking) or after the visitor has intentionally changed at least one field in all four calculator steps. Its payload includes `completion_trigger` and `steps_touched`. `result_bucket_viewed` begins only after that completion boundary and can fire again only if a later change moves the completed calculator into a different recommendation bucket.

## Original acquisition across subdomains

The `why57_first_touch` cookie preserves the first landing page, external referrer, first-seen time, source, medium, external campaign values, and ad click IDs for up to two years. The calculator reads that cookie before looking at its own landing URL, so moving between `why57.com` and `roi.why57.com` does not replace the original acquisition with an internal referral.

The main site's shared `analytics.js` initializes the same cookie for visitors who start there. The bridge asset at `integration-assets/why57-main-site-bridge.js` remains available only for ROI-result personalization on older main-site deployments. Internal links do not need UTM parameters. If an old internal link still uses an internal `utm_source` value such as `why57`, `website`, or `internal`, it is ignored when the referrer is another Why57 subdomain. External UTM and ad click IDs are still captured.

Both pages also configure the same GA4 linker domains in code. After deployment, verify the GA4 Admin cross-domain settings include the Why57 domains and run a live main-site-to-ROI navigation test. Confirm the linker is accepted, one user/session continues across the subdomain boundary, and `why57.com` is not recorded as an ROI referral.

The result cookie remains separate and contains the latest calculator context for booking personalization.

## Optional report request

The calculator remains ungated. After seeing the live result, a visitor may expand “Email me my result and recommended first-build plan” and submit:

- work email
- explicit email consent and consent-copy version
- result bucket, score, break-even, high-level cost comparison, and project type
- a bucket-specific recommended three-step plan
- original acquisition context
- a request ID and form elapsed time
- an empty honeypot field

When the localhost-only identified adapter is active, the same form also asks for the name required by `/v1/leads`. It does not add a second capture form or gate the calculator result.

The report request intentionally omits raw monthly spend, hourly team cost, user count, tool count, and other worksheet fields. The share action is even narrower: it includes only the recommendation headline, readiness score, directional break-even, three-year comparison, and the canonical calculator URL.

The UI includes custom validation plus loading, server error, and success states. A legacy production request is considered successful when the configured endpoint returns a 2xx response. The identified adapter additionally requires a JSON `{ "ok": true }` response and uses the returned `delivery_mode` in its confirmation copy. `test` can send a real message to an allowlisted test inbox; `dry-run` does not contact email, Slack, or Sheets.

## Endpoint contract and spam protection

`integration-assets/lead-capture-endpoint.example.mjs` documents the compatible server pattern. It accepts `calendar_booking_clicked` and the completed `roi_report_requested` event at the same JSON endpoint.

For local QA only, the report form adapts that same consented submission to the identified intake contract with `event_type: "lead_submission"`, `source: "roi_calculator_result"`, contact name and email, the public result context, and a stable `submission_id`. The ID is created once per page load and reused when a failed request is retried, allowing the intake service to deduplicate a request whose first response was lost.

The example enforces:

- production origin allowlist and CORS
- supported event allowlist
- request-size limit
- honeypot handling
- minimum form-fill time
- server-side email and consent validation
- redacted logs when report delivery is not configured
- non-2xx response when email delivery is unavailable

Production should also apply rate limiting at the edge and idempotency on `request_id` using the storage already available to the intake service. Those controls are environment-specific and are not fabricated in the static calculator.

## Credential-dependent setup

The browser code and repository do not contain email delivery credentials. To make the request produce an email, the existing intake service must implement the example contract and set:

- `ROI_REPORT_WEBHOOK_URL`: CRM, automation, or transactional-email workflow that accepts the normalized report payload
- `ROI_FORWARD_WEBHOOK_SECRET`: optional bearer secret expected by that workflow

`ROI_FORWARD_WEBHOOK_URL` remains optional for booking-event forwarding. Keep all values server-side.

Until the report webhook and template are configured in the deployed intake service, the front end can be tested with a mocked 2xx response, but production report delivery is not complete.
