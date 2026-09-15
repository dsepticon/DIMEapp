# Milestone 4.1 mapping gate — 2026-09-14

**Resolved by later owner instruction on 2026-09-14.** The owner approved an explicit functional-equivalence rule and directed that ores, minerals and gems use real-world material names. The [final one-to-one matrix](dime-m4-final-mapping.json) supersedes the candidate-only matrix discussed below. This section remains as the historical reason for the additional catalog work; `OWNER_REVIEW_REQUIRED` is no longer applied merely for an unsupplied name. Runtime conversion and presentation still require their own validation.

This is a **pre-conversion review**, not an approved migration. The owner approved Family A's setting with **Avenbolt** as the city and an **equivalent conversion policy**. An equivalent conversion requires an explicit, individually reviewed correspondence for every asset that can appear in a save. A list of twenty new mineral names is not such a correspondence. No save ID, content version, conversion receipt, API action, production display, or persistent state was changed.

The machine-readable [semantic matrix](dime-m4-semantic-mapping-review.json) covers 20 minerals (including their current raw and processed values), 14 ship and vehicle types, 12 equipment terms, four extraction classes, nine refinery methods, 43 zones, and 12 other terms. It records existing source keys and catalog facts, quantity/ownership paths, capacities, prices, rarity/spawn weights, refinability, and candidate display names. **Every row has `OWNER_REVIEW_REQUIRED` and a null proposed save ID.** Actual per-player quantities and ownership are unknown because no real player record was accessed. The current starter Nomad and Basic Mining Tool ownership are read from the canonical new-save factory; other holdings are per-save.

## Why conversion must stop here

| Source group          | Established values                                                                            | Candidate coverage              | Missing review                                                                                                                                       |
| --------------------- | --------------------------------------------------------------------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 20 minerals           | Four non-refinable gems; 16 refinable ores; individual raw/processed values and spawn weights | 20 candidate names              | Which original substance and fictional behavior corresponds to each old mineral; a slot-number assignment alone would silently reinterpret an asset. |
| 14 ships/vehicles     | Distinct ownership, prices, capacities, cargo and mining roles                                | Lark Skiff and Crawl Rig        | Twelve additional class equivalents; explicit capacity, value, role and visual-identity decisions for all 14.                                        |
| 12 equipment terms    | Owned heads/tool and priced upgrades                                                          | One candidate basic tool        | Eleven functional/tier equivalents and the exact preservation of equipped effects.                                                                   |
| Nine refinery methods | Saved rates and outstanding work orders                                                       | Four candidate method names     | At least five additional method identities and a nine-way correspondence preserving every saved rate and order.                                      |
| 43 zones              | Saved zone, entry, node, vehicle and departure references                                     | Five approved location families | Original zone names, geometry, stable IDs, one-to-one arrival and progression correspondence.                                                        |
| Quest and NPC terms   | Completed First Shift, legacy reconciliation, three named NPC roles                           | First Contract only             | Historical labels, tutorial semantics, and replacement NPCs without attributed Dorathaadestroya dialogue.                                            |

It would violate the instruction to **stop implementation for any mapping that cannot preserve meaning or value** to infer these correspondences or invent stable save IDs. Checkpoints 2–4 therefore remain unstarted. In particular, a partly converted save, a front-end-only rename, or connecting the prototype to the old node IDs would make an unsafe or misleading game.

## Preliminary collision screen

Search date: **2026-09-14**. The search covered exact selected-family phrases and obvious close variants in games, entertainment, software, products and companies where results were available. Search results are noisy and are not legal clearance. The selected region/system/station/world/city phrases **Cairncoil Reach, Lomrek, Tessick Station, Loam Crescent, Mica Slope, and Avenbolt** had no obvious exact match in this pass. This is a limited negative finding, not proof of exclusivity. Other Family A functional labels also need a dedicated close-variant and trademark screen before final release.

The strongest newly found product conflicts in the mineral shortlist were [Blue Marl apparel](https://store.chelseafc.com/chelsea-core-t-shirt-blue-marl-mens/p-202456611), [River Spark jewellery](https://www.forevershine.co.in/US/natural-diamond/river-spark) and [Deep Petal nail wraps](https://www.sassysaints.com/products/deep-petal-gel-wrap). They were replaced in the **candidate list only** by Blue Kelm, Kiln Glint and Deep Oreleaf. Exact searches showed no obvious result for the three replacements, but close-variant screening and formal clearance remain. The [naming review](dime-m4-naming-review.md) retains the earlier collision log and all 20 updated Family A mineral candidates. The owner-selected Avenbolt replaces Dockrin in Family A's city, transit and exchange labels.

## Required next decisions

1. Review a one-to-one substance description for each of the 20 mineral candidates, including which four are gems, without changing existing rarity, raw value or processed value.
2. Supply or approve 14 functionally equivalent vehicle/ship identities with their current class, price and capacity carried through exactly.
3. Supply or approve 12 equipment correspondences and nine refinery-method correspondences, including preserved upgrade effects and saved work-order rates.
4. Review the 43 original zone identities and how older exact location/zone progress maps without teleporting or losing travel state.
5. Review replacement tutorial/NPC history labels and whether completed legacy quest history keeps its historical wording in an accessible record.

Once these are approved, stable **non-display** IDs can be assigned and a versioned, previewable, idempotent and reversible staging conversion can be built. The existing production save representation remains readable throughout development. No real player data is needed to make or test the design.
