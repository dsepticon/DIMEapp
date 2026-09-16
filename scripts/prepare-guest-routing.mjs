// Offline review generator only. Never calls AWS or writes remote configuration.
import { readFileSync, writeFileSync } from 'node:fs';
const [snapshot, functionArn, headersPolicyId, output] = process.argv.slice(2);
if (
  !snapshot ||
  !output ||
  !/^arn:aws:cloudfront::861738068626:function\/[A-Za-z0-9_-]+$/.test(functionArn ?? '') ||
  !/^[a-f0-9-]{36}$/.test(headersPolicyId ?? '')
)
  throw Error('Supply a verified distribution snapshot and actual reviewed auxiliary resource outputs.');
const original = JSON.parse(readFileSync(snapshot, 'utf8'));
const config = structuredClone(original.DistributionConfig);
if (
  config.Aliases.Items?.join() !== 'destroyaindustriesminingextension.com' ||
  config.CacheBehaviors.Quantity !== 0 ||
  config.Origins.Quantity !== 1
)
  throw Error('Unreviewed distribution drift.');
const old = structuredClone(config.DefaultCacheBehavior);
const disabled = '4135ea2d-6df8-44a3-9df3-4b5a84be39ad';
const optimized = '658327ea-f89d-4fab-a63d-7e88639e58f6';
const origin = (Id, DomainName, OriginPath) => ({
  Id,
  DomainName,
  OriginPath,
  CustomHeaders: { Quantity: 0 },
  CustomOriginConfig: {
    HTTPPort: 80,
    HTTPSPort: 443,
    OriginProtocolPolicy: 'https-only',
    OriginSslProtocols: { Quantity: 1, Items: ['TLSv1.2'] },
    OriginReadTimeout: 30,
    OriginKeepaliveTimeout: 5,
  },
  ConnectionAttempts: 3,
  ConnectionTimeout: 10,
  OriginShield: { Enabled: false },
  OriginAccessControlId: '',
});
config.Origins.Items.push(
  origin('guest-static-https', 's3.us-west-2.amazonaws.com', '/destroyaindustriesminingextension.com'),
  origin('existing-staging-api', 't2la0784p6.execute-api.us-east-2.amazonaws.com', '/staging'),
);
config.Origins.Quantity = config.Origins.Items.length;
config.DefaultRootObject = 'index.html';
config.DefaultCacheBehavior = {
  ...old,
  TargetOriginId: 'guest-static-https',
  CachePolicyId: disabled,
  ResponseHeadersPolicyId: headersPolicyId,
};
const behavior = (PathPattern, extra) => ({
  ...structuredClone(config.DefaultCacheBehavior),
  PathPattern,
  ...extra,
});
const api = {
  TargetOriginId: 'existing-staging-api',
  CachePolicyId: disabled,
  OriginRequestPolicyId: 'b689b0a8-53d0-40ab-baf2-68738e2966ac',
  AllowedMethods: {
    Quantity: 7,
    Items: ['GET', 'HEAD', 'OPTIONS', 'PUT', 'PATCH', 'POST', 'DELETE'],
    CachedMethods: { Quantity: 2, Items: ['GET', 'HEAD'] },
  },
};
config.CacheBehaviors = {
  Quantity: 4,
  Items: [
    { ...old, PathPattern: '/privacy' },
    behavior('/assets/*', { CachePolicyId: optimized }),
    behavior('/auth/*', {
      ...api,
      FunctionAssociations: {
        Quantity: 1,
        Items: [{ EventType: 'viewer-request', FunctionARN: functionArn }],
      },
    }),
    behavior('/api/*', {
      ...api,
      FunctionAssociations: {
        Quantity: 1,
        Items: [{ EventType: 'viewer-request', FunctionARN: functionArn }],
      },
    }),
  ],
};
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
