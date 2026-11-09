/**
 * Reflect's email-action language follows the language of the application,
 * NEVER physical location, nationality or the browser's IP address.
 * Until the three-language UI ships, the product's default is Russian.
 *
 * The forthcoming language switcher persists BCP-47 preference under
 * reflect-locale; future account sync supplies the persisted account locale
 * as an explicit argument. Authentication's SDK localizes standard Firebase
 * verification/password-reset/revert emails via auth.languageCode.
 */
export const REFLECT_LOCALE_STORAGE_KEY = 'reflect-locale';
export const DEFAULT_EMAIL_LOCALE = 'ru';

export function resolveEmailLocale(preference) {
  if (typeof preference !== 'string') return DEFAULT_EMAIL_LOCALE;
  const locale = preference.trim().replace('_', '-').toLowerCase();
  // Accept valid 2–3 letter base tags, optionally with a two-letter region.
  // The final list of three supported product languages is a product decision.
  return /^[a-z]{2,3}(?:-[a-z]{2})?$/.test(locale)
    ? locale : DEFAULT_EMAIL_LOCALE;
}

/**
 * Explicit account preference > saved app choice > Russian fallback.
 * A caller can pass null to use the on-device app setting. Never auto-detect
 * IP geolocation or override the user's stored preference with browser locale.
 */
export function applyAuthEmailLocale(authClient, accountLocale = null) {
  let selectedLocale = accountLocale;
  if (!selectedLocale) {
    try {
      selectedLocale = typeof window !== 'undefined'
        ? window.localStorage.getItem(REFLECT_LOCALE_STORAGE_KEY)
        : null;
    } catch { /* localStorage may be blocked; Russian fallback is safe. */ }
  }
  authClient.languageCode = resolveEmailLocale(selectedLocale);
  return authClient.languageCode;
}
