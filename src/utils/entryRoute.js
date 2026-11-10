/**
 * Reflect currently uses app-local tabs, not path-based routes.
 * Keep the exact root route and harmless ChatGPT campaign path which was
 * historically emitted as /utm_source=... instead of ?utm_source=...
 * Unknown navigations get a branded 404, not an empty app.
 */
export function isReflectEntryPath(pathname) {
  return pathname === '/' || pathname === '/index.html' ||
    /^\/utm_(?:source|medium|campaign)=[a-z0-9._-]{1,80}$/i.test(pathname);
}
