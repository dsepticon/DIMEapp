export type OreId = 'taranite' | 'gold' | 'quantanium'
export type Inventory = Record<OreId, number>

export interface OreDefinition { id: OreId; name: string; color: string; sellPrice: number; refinementYield: number }
export interface LocationDefinition { id: string; name: string; image: string; description: string; risk: 'Low' | 'Medium' | 'High'; yields: Inventory }
export interface WorkOrder { id: string; oreId: OreId; rawAmount: number; refinedAmount: number; createdAt: number; readyAt: number; status: 'processing' | 'ready' }
export interface PlayerState { wallet: number; capacity: number; inventory: Inventory; workOrders: WorkOrder[] }

export const ORES: OreDefinition[] = [
  { id: 'taranite', name: 'Taranite', color: '#b05cff', sellPrice: 84, refinementYield: .88 },
  { id: 'gold', name: 'Gold', color: '#ffc94a', sellPrice: 62, refinementYield: .92 },
  { id: 'quantanium', name: 'Quantanium', color: '#54e8ff', sellPrice: 146, refinementYield: .72 },
]

export const LOCATIONS: LocationDefinition[] = [
  { id: 'arccorp', name: 'ArcCorp', image: '/ArcCorp.png', description: 'Industrial belt claims', risk: 'Medium', yields: { taranite: 1.8, gold: 2.4, quantanium: .45 } },
  { id: 'crusader', name: 'Crusader', image: '/Crusader.png', description: 'High-atmosphere fields', risk: 'High', yields: { taranite: 1.1, gold: 1.2, quantanium: 1.2 } },
  { id: 'hurston', name: 'Hurston', image: '/Hurston.png', description: 'Surface extraction zone', risk: 'Low', yields: { taranite: 2.5, gold: 2.1, quantanium: .25 } },
  { id: 'microtech', name: 'MicroTech', image: '/Microtech.png', description: 'Frozen mineral range', risk: 'Medium', yields: { taranite: 2.1, gold: 1.4, quantanium: .65 } },
]

export const DEFAULT_STATE: PlayerState = { wallet: 0, capacity: 32, inventory: { taranite: 0, gold: 0, quantanium: 0 }, workOrders: [] }
const round = (value: number) => Math.round(value * 100) / 100

export function advanceOrders(state: PlayerState, now = Date.now()): PlayerState {
  let changed = false
  const workOrders = state.workOrders.map(order => {
    if (order.status === 'processing' && order.readyAt <= now) { changed = true; return { ...order, status: 'ready' as const } }
    return order
  })
  return changed ? { ...state, workOrders } : state
}

export function normalizeState(value: unknown): PlayerState {
  if (!value || typeof value !== 'object') return DEFAULT_STATE
  const saved = value as Partial<PlayerState>
  const inventory = saved.inventory && typeof saved.inventory === 'object' ? saved.inventory : DEFAULT_STATE.inventory
  return {
    wallet: Number.isFinite(saved.wallet) ? Math.max(0, Number(saved.wallet)) : 0,
    capacity: Number.isFinite(saved.capacity) ? Math.max(1, Number(saved.capacity)) : DEFAULT_STATE.capacity,
    inventory: {
      taranite: Math.max(0, Number(inventory.taranite) || 0),
      gold: Math.max(0, Number(inventory.gold) || 0),
      quantanium: Math.max(0, Number(inventory.quantanium) || 0),
    },
    workOrders: Array.isArray(saved.workOrders) ? saved.workOrders.filter(order => order && ORES.some(ore => ore.id === order.oreId)) : [],
  }
}

export function mineAtLocation(state: PlayerState, locationId: string) {
  const location = LOCATIONS.find(item => item.id === locationId) ?? LOCATIONS[0]
  const used = Object.values(state.inventory).reduce((sum, value) => sum + value, 0)
  const room = Math.max(0, state.capacity - used)
  if (!room) return { state, message: 'Cargo hold is full. Refine some ore before mining again.' }
  const inventory = { ...state.inventory }
  let mined = 0
  for (const ore of ORES) {
    const amount = Math.min(room - mined, round(location.yields[ore.id] * (.75 + Math.random() * .5)))
    if (amount <= 0) break
    inventory[ore.id] = round(inventory[ore.id] + amount)
    mined = round(mined + amount)
  }
  return { state: { ...state, inventory }, message: `Recovered ${formatAmount(mined)} SCU from ${location.name}.` }
}

export function createWorkOrder(state: PlayerState, oreId: string, amount: number, now = Date.now()): PlayerState {
  const ore = ORES.find(item => item.id === oreId)
  if (!ore) throw new Error('Select a valid ore.')
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Enter a valid SCU amount.')
  if ((state.inventory[ore.id] ?? 0) < amount) throw new Error(`Not enough ${ore.name} in cargo.`)
  const inventory = { ...state.inventory, [ore.id]: round(state.inventory[ore.id] - amount) }
  const order: WorkOrder = { id: `${now}-${Math.random().toString(36).slice(2, 8)}`, oreId: ore.id, rawAmount: round(amount), refinedAmount: round(amount * ore.refinementYield), createdAt: now, readyAt: now + Math.max(60_000, amount * 30_000), status: 'processing' }
  return { ...state, inventory, workOrders: [...state.workOrders, order] }
}

export function sellWorkOrder(state: PlayerState, orderId: string) {
  const current = advanceOrders(state)
  const order = current.workOrders.find(item => item.id === orderId)
  if (!order || order.status !== 'ready') return { state: current, message: 'That work order is not ready to sell.' }
  const ore = ORES.find(item => item.id === order.oreId)!
  const proceeds = round(order.refinedAmount * ore.sellPrice)
  return { state: { ...current, wallet: round(current.wallet + proceeds), workOrders: current.workOrders.filter(item => item.id !== orderId) }, message: `Sold this ${ore.name} order for ¤ ${formatAmount(proceeds)}.` }
}

function formatAmount(value: number) { return value.toFixed(2).replace(/\.00$/, '') }
