import { getPageConfig } from './pages/index.js';
import { loadSiteContent } from './content/content.loader.js';
import { renderSite } from './ui/layout.js';

const bootstrap = async () => {
	const pageKey = document.body.dataset.page || 'home';
	const siteContent = await loadSiteContent();
	const pageConfig = getPageConfig(siteContent, pageKey);

	renderSite(siteContent, pageConfig);
};

bootstrap();
