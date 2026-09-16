// Scoped review: associated only with /game/* and four exact web API paths.
// Never reads cookies, headers, identities, authorization codes or query strings.
function handler(event) {
  var request = event.request;
  // Outside /game/, this function is associated ONLY with the four literal API-denial behaviors.
  // Fail closed even if CloudFront matched a normalized URI but passes an alternate spelling.
  if (request.uri.indexOf('/game/') !== 0) {
    return response(401, 'Unauthorized', { code: 'UNAUTHORIZED' });
  }
  if (request.uri === '/game/status' && request.method === 'GET') {
    return response(200, 'OK', {
      signInAvailable: false, linkingAvailable: false,
      guestDemoAvailable: true, guestStorage: 'memory'
    });
  }
  if (request.uri === '/game/') request.uri = '/game/index.html';
  var files = ['/game/index.html', '/game/0.9.0/assets/index-BPyjZOOz.css', '/game/0.9.0/assets/index-DHu8VPJb.js'];
  if (files.indexOf(request.uri) === -1) return response(404, 'Not Found', { code: 'NOT_FOUND' });
  return request;
}
function response(statusCode, statusDescription, body) {
  return {
    statusCode: statusCode, statusDescription: statusDescription,
    headers: {
      'content-type': { value: 'application/json; charset=utf-8' },
      'cache-control': { value: 'no-store' },
      'x-content-type-options': { value: 'nosniff' },
      'referrer-policy': { value: 'no-referrer' }
    },
    body: JSON.stringify(body)
  };
}
