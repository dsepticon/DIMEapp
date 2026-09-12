import { TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { PlayerState, stateSchema } from '../shared/schema';
import { DocumentSender } from './dynamo';

// Prepared for an approved lazy migration reader. The Lambda never imports this module.
// The source record remains untouched; a global source receipt prevents a second destination.
export async function commitMigration(
  client: DocumentSender,
  table: string,
  player: string,
  sourceDigest: string,
  sourceVersion: number,
  candidate: PlayerState,
) {
  if (
    !/^PLAYER#v1#[a-f0-9]{64}$/.test(player) ||
    !/^[a-f0-9]{64}$/.test(sourceDigest) ||
    !Number.isSafeInteger(sourceVersion) ||
    sourceVersion < 0
  )
    throw new Error('Invalid migration identity or source version.');
  const state = stateSchema.parse(candidate);
  if (state.schemaVersion !== 2 || state.revision !== 0) throw new Error('Invalid migration candidate.');
  try {
    await client.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: table,
              Item: { pk: player, sk: 'STATE', revision: 0, state },
              ConditionExpression: 'attribute_not_exists(pk)',
            },
          },
          {
            Put: {
              TableName: table,
              Item: { pk: player, sk: 'MIGRATION#v1#' + sourceDigest, sourceVersion },
              ConditionExpression: 'attribute_not_exists(pk)',
            },
          },
          {
            Put: {
              TableName: table,
              Item: { pk: 'LEGACY#v1#' + sourceDigest, sk: 'MIGRATION#v1', player, sourceVersion },
              ConditionExpression: 'attribute_not_exists(pk)',
            },
          },
        ],
      }),
    );
    return true;
  } catch (error) {
    if (error instanceof Error && error.name === 'TransactionCanceledException') {
      const reasons = 'CancellationReasons' in error ? error.CancellationReasons : undefined;
      if (Array.isArray(reasons) && reasons.some((reason) => reason?.Code === 'ConditionalCheckFailed'))
        return false;
    }
    throw error;
  }
}
