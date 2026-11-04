/**
 * AI calls must be routed through a server-authenticated endpoint.
 * Previous CRA code embedded a Gemini API key into the browser bundle.
 * That endpoint is intentionally NOT carried into Vite.
 *
 * Until the server-side function and rate limits ship, fail visibly without
 * issuing external calls or losing users to an accidental key exposure.
 */
export const getAnalysisFromAI = async () => ({
  error: 'ИИ-сеансы временно недоступны до подключения защищённого серверного API.'
});
