import { formatSmokeFailure } from './XaiDevSmoke';

test('shows upstream xAI status separately from local proxy 502', () => {
  const value = formatSmokeFailure(502, {
    error: 'xai-http-error',
    providerHttpStatus: 403,
    message: 'private provider diagnostics must never be rendered'
  });
  expect(value).toContain('Локальный proxy: HTTP 502');
  expect(value).toContain('Статус xAI upstream: HTTP 403');
  expect(value).not.toContain('private provider diagnostics');
  expect(value).toContain('не запускается автоматически');
});

test.each([400, 401, 403, 404, 422, 429, 500, 503])(
  'renders upstream HTTP %s as status only',
  status => {
    const value = formatSmokeFailure(502, {
      error: 'xai-http-error', providerHttpStatus: status,
      providerBody: { apiKey: 'do-not-leak' }
    });
    expect(value).toContain('Статус xAI upstream: HTTP ' + status);
    expect(value).not.toContain('do-not-leak');
  }
);

test('does not invent a provider status for transport errors or malformed payloads', () => {
  for (const payload of [
    { error: 'xai-transport-or-response-invalid', providerHttpStatus: 401 },
    { error: 'xai-http-error', providerHttpStatus: '403' },
    { error: 'xai-http-error', providerHttpStatus: -1 },
    { error: 'untrusted provider: KEY=PRIVATE', providerHttpStatus: 403 },
    null
  ]) {
    const value = formatSmokeFailure(502, payload);
    expect(value).toContain('Локальный proxy: HTTP 502');
    expect(value).not.toContain('Статус xAI upstream');
    expect(value).not.toContain('KEY=PRIVATE');
  }
});
