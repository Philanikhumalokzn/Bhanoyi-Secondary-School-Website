import { fallbackSiteContent } from './fallback-content.js';
import { applyRemoteOverrides } from './remote-overrides.ts';

const getByPath = (source, path) => {
  const parts = path.split('.');
  return parts.reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : ''), source);
};

const replaceTokens = (value, source) => {
  if (typeof value === 'string') {
    return value.replace(/\{\{\s*([^\}]+)\s*\}\}/g, (_, tokenPath) => {
      const resolved = getByPath(source, tokenPath.trim());
      return resolved === '' ? '' : String(resolved);
    });
  }

  if (Array.isArray(value)) {
    return value.map((entry) => replaceTokens(entry, source));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [key, replaceTokens(nestedValue, source)])
    );
  }

  return value;
};

const resolvePlaceholders = (siteContent) => replaceTokens(siteContent, siteContent);

const fetchJsonContent = async () => {
  const response = await fetch('/content/site-content.json', { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Content load failed with status ${response.status}`);
  }
  return response.json();
};

export const loadSiteContent = async () => {
  try {
    const content = await fetchJsonContent();
    const resolved = resolvePlaceholders(content);
    return applyRemoteOverrides(resolved);
  } catch {
    const resolved = resolvePlaceholders(fallbackSiteContent);
    return applyRemoteOverrides(resolved);
  }
};
