import { getPageConfig } from './pages/index.js';
import { loadSiteContent } from './content/content.loader.js';
import { initGlobalLocalStorageRemotePersistence } from './content/localstore.remote.js';
import { initInlinePublicAdmin } from './admin/inline-public.ts';
import { initGeminiApiTester, initPageEmailForms } from './ui/forms.js';
import { renderSite } from './ui/layout.js';

const bootstrap = async () => {
	await initGlobalLocalStorageRemotePersistence();
	const pageKey = document.body.dataset.page || 'home';
	const siteContent = await loadSiteContent();
	if (typeof window !== 'undefined') {
		window.__BHANOYI_SITE_CONTENT__ = siteContent;
	}
	const pageConfig = getPageConfig(siteContent, pageKey);

	await renderSite(siteContent, pageConfig);
	initPageEmailForms();
	initGeminiApiTester();
	await initInlinePublicAdmin();
};

bootstrap();
