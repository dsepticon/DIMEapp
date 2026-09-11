# Gameplay state flow and rule provenance

All prices, ships, capacities, asteroid weights, refinery methods and travel times come from the active October 2024 authored source. See shared/catalog.ts and recovery-provenance.json.

1. Start at ARC-L1 with a Nomad and zero wallet.
2. Choose an owned ship and travel: hand/ROC claims are Lyria/Wala; Prospector/Mole claims are Halo.
3. Scan/extract once, then collect the completed operation into the mining hold.
4. Transfer raw material to a colocated cargo ship, or refine eligible raw Prospector/Mole material at ARC-L1.
5. Pay a server-calculated refinery fee. Raw material is consumed in the same transaction that creates the order.
6. A UTC deadline makes the order ready after refresh/reopen. Collect into a cargo ship at ARC-L1. Partial collection leaves the remainder in the order.
7. Sell gems/refined material at Area-18; raw minerals at ARC-L1. Quantity removal and wallet credit are one transaction.
8. Purchase/sell owned ships, heads and crew at Area-18. Purchased ships are staged at ARC-L1. Loaded/current ships cannot be sold.

Hand/ROC native cSCU values are converted to displayed SCU; capacities are 0.12/0.8 SCU. Prospector/Mole capacities are 32/96 SCU. Nomad cargo capacity is 24 SCU. Gem unit prices were per cSCU in the recovered game; the catalog stores their equivalent per-SCU prices.

## Deliberate corrections to broken behavior

- The recovered overlapping scan timers awarded ore before extraction. One persisted scan+mining operation now takes 15 seconds for hand mining, 40 for ROC, 10 plus head time for Prospector, and 190 minus staffed-head/crew reductions for Mole.
- Default Arbor heads are included with their ships. The original ownership check made the default Prospector head unusable.
- Mole supports one to three staffed stations; duplicate crew/head selections require enough copies. The original code mixed numeric counts with .quantity objects and referenced an undefined inventory.
- Asteroid selections are weighted without replacement. Random yield is generated on the server once per committed operation. Ore quantity is capped at hold capacity.
- Raw transfers remain raw. Refining cannot manufacture cargo through classification changes.
- Refinery rates are rolled once at profile initialization within the recovered ranges and persisted, preventing page-refresh rerolls. Preview and charge use the same authoritative rates. Refined output is rounded down at cSCU precision rather than inconsistently flooring whole SCU.
- Refinery order creation writes createdAt and readyAt; completion is derived from server time, not a client-maintained decrementing counter.
- Refined Aluminium uses its recovered 349 aUEC/SCU price despite the original aluminum/aluminium key mismatch.
- Cargo capacity includes both raw and refined material. Collected orders disappear only when fully transferred.
- Inventory, wallet and pending-operation changes are atomic. No client AES/HMAC obfuscation is treated as proof of ownership.
- Travel completes explicitly through the finish action; this makes restart/retry recovery visible. Locations and mining types remain the production ones.

The newer Git prototype's three ores, flat 32-SCU capacity and 84/62/146 prices are superseded by recovered production rules. No production player records were touched or converted.
