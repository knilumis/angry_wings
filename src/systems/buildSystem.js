const GRID_ROWS = 3;
const GRID_COLS = 5;

export const SLOT_DEFINITIONS = Array.from({ length: GRID_ROWS * GRID_COLS }).map((_, index) => {
  const row = Math.floor(index / GRID_COLS);
  const col = index % GRID_COLS;
  return {
    id: `cell-${row}-${col}`,
    label: `R${row + 1}C${col + 1}`,
    accepts: null,
    required: false,
    grid: { row, col },
  };
});

const STAT_KEYS = [
  "stability",
  "lift",
  "drag",
  "control",
  "guidance",
  "damageRadius",
  "lockEase",
  "latency",
  "jamResist",
];

export const DEFAULT_BUILD_TUNING = Object.freeze({
  wingLength: 100,
  wingSlope: 0,
  finLength: 100,
  finHeight: 100,
});

const TEST_OVERRIDE_MIN_LEVEL = 100;
const TEST_OVERRIDE_MIN_CREDITS = 99999999;

function emptyStats() {
  return STAT_KEYS.reduce((acc, key) => {
    acc[key] = 0;
    return acc;
  }, {});
}

function safeNumber(value) {
  return Number.isFinite(value) ? value : 0;
}

function safeClamped(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, parsed));
}

export function isTestOverrideProgression(progression) {
  const level = Number(progression?.playerLevel) || 0;
  const credits = Number(progression?.credits) || 0;
  return level >= TEST_OVERRIDE_MIN_LEVEL && credits >= TEST_OVERRIDE_MIN_CREDITS;
}

export function normalizeBuildTuning(rawTuning = {}) {
  return {
    wingLength: safeClamped(rawTuning.wingLength, 10, 160, DEFAULT_BUILD_TUNING.wingLength),
    wingSlope: safeClamped(rawTuning.wingSlope, -20, 22, DEFAULT_BUILD_TUNING.wingSlope),
    finLength: safeClamped(rawTuning.finLength, 70, 170, DEFAULT_BUILD_TUNING.finLength),
    finHeight: safeClamped(rawTuning.finHeight, 70, 175, DEFAULT_BUILD_TUNING.finHeight),
  };
}

function getCategoryCounts(entries) {
  return entries.reduce((acc, entry) => {
    const key = entry.part.kategori || "unknown";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function computeDerivedStats({ stats, totals, tuning }) {
  const wingLengthFactor = tuning.wingLength / 100;
  const wingSlopeFactor = tuning.wingSlope / 20;
  const finLengthFactor = tuning.finLength / 100;
  const finHeightFactor = tuning.finHeight / 100;

  const effectiveLift =
    stats.lift * (0.62 + wingLengthFactor * 0.58) +
    (totals.wingCount > 0 ? totals.wingCount * 1.8 : 0) +
    wingSlopeFactor * 3.2 * totals.wingCount;

  const effectiveDrag = Math.max(
    0,
    stats.drag * (0.74 + wingLengthFactor * 0.46) +
      Math.abs(wingSlopeFactor) * 2.6 +
      Math.max(0, wingSlopeFactor) * 1.1,
  );

  const finManeuverBase =
    totals.tailCount > 0
      ? (finLengthFactor * 0.55 + finHeightFactor * 0.75) * totals.tailCount
      : 0;

  const stabilityScore = Math.max(
    0,
    Math.round(
      stats.stability +
        totals.coreCount * 2.2 +
        (totals.wingCount > 0 ? 3.5 + totals.wingCount * 2.1 : -10) +
        finManeuverBase * 2.2 -
        totals.weight * 0.12,
    ),
  );

  const controlScore = Math.max(
    0,
    Math.round(
      stats.control +
        stats.guidance * 0.55 +
        totals.wingCount * 1.5 +
        finManeuverBase * 2.8 -
        Math.max(0, stats.latency) * 0.8,
    ),
  );

  const maneuverScore = Math.max(
    0,
    Math.round(controlScore * 0.55 + finManeuverBase * 7 + stats.stability * 0.2),
  );

  const liftScore = Math.max(0, Math.round(effectiveLift - effectiveDrag * 0.35));
  const liftToDragRatio = Number((effectiveLift / Math.max(1, effectiveDrag)).toFixed(2));

  const lockEase = Math.max(0, Math.round(stats.lockEase + stats.guidance * 0.4));
  const damageScore = Math.max(0, Math.round(stats.damageRadius * 8 + totals.durability * 0.05));
  const energyBalance = Math.round((totals.energyOut - totals.energyIn) * 10) / 10;

  return {
    stabilityScore,
    controlScore,
    maneuverScore,
    liftScore,
    liftToDragRatio,
    lockEase,
    damageScore,
    energyBalance,
    effectiveLift: Math.round(effectiveLift * 10) / 10,
    effectiveDrag: Math.round(effectiveDrag * 10) / 10,
  };
}

export function createDefaultBuild() {
  return {
    name: "Yeni Tasarim",
    slots: SLOT_DEFINITIONS.reduce((acc, slot) => {
      acc[slot.id] = null;
      return acc;
    }, {}),
    tuning: { ...DEFAULT_BUILD_TUNING },
  };
}

export function cloneBuild(build) {
  return {
    name: build?.name || "Yeni Tasarim",
    slots: { ...(build?.slots || {}) },
    tuning: normalizeBuildTuning(build?.tuning),
  };
}

export function indexPartsById(parts) {
  return parts.reduce((acc, part) => {
    acc[part.id] = part;
    return acc;
  }, {});
}

export function canPartFitSlot(part, slotId) {
  const slot = SLOT_DEFINITIONS.find((item) => item.id === slotId);
  if (!slot || !part) {
    return false;
  }
  return true;
}

export function placePartInBuild(build, slotId, partId, partsById) {
  const nextBuild = cloneBuild(build);
  const part = partsById[partId];
  const slotExists = SLOT_DEFINITIONS.some((item) => item.id === slotId);

  if (!slotExists) {
    return { build: nextBuild, changed: false, reason: "Secili hucre bulunamadi." };
  }
  if (!part || !canPartFitSlot(part, slotId)) {
    return { build: nextBuild, changed: false, reason: "Bu parca yerlestirilemiyor." };
  }

  nextBuild.slots[slotId] = partId;
  return { build: nextBuild, changed: true };
}

export function removePartFromBuild(build, slotId) {
  const nextBuild = cloneBuild(build);
  nextBuild.slots[slotId] = null;
  return nextBuild;
}

export function calculateBuildSummary(build, partsById, budgetLimit = Infinity, options = {}) {
  const ignoreBudget = Boolean(options.ignoreBudget);
  const ignoreEnergy = Boolean(options.ignoreEnergy);
  const selectedParts = [];
  const stats = emptyStats();
  let weight = 0;
  let durability = 0;
  let energyIn = 0;
  let energyOut = 0;
  let cost = 0;

  for (const slot of SLOT_DEFINITIONS) {
    const partId = build?.slots?.[slot.id];
    if (!partId) {
      continue;
    }

    const part = partsById[partId];
    if (!part) {
      continue;
    }

    selectedParts.push({ slotId: slot.id, part });
    weight += safeNumber(part.weight);
    durability += safeNumber(part.durability);
    energyIn += safeNumber(part.energyIn);
    energyOut += safeNumber(part.energyOut);
    cost += safeNumber(part.cost);

    for (const key of STAT_KEYS) {
      stats[key] += safeNumber(part.stats?.[key]);
    }
  }

  const categoryCounts = getCategoryCounts(selectedParts);
  const totals = {
    weight: Math.round(weight * 10) / 10,
    durability: Math.round(durability),
    energyIn: Math.round(energyIn * 10) / 10,
    energyOut: Math.round(energyOut * 10) / 10,
    cost: Math.round(cost),
    wingCount: categoryCounts.wings || 0,
    coreCount: categoryCounts.core || 0,
    tailCount: categoryCounts.tail || 0,
    powerCount: categoryCounts.power || 0,
    selectedCount: selectedParts.length,
    categoryCounts,
  };

  const tuning = normalizeBuildTuning(build?.tuning);
  const derivedStats = computeDerivedStats({ stats, totals, tuning });

  const reasons = [];
  const warnings = [];

  if (totals.coreCount <= 0) {
    reasons.push("En az 1 govde silindir parcasi gerekli.");
  }
  if (!ignoreBudget && totals.cost > budgetLimit) {
    reasons.push(`Butce asildi: ${totals.cost} / ${budgetLimit}`);
  }
  if (!ignoreEnergy && derivedStats.energyBalance < 0) {
    reasons.push(`Enerji dengesi negatif: ${derivedStats.energyBalance}`);
  }
  if (totals.wingCount === 0) {
    warnings.push("Kanat olmadan kontrol cok zordur.");
  }
  if (totals.powerCount <= 0) {
    warnings.push("Bir itki sistemi (elektrikli, benzinli, jet) onerilir.");
  }
  if (ignoreBudget && totals.cost > budgetLimit) {
    warnings.push(`Test modu: butce limiti asildi (${totals.cost} / ${budgetLimit}).`);
  }
  if (ignoreEnergy && derivedStats.energyBalance < 0) {
    warnings.push(`Test modu: enerji dengesi negatif (${derivedStats.energyBalance}).`);
  }

  return {
    selectedParts,
    totals,
    tuning,
    stats: {
      ...stats,
      ...derivedStats,
    },
    validation: {
      isValid: reasons.length === 0,
      reasons,
      warnings,
      overrides: {
        ignoreBudget,
        ignoreEnergy,
      },
    },
  };
}

export function getPartDurabilityMap(buildSummary) {
  return buildSummary.selectedParts.reduce((acc, entry) => {
    acc[entry.slotId] = {
      id: entry.part.id,
      ad: entry.part.ad,
      durability: entry.part.durability,
      maxDurability: entry.part.durability,
      detached: false,
      stats: { ...(entry.part.stats || {}) },
      weight: entry.part.weight,
      kategori: entry.part.kategori,
      materialTier: entry.part.materialTier || null,
      thrustType: entry.part.thrustType || null,
      energyIn: entry.part.energyIn,
      energyOut: entry.part.energyOut,
    };
    return acc;
  }, {});
}

export function summarizeFromDurabilityMap(durabilityMap, baseSummary) {
  const activeParts = Object.values(durabilityMap).filter((entry) => !entry.detached);
  const stats = emptyStats();
  let weight = 0;
  let durability = 0;
  let energyIn = 0;
  let energyOut = 0;

  for (const part of activeParts) {
    weight += safeNumber(part.weight);
    durability += safeNumber(part.durability);
    energyIn += safeNumber(part.energyIn);
    energyOut += safeNumber(part.energyOut);

    for (const key of STAT_KEYS) {
      stats[key] += safeNumber(part.stats?.[key]);
    }
  }

  const categoryCounts = activeParts.reduce((acc, part) => {
    const key = part.kategori || "unknown";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const totals = {
    ...baseSummary.totals,
    weight: Math.round(weight * 10) / 10,
    durability: Math.round(durability),
    energyIn: Math.round(energyIn * 10) / 10,
    energyOut: Math.round(energyOut * 10) / 10,
    wingCount: categoryCounts.wings || 0,
    coreCount: categoryCounts.core || 0,
    tailCount: categoryCounts.tail || 0,
    powerCount: categoryCounts.power || 0,
    categoryCounts,
    selectedCount: activeParts.length,
  };

  const tuning = normalizeBuildTuning(baseSummary?.tuning);
  const derivedStats = computeDerivedStats({ stats, totals, tuning });

  return {
    ...baseSummary,
    totals,
    tuning,
    stats: {
      ...baseSummary.stats,
      ...stats,
      ...derivedStats,
    },
  };
}
