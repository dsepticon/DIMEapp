import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { PlayerState, stateSchema } from '../shared/schema';
import { Receipt, Store } from './store';
export type DocumentSender = Pick<DynamoDBDocumentClient, 'send'>;
export class DynamoStore implements Store {
  constructor(
    private client: DocumentSender,
    private table: string,
  ) {}
  async read(player: string) {
    const result = await this.client.send(
      new GetCommand({ TableName: this.table, Key: { pk: player, sk: 'STATE' }, ConsistentRead: true }),
    );
    return result.Item ? stateSchema.parse(result.Item.state) : undefined;
  }
  async receipt(player: string, id: string): Promise<Receipt | undefined> {
    const result = await this.client.send(
      new GetCommand({
        TableName: this.table,
        Key: { pk: player, sk: 'REQUEST#' + id },
        ConsistentRead: true,
      }),
    );
    return result.Item
      ? { fingerprint: String(result.Item.fingerprint), expiresAt: Number(result.Item.expiresAt) }
      : undefined;
  }
  async commit(
    player: string,
    expected: number | null,
    state: PlayerState,
    request?: { id: string; receipt: Receipt },
  ) {
    const writes = [
      {
        Put: {
          TableName: this.table,
          Item: { pk: player, sk: 'STATE', revision: state.revision, state },
          ConditionExpression: expected === null ? 'attribute_not_exists(pk)' : 'revision = :expected',
          ...(expected !== null ? { ExpressionAttributeValues: { ':expected': expected } } : {}),
        },
      },
    ];
    const receiptWrite = request
      ? [
          {
            Put: {
              TableName: this.table,
              Item: { pk: player, sk: 'REQUEST#' + request.id, ...request.receipt },
              ConditionExpression: 'attribute_not_exists(pk)',
            },
          },
        ]
      : [];
    try {
      await this.client.send(new TransactWriteCommand({ TransactItems: [...writes, ...receiptWrite] }));
      return true;
    } catch (error) {
      if (error instanceof Error && error.name === 'TransactionCanceledException') {
        const reasons = 'CancellationReasons' in error ? error.CancellationReasons : undefined;
        if (Array.isArray(reasons) && reasons.some((r) => r?.Code === 'ConditionalCheckFailed')) return false;
      }
      throw error;
    }
  }
}
export function createDynamoStore(region: string, table: string) {
  return new DynamoStore(
    DynamoDBDocumentClient.from(new DynamoDBClient({ region, maxAttempts: 3 }), {
      marshallOptions: { removeUndefinedValues: true },
    }),
    table,
  );
}
