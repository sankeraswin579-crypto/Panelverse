'use strict';

async function fetchTMDBSearchResponse(endpoint, {
  token = '',
  apiKey = '',
  authMode = token ? 'bearer' : 'api-key',
  fetchImpl = fetch
} = {}) {
  const request = useBearer => {
    const url = new URL(endpoint);
    const headers = { Accept: 'application/json' };
    if (useBearer) headers.Authorization = `Bearer ${token}`;
    else if (apiKey) url.searchParams.set('api_key', apiKey);
    return fetchImpl(url, { headers, signal: AbortSignal.timeout(8000) });
  };

  let mode = authMode === 'bearer' && token ? 'bearer' : 'api-key';
  let response = await request(mode === 'bearer');
  if ((response.status === 401 || response.status === 403) && mode === 'bearer' && apiKey) {
    mode = 'api-key';
    response = await request(false);
  }
  return { response, authMode: mode };
}

module.exports = { fetchTMDBSearchResponse };
