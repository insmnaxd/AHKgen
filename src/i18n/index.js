export const DEFAULT_LANGUAGE = "en";
export const SUPPORTED_LANGUAGES = ["en", "pl", "es", "de", "fr", "it", "pt"];

const TRANSLATION_FILES = {
  en: "./i18n/en.json",
  pl: "./i18n/pl.json",
  es: "./i18n/es.json",
  de: "./i18n/de.json",
  fr: "./i18n/fr.json",
  it: "./i18n/it.json",
  pt: "./i18n/pt.json",
};

export function resolveSupportedLanguage(locale) {
  if (!locale) return null;
  const normalized = locale.toLowerCase();
  if (SUPPORTED_LANGUAGES.includes(normalized)) return normalized;

  const base = normalized.split("-")[0];
  return SUPPORTED_LANGUAGES.includes(base) ? base : null;
}

export function detectSystemLanguage(navigatorLike) {
  const candidates =
    Array.isArray(navigatorLike.languages) && navigatorLike.languages.length > 0
      ? navigatorLike.languages
      : [navigatorLike.language];

  for (const locale of candidates) {
    const supported = resolveSupportedLanguage(locale);
    if (supported) return supported;
  }

  return DEFAULT_LANGUAGE;
}

export function interpolate(template, values = {}) {
  return template.replace(/\{(\w+)\}/g, (_, name) => values[name] ?? `{${name}}`);
}

export function createI18n({ fetchFn = fetch, navigatorLike = navigator } = {}) {
  const translations = {};
  let currentLanguage = DEFAULT_LANGUAGE;

  async function load() {
    await Promise.all(
      Object.entries(TRANSLATION_FILES).map(async ([language, filePath]) => {
        const response = await fetchFn(filePath);
        if (!response.ok) {
          throw new Error(`Could not load translation file ${filePath}: ${response.status}`);
        }
        translations[language] = await response.json();
      })
    );
  }

  function t(key, values = {}) {
    const template =
      translations[currentLanguage]?.[key] ??
      translations[DEFAULT_LANGUAGE]?.[key] ??
      key;
    return interpolate(template, values);
  }

  function setLanguage(language) {
    currentLanguage = resolveSupportedLanguage(language) || DEFAULT_LANGUAGE;
    return currentLanguage;
  }

  function getLanguage() {
    return currentLanguage;
  }

  function detectLanguage() {
    return detectSystemLanguage(navigatorLike);
  }

  function applyToDocument(documentLike) {
    documentLike.documentElement.lang = currentLanguage;

    documentLike.querySelectorAll("[data-i18n]").forEach((element) => {
      element.textContent = t(element.dataset.i18n);
    });
    documentLike.querySelectorAll("[data-i18n-title]").forEach((element) => {
      element.title = t(element.dataset.i18nTitle);
    });
    documentLike.querySelectorAll("[data-i18n-aria-label]").forEach((element) => {
      element.setAttribute("aria-label", t(element.dataset.i18nAriaLabel));
    });
    documentLike.querySelectorAll("[data-i18n-placeholder]").forEach((element) => {
      element.placeholder = t(element.dataset.i18nPlaceholder);
    });
  }

  return {
    load,
    t,
    setLanguage,
    getLanguage,
    detectLanguage,
    applyToDocument,
  };
}
