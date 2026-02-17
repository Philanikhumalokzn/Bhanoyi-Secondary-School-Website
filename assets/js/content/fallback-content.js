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
    }
  }
};
