import { type ClientSchema, a, defineData } from '@aws-amplify/backend'

const schema = a.schema({
  PlayerState: a.model({
    twitchUserId: a.string().required(),
    wallet: a.float().required(),
    cargoCapacity: a.float().required(),
    inventoryJson: a.string().required(),
    workOrdersJson: a.string().required(),
    revision: a.integer().required(),
  }).authorization([a.allow.owner()]),
})
export type Schema = ClientSchema<typeof schema>
export const data = defineData({ schema, authorizationModes: { defaultAuthorizationMode: 'userPool' } })
