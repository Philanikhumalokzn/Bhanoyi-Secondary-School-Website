import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';

const sportsUrl = pathToFileURL('c:/Users/Sphindile/OneDrive/Documents/Bhanoyi Secondary School Website/dist/sports.html').href;

const enrollmentStore = {
  activeGrades: ['8'],
  classesByGrade: { '8': ['A'], '9': [], '10': [], '11': [], '12': [] },
  classProfilesByGrade: {
    '8': {
      A: {
        teacher: '',
        room: '',
        capacity: '2',
        notes: '',
        learners: [
          { name: 'Lerato Khumalo', admissionNo: '1001', gender: 'Female', houseId: 'house_1', sportingCodes: ['Football'] },
          { name: 'Ayanda Dlamini', admissionNo: '1002', gender: 'Female', houseId: 'house_1', sportingCodes: ['Football'] }
        ]
      }
    },
    '9': {},
    '10': {},
    '11': {},
    '12': {}
  },
  staffMembers: [
    {
      title: 'Mr.',
      firstName: 'Phila',
      surname: 'Khumalo',
      initials: 'P.',
      loginEmail: 'khumalop@bhanoyi.education',
      loginPassword: 'khumalop2026',
      houseId: 'house_1',
      postLevel: 'PL1',
      staffType: 'teaching_staff'
    }
  ]
};

const fixtures = {
  'sports_fixture_creator:soccer:R1M1': {
    homeId: 'house_1',
    awayId: 'house_2',
    homeName: 'House 1',
    awayName: 'House 2',
    sport: 'Football',
    competition: 'Inter-House League',
    venue: 'Main Field',
    round: 1,
    match: 1
  }
};

const fixtureDates = {
  'sports_fixture_creator:soccer:R1M1': '2026-03-25T14:00'
};

const run = async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.addInitScript(({ seededEnrollmentStore, seededFixtures, seededFixtureDates }) => {
    localStorage.setItem('bhanoyi.enrollmentClasses.enrollment_manager', JSON.stringify(seededEnrollmentStore));
    localStorage.setItem('bhanoyi.fixtures.sports_fixture_creator', JSON.stringify(seededFixtures));
    localStorage.setItem('bhanoyi.fixtureDates.sports_fixture_creator', JSON.stringify(seededFixtureDates));
    sessionStorage.setItem('bhanoyi.staffSession.enrollment_manager', 'khumalop@bhanoyi.education');
  }, {
    seededEnrollmentStore: enrollmentStore,
    seededFixtures: fixtures,
    seededFixtureDates: fixtureDates
  });

  await page.goto(sportsUrl, { waitUntil: 'load' });
  await page.waitForTimeout(3000);

  await page.evaluate(() => {
    window.dispatchEvent(
      new CustomEvent('bhanoyi:open-match-log-modal', {
        detail: {
          fixtureSectionKey: 'sports_fixture_creator',
          fixtureId: 'sports_fixture_creator:soccer:R1M1',
          fixtureDate: '2026-03-25',
          preferredSide: 'left'
        }
      })
    );
  });

  await page.waitForTimeout(2000);

  const result = await page.evaluate(() => ({
    audience: document.body?.dataset?.audience || '',
    hasManagerStep: (document.body?.innerText || '').includes('Manage House Sporting Squad'),
    managerSelectCount: document.querySelectorAll('[data-match-manager-sport]').length,
    squadCardCount: document.querySelectorAll('[data-match-manager-card]').length,
    teamListCardCount: document.querySelectorAll('[data-match-squad-card]').length,
    visibleText: document.body?.innerText || ''
  }));

  console.log(JSON.stringify(result, null, 2));
  await browser.close();
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});