import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

type Source = 'world' | 'shift' | 'full';
type Scenario = {
  scenarioId: string;
  slug: string;
  source: Source;
  expectedLocation: string;
  expectedZone: string;
  expectedVisibleState: string;
  expectedAuthoritativeState: string;
};
const entries: Scenario[] = [];
const add = (
  scenarioId: string,
  slug: string,
  expectedLocation: string,
  expectedZone: string,
  expectedVisibleState: string,
  expectedAuthoritativeState = `${expectedLocation}/${expectedZone}`,
  source: Source = 'world',
) =>
  entries.push({
    scenarioId,
    slug,
    expectedLocation,
    expectedZone,
    expectedVisibleState,
    expectedAuthoritativeState,
    source,
  });

add(
  'arc-arrival',
  'physical-arc-arrival',
  'ARC-L1',
  'ARC_L1_START',
  'Enclosed station arrival, correct ARC-L1 label and starter guide',
);
add(
  'arc-concourse',
  'physical-arc-concourse',
  'ARC-L1',
  'ARC_L1_CONCOURSE',
  'Station concourse, readable route signs and NPCs',
);
add(
  'arc-refinery',
  'arc-l1-refinery',
  'ARC-L1',
  'ARC_L1_REFINERY',
  'Ore refinery service and enclosed station palette',
);
add('arc-cargo', 'arc-l1-cargo', 'ARC-L1', 'ARC_L1_CARGO', 'Cargo service and reachable terminal');
add('arc-equipment', 'arc-l1-equipment', 'ARC-L1', 'ARC_L1_EQUIPMENT', 'Mining-equipment supply service');
add(
  'arc-ship-service',
  'physical-ship-service',
  'ARC-L1',
  'ARC_L1_DEPARTURE',
  'Physical owned-ship terminal interaction',
);
add(
  'arc-assignment',
  'physical-assigned-hangar',
  'ARC-L1',
  'ARC_L1_DEPARTURE',
  'Confirmed Lyria assignment and hangar direction',
);
add('arc-hangar', 'physical-hangar', 'ARC-L1', 'ARC_L1_HANGAR', 'Assigned ship departure point');
add(
  'arc-departure',
  'physical-departure',
  'ARC-L1',
  'ARC_L1_HANGAR',
  'Confirmed departure transition',
  'Travel pending to Lyria',
);
add(
  'lyria-arrival',
  'physical-lyria-arrival',
  'Lyria',
  'LYRIA_OUTPOST_01',
  'Lyria outpost arrival after travel',
);
add('lyria-outpost', 'lyria-arrival', 'Lyria', 'LYRIA_OUTPOST_01', 'Outpost, Mara and raw-sale services');
add(
  'lyria-surface',
  'lyria-surface',
  'Lyria',
  'LYRIA_SURFACE_01',
  'Exterior mining region with deposits and paths',
);
add(
  'lyria-haul-trail',
  'lyria-haul-trail',
  'Lyria',
  'LYRIA_SURFACE_02',
  'Second connected exterior mining region',
);
add('lyria-east-yard', 'lyria-east-yard', 'Lyria', 'LYRIA_OUTPOST_02', 'Second outpost and supply service');
add('lyria-cave', 'lyria-cave', 'Lyria', 'LYRIA_CAVE_01', 'Underground palette and cave exit');
add(
  'lyria-cave-return',
  'physical-lyria-matching-cave-exit',
  'Lyria',
  'LYRIA_SURFACE_01',
  'Matching exterior cave mouth after exit',
  'Entry from LYRIA_CAVE_01',
);
add('lyria-asop', 'lyria-asop', 'Lyria', 'LYRIA_ASOP', 'Owned-vehicle terminal and retrieval area');
add('lyria-landing', 'lyria-departure-pad', 'Lyria', 'LYRIA_LANDING_PAD', 'Moon landing and departure point');
add(
  'mara-assignment',
  'mara-assignment',
  'Lyria',
  'LYRIA_OUTPOST_01',
  'Mara/First Shift assignment and Basic Mining Tool objective',
  'First Shift active',
  'shift',
);
add(
  'scanner',
  'scanner',
  'Lyria',
  'LYRIA_SURFACE_01',
  'Directional signature hint without unanalyzed mineral name',
  'Scanner ping confirmed',
  'shift',
);
add(
  'node-analysis',
  'node-analysis',
  'Lyria',
  'LYRIA_SURFACE_01',
  'Mineral, size, resistance, instability and yield',
);
add(
  'laser-below-optimal',
  'laser-below-optimal',
  'Lyria',
  'LYRIA_SURFACE_01',
  'Charge below optimal and hold control',
);
add('laser-optimal', 'laser-optimal', 'Lyria', 'LYRIA_SURFACE_01', 'Charge and stable hold in optimal range');
add('laser-overcharge', 'laser-overcharge', 'Lyria', 'LYRIA_SURFACE_01', 'Readable overcharge risk');
add(
  'fractured-node',
  'fractured-ground-pieces',
  'Lyria',
  'LYRIA_SURFACE_01',
  'Fractured node and separate ground pieces',
  'Node fractured; 400 minor units remain on ground',
);
add(
  'three-ground-pieces',
  'three-ground-pieces',
  'Lyria',
  'LYRIA_SURFACE_01',
  'Three reachable separate tutorial pieces',
  '125+125+150=400 minor units',
  'shift',
);
add(
  'partial-one',
  'partial-1',
  'Lyria',
  'LYRIA_SURFACE_01',
  'Two pieces remain after one pickup',
  'First Shift collection objective active',
  'shift',
);
add(
  'partial-two',
  'partial-2',
  'Lyria',
  'LYRIA_SURFACE_01',
  'One piece remains after two pickups',
  'First Shift collection objective active',
  'shift',
);
add(
  'collection-complete',
  'collection-complete',
  'Lyria',
  'LYRIA_SURFACE_01',
  'No tutorial fragments remain',
  'Hand Dolivine 400 units; return objective',
  'shift',
);
add(
  'full-inventory',
  'full-inventory',
  'Lyria',
  'LYRIA_SURFACE_01',
  '12/12 cSCU Hand hold, 1.25 cSCU fragment, full-hold feedback and visible fragment',
  'Failed collection leaves revision, inventory, quest and fragment unchanged',
  'full',
);
add(
  'full-inventory-recovered',
  'full-inventory-recovered',
  'Lyria',
  'LYRIA_SURFACE_01',
  'Same fragment removed only after transfer and confirmed collection',
  '125 units collected, 275 units remain; no quest advance',
  'full',
);
add(
  'raw-sale',
  'raw-sale',
  'Lyria',
  'LYRIA_OUTPOST_01',
  'Raw Dolivine sale confirmed',
  'Wallet +5,200 aUEC; raw inventory zero',
  'shift',
);
add(
  'quest-reward',
  'reward',
  'Lyria',
  'LYRIA_OUTPOST_01',
  'One 500 aUEC reward and completed route',
  'Wallet 5,700 aUEC; mined4/refined0/sold4',
  'shift',
);
add(
  'quest-refresh',
  'refresh',
  'Lyria',
  'LYRIA_OUTPOST_01',
  'Final Quest Log and wallet after reload',
  'Completion and counters persist',
  'shift',
);
add('roc-owned-terminal', 'asop-owned-roc', 'Lyria', 'LYRIA_ASOP', 'Owned ROC available at ASOP');
add(
  'roc-retrieval',
  'roc-retrieval',
  'Lyria',
  'LYRIA_ASOP',
  'Retrieved and entered owned ROC',
  'Single active ROC',
);
add(
  'roc-mining',
  'roc-mining',
  'Lyria',
  'LYRIA_SURFACE_02',
  'ROC mining region and vehicle state',
  'Yield credited to ROC hold',
);
add('wala-outpost', 'wala-outpost', 'Wala', 'WALA_OUTPOST_01', 'Distinct Wala outpost palette and landmarks');
add('wala-surface', 'wala-surface', 'Wala', 'WALA_SURFACE_01', 'Wala mining exterior distinct from Lyria');
add('wala-switchback', 'wala-switchback', 'Wala', 'WALA_SURFACE_02', 'Second connected Wala exterior');
add('wala-south-yard', 'wala-south-yard', 'Wala', 'WALA_OUTPOST_02', 'Second Wala outpost');
add('wala-cave', 'wala-cave', 'Wala', 'WALA_CAVE_01', 'Wala underground palette and safe route');
add(
  'wala-cave-return',
  'physical-wala-matching-cave-exit',
  'Wala',
  'WALA_SURFACE_01',
  'Matching Wala cave mouth after exit',
  'Entry from WALA_CAVE_01',
);
add('wala-landing', 'wala-departure-pad', 'Wala', 'WALA_LANDING_PAD', 'Wala landing/departure service');
add(
  'area18-spaceport',
  'area18-spaceport',
  'Area-18',
  'AREA18_SPACEPORT',
  'Dense original city spaceport arrival',
);
add(
  'area18-checkpoint',
  'area18-port-checkpoint',
  'Area-18',
  'AREA18_SECURITY',
  'Port circulation/checkpoint',
);
add(
  'area18-port-platform',
  'area18-spaceport-platform',
  'Area-18',
  'AREA18_SPACEPORT_PLATFORM',
  'Clear transit platform destination',
);
add(
  'area18-shuttle',
  'area18-shuttle-journey',
  'Area-18',
  'AREA18_SHUTTLE',
  'Visible district journey and return route',
);
add(
  'area18-city-platform',
  'area18-city-platform',
  'Area-18',
  'AREA18_CITY_PLATFORM',
  'City-side transit platform',
);
add(
  'area18-transit',
  'area18-transit',
  'Area-18',
  'AREA18_TRANSIT',
  'Transit hall with readable connections',
);
add(
  'area18-plaza',
  'physical-area18-plaza-center',
  'Area-18',
  'AREA18_PLAZA',
  'Substantial commercial plaza and original signage',
);
add(
  'area18-market',
  'physical-area18-commodity-center',
  'Area-18',
  'AREA18_MARKET',
  'Commodity sale area and reachable counter',
);
add('area18-retail', 'area18-retail', 'Area-18', 'AREA18_RETAIL', 'Equipment and supply retail');
add(
  'area18-industrial',
  'area18-industrial',
  'Area-18',
  'AREA18_INDUSTRIAL',
  'Industrial back-service district',
);
add('area18-alley', 'area18-alley', 'Area-18', 'AREA18_ALLEY', 'Secondary city path');
add(
  'navigation',
  'local-navigation',
  'ARC-L1',
  'ARC_L1_START',
  'Local map shows player, facing, exits and objectives',
);
add(
  'remote-departure-rejected',
  'remote-departure-rejected',
  'ARC-L1',
  'ARC_L1_START',
  'Remote travel action disabled',
  'No assignment or travel mutation',
);
add(
  'fractional-transfer-quote',
  'fractional-cargo-before-transfer',
  'ARC-L1',
  'ARC_L1_START',
  'Exact 1.25 cSCU Hand-to-Nomad transfer amount before confirmation',
  'Hand Dolivine125 minor units; Nomad raw Dolivine0',
);
add(
  'fractional-transfer',
  'fractional-cargo-after-transfer',
  'ARC-L1',
  'ARC_L1_START',
  'Exact fractional cargo transfer displayed',
  'Hand125→Nomad125 minor units',
);
add(
  'fractional-refinery-quote',
  'fractional-refinery-quote',
  'ARC-L1',
  'ARC_L1_START',
  '1.25 cSCU Agricium input, server-derived output and cost before confirmation',
  'Prospector Agricium125 minor units; no order yet',
);
add(
  'fractional-refinery',
  'fractional-refinery-order',
  'ARC-L1',
  'ARC_L1_START',
  'Fractional ore order, output and cost shown',
  'Agricium125 input; server-priced order',
);
add(
  'fractional-sale-quote',
  'fractional-market-quote',
  'Area-18',
  'AREA18_SPACEPORT',
  '1.25 cSCU raw Dolivine sale quote for 1,625 aUEC',
  'Nomad raw Dolivine125 minor units; wallet unchanged',
);
add(
  'fractional-sale',
  'fractional-market-after-sale',
  'Area-18',
  'AREA18_SPACEPORT',
  'Fractional raw sale and wallet shown',
  'Dolivine125 sold for1,625 aUEC',
);
add(
  'reset-arc-l1',
  'reset-arc-l1',
  'ARC-L1',
  'ARC_L1_START',
  'Fresh ARC-L1 scene after reset',
  'Wallet0; First Shift not started',
);

const pathFor = (scenario: Scenario, layout: 'panel' | 'mobile') =>
  scenario.source === 'shift'
    ? `test-results/m3-first-shift-${layout}-${scenario.slug}.png`
    : scenario.source === 'full'
      ? `test-results/m3-world/m3-${scenario.slug}-${layout}.png`
      : `test-results/m3-world/${layout}-${scenario.slug}.png`;
const inspect = async (path: string, width: number, height: number) => {
  try {
    const image = await readFile(join(process.cwd(), path));
    if (image.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a')
      return { exists: true, validPng: false, width: 0, height: 0, correctViewport: false };
    const actualWidth = image.readUInt32BE(16);
    const actualHeight = image.readUInt32BE(20);
    return {
      exists: true,
      validPng: true,
      width: actualWidth,
      height: actualHeight,
      correctViewport: actualWidth === width && actualHeight === height,
    };
  } catch {
    return { exists: false, validPng: false, width: 0, height: 0, correctViewport: false };
  }
};
type Review = Record<string, { status: 'PASS' | 'ISSUE'; observation: string }>;
let reviews: Review = {};
try {
  reviews = JSON.parse(await readFile('test-results/m3-visual-review.json', 'utf8')) as Review;
} catch {
  // The first pass inventories required files before human visual review.
}
const rows = await Promise.all(
  entries.map(async (scenario) => {
    const panelScreenshotPath = pathFor(scenario, 'panel');
    const mobileScreenshotPath = pathFor(scenario, 'mobile');
    const panel = await inspect(panelScreenshotPath, 318, 500);
    const mobile = await inspect(mobileScreenshotPath, 360, 640);
    const filesValid = panel.correctViewport && mobile.correctViewport;
    const review = reviews[scenario.scenarioId];
    return {
      scenarioId: scenario.scenarioId,
      panelScreenshotPath,
      mobileScreenshotPath,
      expectedLocation: scenario.expectedLocation,
      expectedZone: scenario.expectedZone,
      expectedVisibleState: scenario.expectedVisibleState,
      expectedAuthoritativeState: scenario.expectedAuthoritativeState,
      reviewStatus: !filesValid
        ? 'MISSING_OR_INVALID_EVIDENCE'
        : review?.observation
          ? review.status === 'PASS'
            ? 'REVIEWED_PASS'
            : 'REVIEWED_ISSUE'
          : 'AWAITING_VISUAL_REVIEW',
      observation: !filesValid
        ? 'Required Panel or Mobile evidence is missing or invalid.'
        : review?.observation || 'File and viewport checked; visual findings pending.',
      fileChecks: { panel, mobile },
    };
  }),
);
const missing = rows.filter((row) => row.reviewStatus === 'MISSING_OR_INVALID_EVIDENCE');
const pending = rows.filter((row) => row.reviewStatus === 'AWAITING_VISUAL_REVIEW');
const issues = rows.filter((row) => row.reviewStatus === 'REVIEWED_ISSUE');
const manifest = {
  generatedAt: new Date().toISOString(),
  requirementsComparedWith: 'docs/dime-2d-rpg-m3-world-mining.md and the owner Milestone 3 visual list',
  requiredScenarioCount: rows.length,
  missingScenarioCount: missing.length,
  visualAuditComplete: missing.length === 0 && pending.length === 0 && issues.length === 0,
  scenarios: rows,
};
await writeFile('test-results/m3-visual-audit.json', JSON.stringify(manifest, null, 2));
process.stdout.write(
  JSON.stringify(
    {
      requiredScenarioCount: rows.length,
      missingScenarioCount: missing.length,
      pendingReviewCount: pending.length,
      issueCount: issues.length,
      missing: missing.map((row) => row.scenarioId),
    },
    null,
    2,
  ) + '\n',
);
if (missing.length) process.exitCode = 1;
