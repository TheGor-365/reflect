import { currentTabFromLocation, pushTabToHistory, tabFromSearch } from './tabRoute';

beforeEach(() => {
  window.history.replaceState(null, '', '/');
});

test('accepts only known public UI sections; unknown values do not open private routes', () => {
  expect(tabFromSearch('?view=aiSettings')).toBe('aiSettings');
  expect(tabFromSearch('?view=sessionSchema')).toBe('sessionSchema');
  expect(tabFromSearch('?view=dashboard')).toBe('dashboard');
  expect(tabFromSearch('?view=malicious')).toBe('diary');
  expect(tabFromSearch('?view=__proto__')).toBe('diary');
  expect(tabFromSearch('')).toBe('diary');
});

test('preserves legacy campaign pathname and all existing query parameters', () => {
  window.history.replaceState(null, '', '/utm_source=chatgpt.com?utm_medium=review#reflect-main');
  expect(pushTabToHistory('aiSettings')).toBe(true);
  expect(window.location.pathname).toBe('/utm_source=chatgpt.com');
  expect(window.location.search).toContain('utm_medium=review');
  expect(window.location.search).toContain('view=aiSettings');
  expect(window.location.hash).toBe('#reflect-main');
  expect(currentTabFromLocation()).toBe('aiSettings');
});

test('returning to diary removes only the view query parameter', () => {
  window.history.replaceState(null, '', '/?campaign=reflect&view=aiSettings');
  expect(pushTabToHistory('diary')).toBe(true);
  expect(window.location.search).toBe('?campaign=reflect');
  expect(currentTabFromLocation()).toBe('diary');
});

test('rejects invalid tabs without altering the URL', () => {
  window.history.replaceState(null, '', '/?utm_source=test');
  const before = window.location.href;
  expect(pushTabToHistory('owner-uid')).toBe(false);
  expect(window.location.href).toBe(before);
});

test('Dashboard deep link preserves public route across remount and browser navigation',()=>{
  window.history.replaceState(null,'','/?utm_source=qa&view=dashboard');
  expect(currentTabFromLocation()).toBe('dashboard');
  expect(pushTabToHistory('sessionSchema')).toBe(true);
  expect(currentTabFromLocation()).toBe('sessionSchema');
  expect(pushTabToHistory('dashboard')).toBe(true);
  expect(window.location.search).toContain('utm_source=qa');
  expect(currentTabFromLocation()).toBe('dashboard');
});
