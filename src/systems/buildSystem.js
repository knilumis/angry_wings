export const SLOT_DEFINITIONS = [
  {
    id: "wingLeft",
    label: "Sol Kanat",
    accepts: ["wings"],
    required: false,
    grid: { row: 1, col: 0 },
  },
  {
    id: "core",
    label: "Core",
    accepts: ["core"],
    required: true,
    grid: { row: 1, col: 2 },
  },
  {
    id: "wingRight",
    label: "Sağ Kanat",
    accepts: ["wings"],
    required: false,
    grid: { row: 1, col: 4 },
  },
  {
    id: "seeker",
    label: "Arayıcı Başlık",
    accepts: ["seeker"],
    required: false,
    grid: { row: 0, col: 2 },
  },
  {
    id: "warhead",
    label: "Harp Başlığı",
    accepts: ["warhead"],
    required: false,
    grid: { row: 1, col: 3 },
  },
  {
    id: "tail",
    label: "Kuyruk",
    accepts: ["tail"],
    required: false,
    grid: { row: 1, col: 1 },
  },
  {
    id: "autopilot",
    label: "Otopilot",
    accepts: ["autopilot"],
    required: false,
    grid: { row: 2, col: 2 },
  },
  {
    id: "link",
    label: "Kumanda Link",
    accepts: ["link"],
    required: false,
    grid: { row: 2, col: 1 },
  },
  {
    id: "power",
    label: "Güç Ünitesi",
    accepts: ["power"],
    required: false,
    grid: { row: 2, col: 3 },
  },
  {
    id: "extra1",
    label: "Ek Modül A",
    accepts: ["extra"],
    required: false,
    grid: { row: 0, col: 1 },
  },
  {
    id: "extra2",
    label: "Ek Modül B",
    accepts: ["extra"],
    required: false,
    grid: { row: 0, col: 3 },
  },
];

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

function emptyStats() {
  return STAT_KEYS.reduce((acc, key) => {
    acc[key] = 0;
    return acc;
  }, {});
}

function safeNumber(value) {
  return Number.isFinite(value) ? value : 0;
}

export function createDefaultBuild() {
  return {
    name: "Yeni Tasarım",
    slots: SLOT_DEFINITIONS.reduce((acc, slot) => {
      acc[slot.id] = null;
      return acc;
    }, {}),
  };
}

export function cloneBuild(build) {
  return {
    name: build?.name || "Yeni Tasarım",
    slots: { ...(build?.slots || {}) },
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
  return slot.accepts.includes(part.kategori);
}

export function placePartInBuild(build, slotId, partId, partsById) {
  const nextBuild = cloneBuild(build);
  const part = partsById[partId];
  if (!part || !canPartFitSlot(part, slotId)) {
    return { build: nextBuild, changed: false, reason: "Bu parça bu slota takılamaz." };
  }
  nextBuild.slots[slotId] = partId;
  return { build: nextBuild, changed: true };
}

export function removePartFromBuild(build, slotId) {
  const nextBuild = cloneBuild(build);
  nextBuild.slots[slotId] = null;
  return nextBuild;
}

export function calculateBuildSummary(build, partsById, budgetLimit = Infinity) {
  // Build ekranındaki tüm türetilmiş değerler bu özetten hesaplanır.
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

  const wingCount = [build?.slots?.wingLeft, build?.slots?.wingRight].filter(Boolean).length;
  const stabilityScore = Math.max(0, Math.round(stats.stability + (wingCount > 0 ? 6 : -8) - weight * 0.16));
  const controlScore = Math.max(0, Math.round(stats.control + stats.guidance * 0.6 - Math.max(0, stats.latency) * 0.8));
  const liftScore = Math.max(0, Math.round(stats.lift - Math.max(0, stats.drag) * 0.35));
  const lockEase = Math.max(0, Math.round(stats.lockEase + stats.guidance * 0.4));
  const damageScore = Math.max(0, Math.round(stats.damageRadius * 8 + durability * 0.05));
  const energyBalance = Math.round((energyOut - energyIn) * 10) / 10;

  const reasons = [];
  const warnings = [];

  if (!build?.slots?.core) {
    reasons.push("Core parçası zorunludur.");
  }
  if (cost > budgetLimit) {
    reasons.push(`Bütçe aşıldı: ${cost} / ${budgetLimit}`);
  }
  if (energyBalance < 0) {
    reasons.push(`Enerji dengesi negatif: ${energyBalance}`);
  }
  if (wingCount === 0) {
    warnings.push("Kanat olmadan kontrol zorlaşır.");
  }
  if (!build?.slots?.power) {
    warnings.push("Güç ünitesi önerilir.");
  }

  return {
    selectedParts,
    totals: {
      weight: Math.round(weight * 10) / 10,
      durability: Math.round(durability),
      energyIn: Math.round(energyIn * 10) / 10,
      energyOut: Math.round(energyOut * 10) / 10,
      cost: Math.round(cost),
      wingCount,
    },
    stats: {
      ...stats,
      stabilityScore,
      controlScore,
      liftScore,
      lockEase,
      damageScore,
      energyBalance,
    },
    validation: {
      isValid: reasons.length === 0,
      reasons,
      warnings,
    },
  };
}

export function getPartDurabilityMap(buildSummary) {
  // Görev sırasında parçaların ayrı ayrı hasar alabilmesi için başlangıç dayanım tablosu.
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
    };
    return acc;
  }, {});
}

export function summarizeFromDurabilityMap(durabilityMap, baseSummary) {
  // Kopan parçaları hesaba katarak uçuş anındaki canlı istatistikleri yeniden üretir.
  const active = Object.values(durabilityMap).filter((entry) => !entry.detached);
  const stats = emptyStats();
  let weight = 0;
  let durability = 0;

  for (const part of active) {
    weight += safeNumber(part.weight);
    durability += safeNumber(part.durability);
    for (const key of STAT_KEYS) {
      stats[key] += safeNumber(part.stats?.[key]);
    }
  }

  const wingCount = active.filter((part) => part.kategori === "wings").length;

  return {
    ...baseSummary,
    totals: {
      ...baseSummary.totals,
      weight,
      durability,
      wingCount,
    },
    stats: {
      ...baseSummary.stats,
      ...stats,
      stabilityScore: Math.max(0, Math.round(stats.stability + (wingCount > 0 ? 6 : -8) - weight * 0.16)),
      controlScore: Math.max(0, Math.round(stats.control + stats.guidance * 0.6 - Math.max(0, stats.latency) * 0.8)),
      liftScore: Math.max(0, Math.round(stats.lift - Math.max(0, stats.drag) * 0.35)),
      lockEase: Math.max(0, Math.round(stats.lockEase + stats.guidance * 0.4)),
      damageScore: Math.max(0, Math.round(stats.damageRadius * 8 + durability * 0.05)),
    },
  };
}
