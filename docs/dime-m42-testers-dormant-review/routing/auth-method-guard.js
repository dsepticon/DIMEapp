// Review only. No logging, credential validation, value inspection or origin mutation.
var routes = {"/auth/login":{"method":"GET","query":["invitation"]},"/auth/callback":{"method":"GET","query":["code","state","error","scope","error_description"]},"/auth/status":{"method":"GET","query":[]},"/auth/session":{"method":"GET","query":["view"]},"/auth/logout":{"method":"POST","query":[]},"/auth/link/intent":{"method":"POST","query":[]},"/auth/link/accept":{"method":"POST","query":[]},"/auth/unlink":{"method":"POST","query":[]},"/auth/delete/intent":{"method":"POST","query":[]},"/auth/delete/resume":{"method":"POST","query":[]}};
function denied(code) {
  return {statusCode:code, headers:{'cache-control':{value:'no-store'},'referrer-policy':{value:'no-referrer'},'content-type':{value:'application/json'}},body:'{"message":"Request unavailable."}'};
}
function handler(event) {
  var request=event.request, rule=routes[request.uri];
  if (!rule) return denied(404);
  if (request.method!==rule.method && request.method!=='OPTIONS') return denied(405);
  var names=Object.keys(request.querystring || {});
  for (var i=0;i<names.length;i++) if (rule.query.indexOf(names[i])<0) return denied(400);
  return request;
}
