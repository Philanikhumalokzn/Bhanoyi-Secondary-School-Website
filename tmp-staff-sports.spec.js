import { test } from '@playwright/test';

const baseUrl = 'https://bhanoyi-secondary-school-website.vercel.app';
const attempts = [
  { email: 'khumalop@bhanoyi.education', password: 'khumalop' },
  { email: 'khumalop@bhanoyi.education', password: 'khumalop2026' }
];

test('probe live staff sports manager UI', async ({ page }) => {
  test.setTimeout(120000);

  for (const attempt of attempts) {
    await page.goto(`${baseUrl}/staff.html`, { waitUntil: 'networkidle' });
    await page.fill('#staff-email', attempt.email);
    await page.fill('#staff-password', attempt.password);
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000);

    const loginUrl = page.url();
    const loginStatus = await page.locator('#staff-auth-status').textContent().catch(() => '');
    const sessionKeys = await page.evaluate(() => Object.keys(sessionStorage));
    const localKeys = await page.evaluate(() => Object.keys(localStorage));

    console.log('ATTEMPT', JSON.stringify(attempt));
    console.log('LOGIN_URL', loginUrl);
    console.log('LOGIN_STATUS', loginStatus || '');
    console.log('SESSION_KEYS', JSON.stringify(sessionKeys));
    console.log('LOCAL_KEYS', JSON.stringify(localKeys.filter((key) => key.startsWith('bhanoyi.')).slice(0, 20)));

    if (!loginUrl.includes('enrollment.html')) {
      continue;
    }

    await page.goto(`${baseUrl}/sports.html`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    const sportsProbe = await page.evaluate(() => ({
      audience: document.body?.dataset?.audience || '',
      hasManagerStepText: (document.body?.innerText || '').includes('Manage House Sporting Squad'),
      managerSelectCount: document.querySelectorAll('[data-match-manager-sport]').length,
      visibleTextSample: (document.body?.innerText || '').slice(0, 3000)
    }));

    console.log('SPORTS_AUDIENCE', sportsProbe.audience);
    console.log('SPORTS_MANAGER_SELECTS', sportsProbe.managerSelectCount);
    console.log('SPORTS_HAS_MANAGER_STEP', sportsProbe.hasManagerStepText);
    console.log('SPORTS_TEXT_SAMPLE', sportsProbe.visibleTextSample);
    break;
  }
});