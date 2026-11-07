'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { fetchTMDBSearchResponse } = require('../tmdb-auth');

test('uses the TMDB read token when it is accepted', async () => {
  const requests = [];
  const result = await fetchTMDBSearchResponse('https://api.themoviedb.org/3/search/multi?query=hero', {
    token: 'test-read-token', apiKey: 'test-api-key', fetchImpl: async (url, options) => {
      requests.push({ url: new URL(url), options });
      return { status: 200 };
    }
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.authMode, 'bearer');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].options.headers.Authorization, 'Bearer test-read-token');
  assert.equal(requests[0].url.searchParams.has('api_key'), false);
});

test('falls back from a rejected read token to the configured API key once', async () => {
  const requests = [];
  const result = await fetchTMDBSearchResponse('https://api.themoviedb.org/3/search/multi?query=hero', {
    token: 'expired-read-token', apiKey: 'valid-api-key', fetchImpl: async (url, options) => {
      requests.push({ url: new URL(url), options });
      return { status: requests.length === 1 ? 401 : 200 };
    }
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.authMode, 'api-key');
  assert.equal(requests.length, 2);
  assert.equal(requests[1].url.searchParams.get('api_key'), 'valid-api-key');
  assert.equal(Object.hasOwn(requests[1].options.headers, 'Authorization'), false);
});

test('does not retry an API key that TMDB rejects', async () => {
  let requests = 0;
  const result = await fetchTMDBSearchResponse('https://api.themoviedb.org/3/search/multi?query=hero', {
    apiKey: 'invalid-api-key', authMode: 'api-key', fetchImpl: async () => {
      requests++;
      return { status: 401 };
    }
  });
  assert.equal(result.response.status, 401);
  assert.equal(result.authMode, 'api-key');
  assert.equal(requests, 1);
});
