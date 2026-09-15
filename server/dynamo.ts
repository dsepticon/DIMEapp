import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { PlayerState, stateSchema } from '../shared/schema';
import { Receipt, Store } from './store';
export type DocumentSender = Pick<DynamoDBDocumentClient, 'send'>;
type RevisionedState = { revision: number; saveGeneration?: string };
export class DynamoStore<State extends RevisionedState = PlayerState> implements Store<State> {
  constructor(
    private client: DocumentSender,
    private table: string,
    private parseState: (value: unknown) => State = (value) => stateSchema.parse(value) as unknown as State,
  ) {}
  async read(player: string) {
    const result = await this.client.send(
      new GetCommand({ TableName: this.table, Key: { pk: player, sk: 'STATE' }, ConsistentRead: true }),
    );
    return result.Item ? this.parseState(result.Item.state) : undefined;
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
    state: State,
    request?: { id: string; receipt: Receipt },
    generationGuard?: string | null,
  ) {
    const generationCondition =
      generationGuard === undefined
        ? ''
        : generationGuard === null
          ? ' AND attribute_not_exists(#state.#generation)'
          : ' AND #state.#generation = :generation';
    const writes = [
      {
        Put: {
          TableName: this.table,
          Item: { pk: player, sk: 'STATE', revision: state.revision, state },
          ConditionExpression:
            (expected === null ? 'attribute_not_exists(pk)' : 'revision = :expected') + generationCondition,
          ...(expected !== null || generationGuard !== undefined
            ? {
                ExpressionAttributeValues: {
                  ...(expected !== null ? { ':expected': expected } : {}),
                  ...(typeof generationGuard === 'string' ? { ':generation': generationGuard } : {}),
                },
              }
            : {}),
          ...(generationGuard !== undefined
            ? { ExpressionAttributeNames: { '#state': 'state', '#generation': 'saveGeneration' } }
            : {}),
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
export function createDynamoStore<State extends RevisionedState = PlayerState>(
  region: string,
  table: string,
  parseState?: (value: unknown) => State,
) {
  return new DynamoStore(
    DynamoDBDocumentClient.from(new DynamoDBClient({ region, maxAttempts: 3 }), {
      marshallOptions: { removeUndefinedValues: true },
    }),
    table,
    parseState,
  );
}
