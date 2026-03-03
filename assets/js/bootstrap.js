import { getPageConfig } from './pages/index.js';
import { loadSiteContent } from './content/content.loader.js';
import { initInlinePublicAdmin } from './admin/inline-public.ts';
import { initGeminiApiTester, initPageEmailForms } from './ui/forms.js';
import { renderSite } from './ui/layout.js';

const bootstrap = async () => {
	const pageKey = document.body.dataset.page || 'home';
	const siteContent = await loadSiteContent();
	if (typeof window !== 'undefined') {
		window.__BHANOYI_SITE_CONTENT__ = siteContent;
	}
	const pageConfig = getPageConfig(siteContent, pageKey);

	renderSite(siteContent, pageConfig);
	initPageEmailForms();
	initGeminiApiTester();
	await initInlinePublicAdmin();
};

bootstrap();
