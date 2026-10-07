const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('C:/Users/ekth3/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const report = { browser: 'Installed Google Chrome', viewport: '390x844', pages: [], pageErrors: [] };
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    page.on('pageerror', error => report.pageErrors.push(error.name));
    for (const route of ['/', '/mangwon', '/worldcup-market?store=worldcup-market-01']) {
      const response = await page.goto('http://127.0.0.1:3115' + route, { waitUntil: 'networkidle' });
      assert.equal(response.status(), 200);
      await page.locator('h1').first().waitFor();
      if (route === '/') {
        assert.deepEqual(await page.getByRole('combobox').locator('option').evaluateAll(options => options.map(option => option.value)), ['ko', 'en', 'ja', 'zh']);
        assert.equal((await page.locator('h1').first().textContent()).trim(), '어디로 갈까요?');
      } else if (route.startsWith('/worldcup-market')) {
        assert.equal(await page.locator('.worldcup-market-store-switcher button').count(), 45);
        assert.equal(await page.getByRole('button', { name: '여기로 가기', exact: true }).isDisabled(), false);
      }
      const width = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
      assert.ok(width.document <= width.viewport + 1, 'mobile horizontal overflow');
      const name = route === '/' ? 'home' : route.split('?')[0].slice(1);
      await page.screenshot({ path: 'D:/walk/.worktrees/main-sync-' + name + '-20261006.png', fullPage: true });
      report.pages.push({ route, http: response.status(), heading: await page.locator('h1').first().textContent(), width, result: 'PASS' });
    }
    assert.deepEqual(report.pageErrors, []);
  } catch (error) { report.failure = error.message; process.exitCode = 1; }
  finally {
    await browser.close();
    fs.writeFileSync('D:/walk/.worktrees/main-sync-chrome-20261006.json', JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  }
})().catch(error => { console.error(error.name); process.exitCode = 1; });
