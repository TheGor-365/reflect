/**
 * Persist only a public UI section in the browser URL.
 * Do not put an account UID, session ID, diary text or consent scope here.
 * React still owns screen rendering; this is not a data-access policy.
 */
export const PUBLIC_TABS = Object.freeze([
  'dashboard', 'diary', 'sessions', 'recommendations', 'goals', 'sessionSchema', 'mindspace', 'aiSettings'
]);

const isPublicTab = value => PUBLIC_TABS.includes(value);

export function tabFromSearch(search = '') {
  const requested = new URLSearchParams(search).get('view');
  return isPublicTab(requested) ? requested : 'diary';
}

export function currentTabFromLocation() {
  if (typeof window === 'undefined') return 'diary';
  return tabFromSearch(window.location.search);
}

export function pushTabToHistory(tab) {
  if (!isPublicTab(tab) || typeof window === 'undefined') return false;

  // Preserve the existing path, marketing parameters, and in-page anchors.
  const next = new URL(window.location.href);
  if (tab === 'diary') next.searchParams.delete('view');
  else next.searchParams.set('view', tab);

  const target = `${next.pathname}${next.search}${next.hash}`;
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (target !== current) {
    window.history.pushState(window.history.state, '', target);
  }
  return true;
}
