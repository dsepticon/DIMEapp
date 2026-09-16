// Offline only: never performs AWS writes. Inputs are verified snapshots/resource outputs.
import { readFileSync, writeFileSync } from 'node:fs';
const [snapshot, functionArn, headersPolicyId, cachePolicyId, output] = process.argv.slice(2);
if (
  !output ||
  !/^arn:aws:cloudfront::861738068626:function\/[A-Za-z0-9_-]+$/.test(functionArn ?? '') ||
  ![headersPolicyId, cachePolicyId].every((id) => /^[a-f0-9-]{36}$/.test(id ?? ''))
)
  throw Error('Supply verified snapshot, actual function ARN, headers and cache policy IDs, output.');
const original = JSON.parse(readFileSync(snapshot, 'utf8'));
const config = structuredClone(original.DistributionConfig);
if (
  config.Aliases.Items?.join() !== 'destroyaindustriesminingextension.com' ||
  config.CacheBehaviors.Quantity !== 0 ||
  config.Origins.Quantity !== 1
)
  throw Error('Unreviewed distribution drift.');
const old = structuredClone(config.DefaultCacheBehavior);
const associations = { Quantity: 1, Items: [{ EventType: 'viewer-request', FunctionARN: functionArn }] };
const behavior = (PathPattern, methods) => ({
  ...structuredClone(old),
  PathPattern,
  ViewerProtocolPolicy: 'redirect-to-https',
  Compress: true,
  CachePolicyId: cachePolicyId,
  FunctionAssociations: associations,
  AllowedMethods: {
    Quantity: methods.length,
    Items: methods,
    CachedMethods: { Quantity: 2, Items: ['GET', 'HEAD'] },
  },
});
const game = behavior('/game/*', ['GET', 'HEAD']);
game.ResponseHeadersPolicyId = headersPolicyId;
const denied = ['/api/v4/state', '/api/v4/actions', '/api/v4/profile/reset', '/api/v4/content/convert'];
config.CacheBehaviors = {
  Quantity: 5,
  Items: [
    game,
    ...denied.map((path) => behavior(path, ['GET', 'HEAD', 'OPTIONS', 'PUT', 'PATCH', 'POST', 'DELETE'])),
  ],
};
// Cookies/query/header forwarding is disabled by the scoped cache policy; no origin-request policy.
for (const b of config.CacheBehaviors.Items) {
  delete b.ForwardedValues;
  delete b.OriginRequestPolicyId;
  delete b.MinTTL;
  delete b.MaxTTL;
  delete b.DefaultTTL;
}
// Everything outside the ordered behaviors, including default document/errors/origins, stays identical.
writeFileSync(
  output,
  JSON.stringify(
    {
      reviewOnly: true,
      expectedDistributionId: 'EC269D02M2JLD',
      expectedETag: original.ETag,
      DistributionConfig: config,
    },
    null,
    2,
  ) + '\n',
);
