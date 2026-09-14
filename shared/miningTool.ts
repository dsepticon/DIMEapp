// The existing equipment key remains stable for v2 saves and older clients.
// The display name identifies its starter role in the expanded RPG.
export const BASIC_MINING_TOOL = {
  id: 'Hand mining tool',
  name: 'Basic Mining Tool',
  tier: 1,
  laserPower: 0.18,
  chargeResponse: 0.68,
  stabilityAssistance: 0.12,
  optimalZoneAssistance: 0.04,
  collectionCapability: true,
  rangeTiles: 2.2,
  heatPerSecond: 0.2,
  cooldownPerSecond: 0.35,
  supportedNodeSizes: [1, 2, 3] as const,
  miningType: 'Hand',
} as const;

export type MiningTool = Readonly<{
  id: string;
  name: string;
  tier: number;
  laserPower: number;
  chargeResponse: number;
  stabilityAssistance: number;
  optimalZoneAssistance: number;
  collectionCapability: boolean;
  rangeTiles: number;
  heatPerSecond: number;
  cooldownPerSecond: number;
  supportedNodeSizes: readonly number[];
  miningType: 'Hand' | 'Roc';
}>;

export const MINING_TOOLS: Readonly<Record<string, MiningTool>> = {
  [BASIC_MINING_TOOL.id]: BASIC_MINING_TOOL,
};
