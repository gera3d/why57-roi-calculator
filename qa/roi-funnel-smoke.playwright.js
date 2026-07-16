async (page) => {
  const origin = page.url().split('/').slice(0, 3).join('/');
  const calculatorUrl = `${origin}/custom-software-roi-calculator/`;
  const workerOrigin = 'https://why57-roi-intake.gera-695.workers.dev';
  const receiptToken = 'c'.repeat(64);
  const context = page.context();

  await context.addInitScript(() => {
    window.__why57CollectedEvents = [];
    window.gtag = (...args) => {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push(args);
      if (args[0] === 'event') window.__why57CollectedEvents.push(args[1]);
    };
  });
  await context.route('https://www.googletagmanager.com/**', (route) => route.abort());

  const collectedCount = async (target, eventName) => target.evaluate(
    (name) => window.__why57CollectedEvents.filter((event) => event === name).length,
    eventName
  );

  const openAndFillReport = async (target) => {
    await target.goto(calculatorUrl, { waitUntil: 'domcontentloaded' });
    await target.evaluate(() => {
      const pageGtag = window.gtag;
      window.gtag = (...args) => {
        if (typeof pageGtag === 'function') pageGtag(...args);
        if (args[0] === 'event') window.__why57CollectedEvents.push(args[1]);
      };
    });
    await target.locator('#report-capture').evaluate((element) => { element.open = true; });
    await target.locator('#report-email').fill('qa@example.com');
    await target.locator('#report-consent').check();
  };

  let receiptClaims = 0;
  const success = await context.newPage();
  let successSubmissions = 0;
  const successRequestIds = [];
  await success.route(`${workerOrigin}/**`, async (route) => {
    const requestPath = route.request().url().slice(workerOrigin.length).split('?')[0];
    if (requestPath === '/conversion-receipt') {
      receiptClaims += 1;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          claimed: receiptClaims === 1,
          event_type: 'roi_report_requested',
          submission_id: 'local-roi-submission',
          reference: 'LOCALROI1'
        })
      });
    }
    if (requestPath === '/') {
      successSubmissions += 1;
      const requestBody = JSON.parse(route.request().postData() || '{}');
      successRequestIds.push(requestBody.detail?.request_id);
      if (successSubmissions === 1) return route.abort('failed');
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          stored: true,
          forwarded: true,
          receipt: receiptToken,
          id: 'local-roi-submission'
        })
      });
    }
    return route.fulfill({ status: 404, body: 'Not found' });
  });

  await openAndFillReport(success);
  await success.locator('#report-submit').click();
  await success.locator('#report-form-status').filter({ hasText: 'couldn’t confirm' }).waitFor();
  await success.locator('#report-submit').click();
  await success.locator('#report-success').waitFor({ state: 'visible' });
  if (successSubmissions !== 2) throw new Error(`unknown-state retry made ${successSubmissions} requests`);
  if (!successRequestIds[0] || successRequestIds[0] !== successRequestIds[1]) {
    throw new Error('unknown-state retry did not preserve its request_id');
  }
  if (receiptClaims !== 1) throw new Error(`ROI success claimed ${receiptClaims} receipts`);
  if (await collectedCount(success, 'roi_report_requested') !== 1) {
    throw new Error('ROI success did not collect exactly one primary conversion');
  }
  await success.close();

  const consumed = await context.newPage();
  await consumed.route(`${workerOrigin}/**`, async (route) => {
    const requestPath = route.request().url().slice(workerOrigin.length).split('?')[0];
    if (requestPath === '/conversion-receipt') {
      receiptClaims += 1;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          claimed: false,
          event_type: 'roi_report_requested',
          submission_id: 'local-roi-submission',
          reference: 'LOCALROI1'
        })
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, stored: true, forwarded: true, receipt: receiptToken, replayed: true })
    });
  });
  await openAndFillReport(consumed);
  await consumed.locator('#report-submit').click();
  await consumed.locator('#report-success').waitFor({ state: 'visible' });
  if (await collectedCount(consumed, 'roi_report_requested') !== 0) {
    throw new Error('consumed ROI receipt collected a duplicate conversion');
  }
  await consumed.close();

  const runFailureCase = async ({ status, body, expectedCopy }) => {
    const target = await context.newPage();
    let receiptRequests = 0;
    await target.route(`${workerOrigin}/**`, async (route) => {
      const requestPath = route.request().url().slice(workerOrigin.length).split('?')[0];
      if (requestPath === '/conversion-receipt') receiptRequests += 1;
      return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await openAndFillReport(target);
    await target.locator('#report-submit').click();
    await target.locator('#report-form-status').filter({ hasText: expectedCopy }).waitFor();
    if (receiptRequests !== 0) throw new Error(`HTTP ${status} attempted to claim a receipt`);
    if (await collectedCount(target, 'roi_report_requested') !== 0) {
      throw new Error(`HTTP ${status} collected an ROI conversion`);
    }
    await target.close();
  };

  await runFailureCase({
    status: 502,
    body: { ok: false, error: 'delivery_failed' },
    expectedCopy: 'couldn’t confirm'
  });
  await runFailureCase({
    status: 429,
    body: { ok: false, error: 'rate_limited' },
    expectedCopy: 'wait up to one hour'
  });

  const honeypot = await context.newPage();
  let honeypotRequests = 0;
  await honeypot.route(`${workerOrigin}/**`, async (route) => {
    honeypotRequests += 1;
    return route.fulfill({ status: 500, body: 'Unexpected request' });
  });
  await openAndFillReport(honeypot);
  await honeypot.locator('#company-website').evaluate((input) => { input.value = 'bot.example'; });
  await honeypot.locator('#report-submit').click();
  await honeypot.locator('#report-success').waitFor({ state: 'visible' });
  if (honeypotRequests !== 0) throw new Error('ROI honeypot contacted the delivery service');
  if (await collectedCount(honeypot, 'roi_report_requested') !== 0) {
    throw new Error('ROI honeypot collected a conversion');
  }
  await honeypot.close();

  const mobile = await context.newPage();
  await mobile.setViewportSize({ width: 390, height: 844 });
  await mobile.goto(calculatorUrl, { waitUntil: 'domcontentloaded' });
  const mobileState = await mobile.evaluate(() => ({
    viewportWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    emailRequired: document.querySelector('#report-email').required,
    consentRequired: document.querySelector('#report-consent').required,
    processProof: [...document.querySelectorAll('.hero-stats .stat-l')].map((element) => element.textContent.trim()),
    unsupportedHeroCopy: document.querySelector('.hero-stats').textContent.match(/15\+|50\+|10x|Years of experience|Clients served|Average ROI/i)?.[0] || ''
  }));
  if (mobileState.scrollWidth > mobileState.viewportWidth + 1) throw new Error('390px ROI page has horizontal overflow');
  if (!mobileState.emailRequired || !mobileState.consentRequired) throw new Error('ROI required lead/consent fields were weakened');
  if (mobileState.unsupportedHeroCopy) throw new Error(`unsupported ROI hero proof remains: ${mobileState.unsupportedHeroCopy}`);
  const approvedProof = ['You control the scenario', 'Assumptions stay visible', 'Directional, not a guarantee'];
  for (const proof of approvedProof) {
    if (!mobileState.processProof.includes(proof)) throw new Error(`approved ROI process proof missing: ${proof}`);
  }
  await mobile.close();

  return 'ROI funnel smoke passed: unknown-state retry preserved request_id; delivered receipt collected once; consumed receipt, delivery failure, 429, and honeypot collected zero; one-hour copy and 390x844 contracts passed.';
}
