'use client'

import Image from 'next/image'
import { useEffect, useMemo, useState } from 'react'
import styles from './page.module.css'
import { DEFAULT_STATE, LOCATIONS, ORES, OreId, PlayerState, WorkOrder, advanceOrders, createWorkOrder, mineAtLocation, normalizeState, sellWorkOrder } from './game'
import { TwitchSession, connectToTwitch } from './twitch'

type View = 'mine' | 'cargo' | 'refinery'
const SAVE_KEY = 'dime-player-state-v2'
const format = (value: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value)

export default function Home() {
  const [view, setView] = useState<View>('mine')
  const [state, setState] = useState<PlayerState>(DEFAULT_STATE)
  const [session, setSession] = useState<TwitchSession>({ status: 'connecting' })
  const [selectedLocation, setSelectedLocation] = useState(LOCATIONS[0].id)
  const [selectedOre, setSelectedOre] = useState(ORES[0].id)
  const [refineAmount, setRefineAmount] = useState(1)
  const [notice, setNotice] = useState('Select a claim and begin mining.')
  const [ready, setReady] = useState(false)

  useEffect(() => connectToTwitch(setSession), [])
  useEffect(() => {
    const saved = window.localStorage.getItem(SAVE_KEY)
    if (saved) {
      try { setState(advanceOrders(normalizeState(JSON.parse(saved)))) }
      catch { window.localStorage.removeItem(SAVE_KEY) }
    }
    setReady(true)
  }, [])
  useEffect(() => { if (ready) window.localStorage.setItem(SAVE_KEY, JSON.stringify(state)) }, [ready, state])
  useEffect(() => {
    const timer = window.setInterval(() => setState(current => advanceOrders(current)), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const cargoUsed = useMemo(() => Object.values(state.inventory).reduce((total, amount) => total + amount, 0), [state.inventory])
  const selected = ORES.find(ore => ore.id === selectedOre) ?? ORES[0]
  const available = state.inventory[selected.id] ?? 0
  const currentState = advanceOrders(state)

  function mine() { const result = mineAtLocation(state, selectedLocation); setState(result.state); setNotice(result.message) }
  function submitOrder() {
    try { setState(current => createWorkOrder(current, selected.id, refineAmount)); setNotice(`${format(refineAmount)} SCU of ${selected.name} entered refining.`); setView('refinery') }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Unable to create work order.') }
  }
  function sell(order: WorkOrder) { const result = sellWorkOrder(advanceOrders(state), order.id); setState(result.state); setNotice(result.message) }

  return <main className={styles.shell}>
    <header className={styles.header}>
      <div className={styles.brand}><Image src="/DIME icon.png" alt="D.I.M.E." width={52} height={52} priority /><div><strong>D.I.M.E.</strong><span>Destroya Industries Mining Extension</span></div></div>
      <div className={styles.account}><i className={session.status === 'authorized' ? styles.online : styles.demoDot} /><span>{session.status === 'authorized' ? 'Twitch connected' : 'Local simulation'}</span><strong>¤ {format(state.wallet)}</strong></div>
    </header>
    <nav className={styles.nav} aria-label="Mining operations">
      {(['mine', 'cargo', 'refinery'] as View[]).map(item => <button key={item} className={view === item ? styles.active : ''} onClick={() => setView(item)}>{item === 'mine' ? 'Mining' : item === 'cargo' ? 'Cargo' : 'Refinery'}</button>)}
    </nav>
    <section className={styles.status} aria-live="polite">{notice}</section>

    {view === 'mine' && <section className={styles.content}>
      <div className={styles.sectionHeading}><div><p>ACTIVE CONTRACT</p><h1>Choose a mining claim</h1></div><div className={styles.capacity}>{format(cargoUsed)} / {state.capacity} SCU</div></div>
      <div className={styles.locationGrid}>{LOCATIONS.map(location => <button key={location.id} onClick={() => setSelectedLocation(location.id)} className={`${styles.locationCard} ${selectedLocation === location.id ? styles.selected : ''}`}>
        <Image src={location.image} alt="" width={88} height={88} /><span><strong>{location.name}</strong><small>{location.description}</small></span><em>{location.risk} risk</em>
      </button>)}</div>
      <button className={styles.primary} onClick={mine} disabled={cargoUsed >= state.capacity}>{cargoUsed >= state.capacity ? 'Cargo hold full' : 'Run mining operation'}</button>
    </section>}

    {view === 'cargo' && <section className={styles.content}>
      <div className={styles.sectionHeading}><div><p>SHIP INVENTORY</p><h1>Raw ore cargo</h1></div><div className={styles.capacity}>{format(cargoUsed)} / {state.capacity} SCU</div></div>
      <div className={styles.oreGrid}>{ORES.map(ore => <article key={ore.id} className={styles.oreCard} style={{'--ore': ore.color} as React.CSSProperties}><span className={styles.oreSwatch} /><div><strong>{ore.name}</strong><small>Raw material</small></div><b>{format(state.inventory[ore.id] ?? 0)} <small>SCU</small></b></article>)}</div>
      <div className={styles.refineForm}>
        <label>Ore<select value={selectedOre} onChange={event => setSelectedOre(event.target.value as OreId)}>{ORES.map(ore => <option key={ore.id} value={ore.id}>{ore.name}</option>)}</select></label>
        <label>Amount (SCU)<input type="number" min="0.1" max={available} step="0.1" value={refineAmount} onChange={event => setRefineAmount(Number(event.target.value))} /></label>
        <button className={styles.primary} disabled={available <= 0 || refineAmount <= 0 || refineAmount > available} onClick={submitOrder}>Create work order</button>
      </div>
    </section>}

    {view === 'refinery' && <section className={styles.content}>
      <div className={styles.sectionHeading}><div><p>PROCESSING QUEUE</p><h1>Refinery work orders</h1></div></div>
      {currentState.workOrders.length === 0 ? <div className={styles.empty}>No active work orders.</div> : <div className={styles.orderList}>{currentState.workOrders.map(order => {
        const ore = ORES.find(item => item.id === order.oreId) ?? ORES[0]; const remaining = Math.max(0, order.readyAt - Date.now()); const complete = remaining === 0
        return <article className={styles.order} key={order.id}><div><strong>{ore.name}</strong><span>{format(order.rawAmount)} SCU raw → {format(order.refinedAmount)} SCU refined</span></div><div><small>{complete ? 'REFINING COMPLETE' : `${Math.ceil(remaining / 60000)} MIN REMAINING`}</small><b>¤ {format(order.refinedAmount * ore.sellPrice)}</b></div><button onClick={() => sell(order)} disabled={!complete}>Sell refined order</button></article>
      })}</div>}
    </section>}
    <footer><span>User: {session.userId ?? 'development-viewer'}</span><span>Reconstruction build</span></footer>
  </main>
}
