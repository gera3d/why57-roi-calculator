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

## Remaining account-side setup

These items cannot be fully completed from this static GitHub Pages repo alone, but the site is prepared for them:

1. GA4 custom dimensions
   Create event-scoped custom dimensions for:
   - `recommendation`
   - `project_type`
   - `readiness_score`
   - `break_even_months`
   - `cta_location`

2. CRM ingestion
   Add a trusted server endpoint on `why57.com` or another backend that:
   - reads `why57_roi_context`
   - stores the calculator state with the lead
   - associates booked calls or qualified opportunities back to the originating session

3. GTM or additional tags
   The calculator already pushes flat event objects to `dataLayer`, so a future GTM container can route the same events to Google Ads, Meta, or other tools without changing calculator logic.

4. Session replay / UX tooling
   If you add Microsoft Clarity or another replay tool later, keep the same session and attribution fields aligned with the calculator events.
