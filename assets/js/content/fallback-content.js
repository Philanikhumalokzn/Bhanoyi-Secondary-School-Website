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
    { key: 'admissions', label: 'Admissions', href: 'admissions.html' },
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
        lead: 'Building future-ready learners through academic excellence, discipline, and community values.',
        cta: [
          { label: 'Apply / Enquire', href: 'admissions.html', variant: 'primary' },
          { label: 'Contact School', href: 'contact.html', variant: 'secondary' }
        ]
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
        lead: 'We use sport to build discipline, teamwork, leadership, and school pride across all grades.',
        cta: [{ label: 'Contact School', href: 'contact.html', variant: 'secondary' }]
      },
      sections: [
        {
          type: 'match-log',
          title: 'Live Match Event Log',
          sectionKey: 'sports_match_log',
          body: 'Sports committee can log live football or netball match events as they happen.',
          sport: 'Football / Netball',
          competition: 'Inter-House Friendly',
          venue: 'Main Field',
          teams: [
            { id: 'cheetahs', name: 'Cheetahs' },
            { id: 'jaguars', name: 'Jaguars' }
          ],
          initialScores: {
            cheetahs: 0,
            jaguars: 0
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
        }
      ]
    }
  }
};
