export const getPageConfig = (siteContent, key) => {
  const pages = siteContent.pages || {};
  return pages[key] || pages.home;
};
