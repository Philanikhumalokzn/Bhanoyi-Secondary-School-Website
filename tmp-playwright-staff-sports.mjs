import { chromium } from 'playwright';

const baseUrl = 'https://bhanoyi-secondary-school-website.vercel.app';
const attempts = [
  { email: 'khumalop@bhanoyi.education', password: 'khumalop' },
  { email: 'khumalop@bhanoyi.education', password: 'khumalop2026' }
];

const run = async () => {
  const browser = await chromium.launch({ headless: true });

  for (const attempt of attempts) {
    const page = await browser.newPage();
    try {
      await page.goto(`${baseUrl}/staff.html`, { waitUntil: 'networkidle' });
      await page.fill('#staff-email', attempt.email);
      await page.fill('#staff-password', attempt.password);
      await page.click('button[type="submit"]');
      await page.waitForTimeout(2500);

      const currentUrl = page.url();
      const status = await page.locator('#staff-auth-status').textContent().catch(() => '');
      const storageDump = await page.evaluate(() => {
        const session = {};
        for (let i = 0; i < sessionStorage.length; i += 1) {
          const key = sessionStorage.key(i);
          session[key] = sessionStorage.getItem(key);
        }
        const local = {};
        for (let i = 0; i < localStorage.length; i += 1) {
          const key = localStorage.key(i);
          if (key && (key.startsWith('bhanoyi.enrollmentClasses.') || key.startsWith('bhanoyi.houseSportSquads.') || key.startsWith('bhanoyi.staffSession.'))) {
            local[key] = localStorage.getItem(key)?.slice(0, 500);
          }
        }
        return { session, local, audience: document.body?.dataset?.audience || '' };
      });

      console.log('ATTEMPT', JSON.stringify(attempt));
      console.log('POST_LOGIN_URL', currentUrl);
      console.log('LOGIN_STATUS', status || '');
      console.log('POST_LOGIN_AUDIENCE', storageDump.audience || '');
      console.log('SESSION_KEYS', Object.keys(storageDump.session));
      console.log('LOCAL_KEYS', Object.keys(storageDump.local));

      if (currentUrl.includes('enrollment.html')) {
        await page.goto(`${baseUrl}/sports.html`, { waitUntil: 'networkidle' });
        await page.waitForTimeout(2500);
        const sportsInfo = await page.evaluate(() => ({
          audience: document.body?.dataset?.audience || '',
          text: document.body?.innerText || '',
          matchManagerSelectCount: document.querySelectorAll('[data-match-manager-sport]').length,
          squadStepTextFound: (document.body?.innerText || '').includes('Manage House Sporting Squad'),
          openMatchTexts: Array.from(document.querySelectorAll('button')).map((button) => button.textContent?.trim()).filter(Boolean).slice(0, 80)
        }));
        console.log('SPORTS_AUDIENCE', sportsInfo.audience || '');
        console.log('SPORTS_MANAGER_SELECTS', sportsInfo.matchManagerSelectCount);
        console.log('SPORTS_HAS_MANAGER_STEP', sportsInfo.squadStepTextFound);
        console.log('SPORTS_BUTTONS', JSON.stringify(sportsInfo.openMatchTexts));
      }
    } catch (error) {
      console.log('ATTEMPT_ERROR', JSON.stringify(attempt), error instanceof Error ? error.message : String(error));
    } finally {
      await page.close();
    }
  }

  await browser.close();
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});