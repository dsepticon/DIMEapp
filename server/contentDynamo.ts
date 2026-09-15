/** Opt-in version-aware store for a reviewed content cutover; never called by the current handler. */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { DynamoStore } from './dynamo';
import { parseVersionedContent, type VersionedContentState } from './contentConversion';

export function createVersionedContentStore(region: string, table: string) {
  return new DynamoStore<VersionedContentState>(
    DynamoDBDocumentClient.from(new DynamoDBClient({ region, maxAttempts: 3 }), {
      marshallOptions: { removeUndefinedValues: true },
    }),
    table,
    parseVersionedContent,
  );
}
