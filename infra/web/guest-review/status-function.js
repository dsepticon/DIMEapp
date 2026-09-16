// REVIEW ONLY: no publication/association is performed by this file.
// Exact-path, non-identifying guest capability. Never an authentication grant.
function handler(event) {
  var request = event.request;
  // Guest-only deployment: no public web gameplay request reaches persistence.
  // Does not read credentials or alter emergency logout/deletion routing.
  if (request.uri.indexOf('/api/') === 0 || /%|\/\.\.?\/|\/\//.test(request.uri)) {
    return {
      statusCode: 401,
      statusDescription: 'Unauthorized',
      headers: {
        'content-type': { value: 'application/json; charset=utf-8' },
        'cache-control': { value: 'no-store' },
        'x-content-type-options': { value: 'nosniff' }
      },
      body: JSON.stringify({ code: 'UNAUTHORIZED' })
    };
  }
  if (request.method === 'GET' && request.uri === '/auth/status') {
    return {
      statusCode: 200,
      statusDescription: 'OK',
      headers: {
        'content-type': { value: 'application/json; charset=utf-8' },
        'cache-control': { value: 'no-store' },
        'x-content-type-options': { value: 'nosniff' },
        'referrer-policy': { value: 'no-referrer' }
      },
      body: JSON.stringify({
        signInAvailable: false,
        linkingAvailable: false,
        guestDemoAvailable: true,
        guestStorage: 'memory'
      })
    };
  }
  return request;
}
