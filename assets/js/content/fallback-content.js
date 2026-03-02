export const fallbackSiteContent = {
  school: {
    shortName: 'BS',
    name: 'Bhanoyi Secondary School',
    logoPath: '/branding/bhanoyi-logo.png',
    tagline: 'Empowering learners for life and leadership.',
    phone: '+27 (0)00 000 0000',
    email: 'info@bhanoyisecondary.co.za',
    address: '[School Address], KwaZulu-Natal, South Africa',
    hours: ['Mon–Fri: 07:30 – 15:30', 'Office closes at 16:00']
  },
  navigation: [
    { key: 'home', label: 'Home', href: 'index.html' },
    { key: 'about', label: 'About', href: 'about.html' },
    { key: 'academics', label: 'Academics', href: 'academics.html' },
    { key: 'sports', label: 'Sports', href: 'sports.html' },
    { key: 'calendar', label: 'Calendar', href: 'calendar.html' },
    { key: 'admissions', label: 'Admissions', href: 'admissions.html' },
    { key: 'enrollment', label: 'Enrollment', href: 'enrollment.html', adminOnly: true },
    { key: 'policies', label: 'Policies', href: 'policies.html' },
    { key: 'contact', label: 'Contact', href: 'contact.html' }
  ],
  pages: {
    home: {
      key: 'home',
      metaTitle: 'Bhanoyi Secondary School',
      metaDescription:
        'Bhanoyi Secondary School official website: admissions, news, events, academics, policies, and contact information.',
      hero: {
        eyebrow: 'Welcome to',
        title: 'Bhanoyi Secondary School',
        lead: 'Building future-ready learners through academic excellence, discipline, and community values.'
      },
      sections: []
    },
    sports: {
      key: 'sports',
      metaTitle: 'Sports | Bhanoyi Secondary School',
      metaDescription:
        'Sports programmes, teams, fixtures, and learner development through athletics at Bhanoyi Secondary School.',
      hero: {
        eyebrow: 'Athletics and teamwork',
        title: 'Sports',
        lead: 'We use sport to build discipline, teamwork, leadership, and school pride across all grades.'
      },
      sections: [
        {
          type: 'match-log',
          title: 'Follow Live Match Events',
          sectionKey: 'sports_match_log',
          body: 'Follow football or netball match events as they happen, with score updates shown live.',
          sport: 'Football / Netball',
          competition: 'Inter-House Friendly',
          venue: 'Main Field',
          houseOptions: [
            { id: 'house_1', name: 'House 1' },
            { id: 'house_2', name: 'House 2' },
            { id: 'house_3', name: 'House 3' },
            { id: 'house_4', name: 'House 4' },
            { id: 'house_5', name: 'House 5' }
          ],
          leftTeamId: 'house_1',
          rightTeamId: 'house_2',
          initialScores: {
            house_1: 0,
            house_2: 0,
            house_3: 0,
            house_4: 0,
            house_5: 0
          },
          eventTypes: [
            { key: 'goal', label: 'Goal', icon: '⚽', scoreFor: 'self', allowAssist: true, playerLabel: 'Scorer' },
            { key: 'penalty_goal', label: 'Penalty Goal', icon: '⚽', scoreFor: 'self', playerLabel: 'Scorer' },
            { key: 'own_goal', label: 'Own Goal', icon: '⚽', scoreFor: 'opponent', playerLabel: 'Player' },
            { key: 'yellow_card', label: 'Yellow Card', icon: '🟨', scoreFor: 'none', playerLabel: 'Booked Player' },
            { key: 'red_card', label: 'Red Card', icon: '🟥', scoreFor: 'none', playerLabel: 'Sent-off Player' },
            { key: 'injury', label: 'Injury', icon: '🩹', scoreFor: 'none', playerLabel: 'Injured Player' },
            { key: 'substitution', label: 'Substitution', icon: '🔁', scoreFor: 'none', playerLabel: 'Player' }
          ]
        },
        {
          type: 'fixture-creator',
          title: 'View Season Fixtures',
          sectionKey: 'sports_fixture_creator',
          body: 'View the full home-and-away round-robin schedule for the selected houses.',
          sport: 'Football / Netball',
          competition: 'Inter-House League',
          venue: 'Main Field',
          houseOptions: [
            { id: 'house_1', name: 'House 1' },
            { id: 'house_2', name: 'House 2' },
            { id: 'house_3', name: 'House 3' },
            { id: 'house_4', name: 'House 4' },
            { id: 'house_5', name: 'House 5' }
          ]
        }
      ]
    },
    calendar: {
      key: 'calendar',
      metaTitle: 'School Calendar | Bhanoyi Secondary School',
      metaDescription: 'School calendar with fixtures and events for Bhanoyi Secondary School.',
      hero: {
        eyebrow: 'Schedule and events',
        title: 'School Calendar',
        lead: 'View school events, match dates, and key activities in one place.'
      },
      sections: [
        {
          type: 'calendar',
          title: 'View School Calendar',
          sectionKey: 'school_calendar',
          body: 'Browse school events, match dates, and key activities in one place.',
          fixtureSectionKey: 'sports_fixture_creator'
        }
      ]
    },
    enrollment: {
      key: 'enrollment',
      metaTitle: 'Enrollment | Bhanoyi Secondary School',
      metaDescription: 'Admin enrollment workspace for managing intake, records, and enrolment workflow.',
      hero: {
        eyebrow: 'Admissions management',
        title: 'Enrollment',
        lead: 'Manage learner enrollment workflow, records, and checklist progress.'
      },
      sections: [
        {
          type: 'enrollment-manager',
          sectionKey: 'enrollment_manager',
          title: 'Manage Enrollment',
          body: 'Manage classes per grade (6 to 12).'
        }
      ]
    }
  }
};
