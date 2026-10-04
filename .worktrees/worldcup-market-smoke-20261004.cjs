const assert = require('node:assert/strict');
const { chromium } = require('C:/Users/ekth3/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');
const base = 'http://127.0.0.1:3114';
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const results = [];
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.route('https://mblogthumb-phinf.pstatic.net/**', route => route.abort());
    let response = await page.goto(base + '/', { waitUntil: 'networkidle' });
    assert.equal(response.status(), 200);
    assert.equal(new URL(page.url()).pathname, '/');
    const selector = page.getByRole('combobox');
    assert.equal(await selector.count(), 1);
    assert.deepEqual(await selector.locator('option').evaluateAll(options => options.map(option => option.value)), ['ko', 'en', 'ja', 'zh']);
    for (const locale of ['en', 'ja', 'zh', 'ko']) {
      await selector.selectOption(locale);
      assert.equal(await selector.inputValue(), locale);
      assert.equal(await page.locator('.worldcup-market-demo').count(), 0);
    }
    const homeCssUrls = await page.locator('link[rel="stylesheet"]').evaluateAll(links => links.map(link => link.href));
    for (const url of homeCssUrls) {
      const css = await (await context.request.get(url)).text();
      assert.equal(css.includes('.worldcup-market-'), false, 'World Cup CSS leaked into the home entry');
    }
    results.push('PASS home / stays on main navigation, 4 locales, no market CSS');
    await page.screenshot({ path: 'D:/walk/.worktrees/worldcup-market-home-20261004.png' });
    response = await page.goto(base + '/worldcup-market', { waitUntil: 'networkidle' });
    assert.equal(response.status(), 200);
    await page.getByRole('heading', { name: '부부야채', exact: true }).waitFor();
    assert.equal(await page.locator('.worldcup-market-store-switcher button').count(), 45);
    assert.equal(await page.getByRole('button', { name: '여기로 가기', exact: true }).isDisabled(), true);
    assert.equal(await page.locator('.worldcup-market-mobile-key-facts dd').nth(1).textContent(), '미확인');
    for (const [locale, expectedHeading] of [['EN','Bubu Vegetables'], ['JA','부부야채'], ['ZH','부부야채'], ['KO','부부야채']]) {
      await page.getByRole('button', { name: locale, exact: true }).click();
      await page.getByRole('heading', { name: expectedHeading, exact: true }).waitFor();
      assert.equal(await page.getByRole('button', { name: locale, exact: true }).getAttribute('aria-pressed'), 'true');
    }
    await page.getByRole('button', { name: '무진장전집', exact: true }).click();
    await page.getByRole('heading', { name: '무진장전집', exact: true }).waitFor();
    assert.equal(new URL(page.url()).searchParams.get('store'), 'worldcup-market-04');
    results.push('PASS 45 original stores, locale switching, store selection, unknown prices');
    await page.getByRole('button', { name: '주변 점포 · 360 · 지도', exact: true }).click();
    await page.getByRole('heading', { name: '주변 점포', exact: true }).waitFor();
    assert.equal(await page.locator('.worldcup-market-nearby-rail li').count(), 45);
    assert.equal(await page.locator('iframe').count(), 0);
    assert.equal(await page.locator('.worldcup-market-market-map').count(), 0);
    assert.equal(await page.getByRole('button', { name: '여기로 가기', exact: true }).isDisabled(), true);
    await page.getByRole('button', { name: '가락농산물 과일', exact: true }).click();
    await page.getByRole('heading', { name: '가락농산물', exact: true }).waitFor();
    await page.getByRole('button', { name: '뒤로', exact: true }).click();
    await page.getByRole('heading', { name: '가락농산물', exact: true }).waitFor();
    results.push('PASS nearby/back flow, no fabricated map/Street View/walking target');
    await page.goto(base + '/worldcup-market?store=worldcup-market-45', { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: '장터국밥', exact: true }).waitFor();
    results.push('PASS deep link store 45');
    await page.screenshot({ path: 'D:/walk/.worktrees/worldcup-market-demo-20261004.png' });
    assert.deepEqual(pageErrors, []);
    results.push('PASS pageerror count 0');
    console.log(results.join('\n'));
    await context.close();
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
