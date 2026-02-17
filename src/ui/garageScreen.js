import {
  SLOT_DEFINITIONS,
  createDefaultBuild,
  indexPartsById,
  placePartInBuild,
  removePartFromBuild,
  calculateBuildSummary,
  isTestOverrideProgression,
  cloneBuild,
  normalizeBuildTuning,
} from "../systems/buildSystem.js";
import { getNextPlayableLevel } from "../systems/progressionSystem.js";

const CATEGORY_LABELS = {
  core: "Govde",
  wings: "Kanat",
  tail: "Fin",
  warhead: "Harp",
  seeker: "Arayici",
  autopilot: "Otopilot",
  link: "Link",
  power: "Itki",
  extra: "Ek",
};

const MATERIAL_LABELS = {
  kopuk: "Kopuk",
  ahsap: "Ahsap",
  kompozit: "Kompozit",
};

const THRUST_LABELS = {
  electric: "Elektrikli",
  gasoline: "Benzinli",
  jet: "Jet",
};

const MATERIAL_RANK = {
  kopuk: 1,
  ahsap: 2,
  kompozit: 3,
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function shortName(value, max = 22) {
  if (!value || value.length <= max) {
    return value || "";
  }
  return `${value.slice(0, max - 3)}...`;
}

function slotAt(row, col) {
  return SLOT_DEFINITIONS.find((slot) => slot.grid.row === row && slot.grid.col === col) || null;
}

function materialTierForPart(part) {
  if (!part) return "kopuk";
  if (part.materialTier) return part.materialTier;
  if (part.rarity === "epic") return "kompozit";
  if (part.rarity === "rare") return "ahsap";
  return "kopuk";
}

function materialLabel(part) {
  const tier = materialTierForPart(part);
  return MATERIAL_LABELS[tier] || "Kopuk";
}

function thrustTypeForPart(part) {
  if (!part) return null;
  if (part.thrustType) return part.thrustType;
  if ((part.energyOut || 0) >= 6) return "jet";
  if ((part.energyOut || 0) >= 3.5) return "gasoline";
  return "electric";
}

function thrustLabel(type) {
  return THRUST_LABELS[type] || "Yok";
}

function getStarterPart(parts, category) {
  return parts
    .filter((part) => part.kategori === category && part.unlockLevel <= 1)
    .sort((a, b) => a.cost - b.cost)[0];
}

function createStarterBuild(parts) {
  const build = createDefaultBuild();
  const starterCore = getStarterPart(parts, "core");
  const starterWing = getStarterPart(parts, "wings");
  const starterTail = getStarterPart(parts, "tail");
  const starterPower = getStarterPart(parts, "power");

  if (starterCore) {
    build.slots["cell-1-1"] = starterCore.id;
    build.slots["cell-1-2"] = starterCore.id;
  }
  if (starterWing) {
    build.slots["cell-0-2"] = starterWing.id;
  }
  if (starterTail) {
    build.slots["cell-1-0"] = starterTail.id;
  }
  if (starterPower) {
    build.slots["cell-2-2"] = starterPower.id;
  }

  return build;
}

function materialClassName(part) {
  return `tag-material-${materialTierForPart(part)}`;
}

function thrustClassName(part) {
  const type = thrustTypeForPart(part);
  return type ? `tag-thrust-${type}` : "";
}

function getMaterialPalette(tier) {
  if (tier === "kompozit") {
    return {
      top: "#cfd9e2",
      mid: "#8ea1b2",
      bottom: "#627689",
      rim: "rgba(12, 18, 24, 0.44)",
      accent: "#f2cd7d",
    };
  }
  if (tier === "ahsap") {
    return {
      top: "#d4c29a",
      mid: "#b18f63",
      bottom: "#7f6241",
      rim: "rgba(25, 17, 10, 0.44)",
      accent: "#f4dda9",
    };
  }
  return {
    top: "#f4f0d9",
    mid: "#d9cfb2",
    bottom: "#b7ad95",
    rim: "rgba(33, 28, 22, 0.38)",
    accent: "#fff5df",
  };
}

function drawRoundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") {
    ctx.roundRect(x, y, width, height, radius);
    return;
  }
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function drawAirfoil(ctx, x, y, chord, thickness, sweep, fillStyle, strokeStyle, options = {}) {
  const mirrorX = Boolean(options.mirrorX);
  const incidenceDeg = Number(options.incidenceDeg) || 0;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((incidenceDeg * Math.PI) / 180);
  if (mirrorX) {
    ctx.scale(-1, 1);
  }

  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(chord * 0.14, -thickness * 1.05, chord * 0.64, -thickness * 0.38, chord + sweep, 0);
  ctx.bezierCurveTo(chord * 0.68, thickness * 0.5, chord * 0.16, thickness * 0.72, 0, 0);
  ctx.closePath();
  ctx.fillStyle = fillStyle;
  ctx.fill();

  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.strokeStyle = "rgba(244, 253, 255, 0.34)";
  ctx.beginPath();
  ctx.moveTo(chord * 0.08, -thickness * 0.28);
  ctx.quadraticCurveTo(chord * 0.44, -thickness * 0.64, chord * 0.88, -thickness * 0.2);
  ctx.stroke();
  ctx.restore();
}

function drawFinProfile(ctx, rootX, rootY, finLength, finHeight, fillStyle, strokeStyle) {
  const tailChord = finLength * 0.94;
  const tailThickness = Math.max(3, finHeight * 0.12);
  const tailSweep = finLength * 0.24;

  drawAirfoil(
    ctx,
    rootX + finLength * 0.2,
    rootY + finHeight * 0.18,
    tailChord,
    tailThickness,
    tailSweep,
    fillStyle,
    strokeStyle,
    { mirrorX: true, incidenceDeg: -4 },
  );

  ctx.fillStyle = fillStyle;
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = 1;
  const finBaseY = rootY - finHeight * 0.14;
  const finFrontX = rootX + finLength * 0.12;
  const finRearX = rootX - finLength * 0.54;
  const finTipY = rootY - finHeight * 1.02;
  ctx.beginPath();
  ctx.moveTo(finFrontX, finBaseY);
  ctx.lineTo(finRearX, finBaseY);
  ctx.lineTo(finRearX, finTipY);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "rgba(255, 255, 255, 0.16)";
  ctx.beginPath();
  ctx.moveTo(finFrontX - finLength * 0.1, finBaseY - finHeight * 0.04);
  ctx.lineTo(finRearX + finLength * 0.1, finBaseY - finHeight * 0.06);
  ctx.lineTo(finRearX + finLength * 0.08, finTipY + finHeight * 0.16);
  ctx.closePath();
  ctx.fill();
}

function groupSelectedParts(build, partsById) {
  const selected = Object.values(build?.slots || [])
    .map((partId) => (partId ? partsById[partId] : null))
    .filter(Boolean);

  return selected.reduce(
    (acc, part) => {
      acc.all.push(part);
      const key = part.kategori || "unknown";
      if (!acc.byCategory[key]) {
        acc.byCategory[key] = [];
      }
      acc.byCategory[key].push(part);
      return acc;
    },
    { all: [], byCategory: {} },
  );
}

function getDominantMaterial(coreParts) {
  if (!coreParts || coreParts.length === 0) return "kopuk";
  return coreParts
    .map((part) => materialTierForPart(part))
    .sort((a, b) => (MATERIAL_RANK[b] || 0) - (MATERIAL_RANK[a] || 0))[0];
}

function getActivePowerType(powerParts) {
  if (!powerParts || powerParts.length === 0) {
    return null;
  }

  const rank = { electric: 1, gasoline: 2, jet: 3 };
  const selected = [...powerParts].sort((a, b) => {
    const typeA = thrustTypeForPart(a);
    const typeB = thrustTypeForPart(b);
    const score = (rank[typeB] || 0) - (rank[typeA] || 0);
    if (score !== 0) return score;
    return (b.energyOut || 0) - (a.energyOut || 0);
  })[0];

  return thrustTypeForPart(selected);
}

function drawGaragePreview(canvas, build, partsById, timeMs = 0) {
  const ctx = canvas.getContext("2d");
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const dpr = window.devicePixelRatio || 1;

  if (canvas.width !== Math.floor(width * dpr) || canvas.height !== Math.floor(height * dpr)) {
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const t = timeMs / 1000;

  const bg = ctx.createLinearGradient(0, 0, 0, height);
  bg.addColorStop(0, "rgba(67, 119, 144, 0.88)");
  bg.addColorStop(0.58, "rgba(25, 49, 60, 0.92)");
  bg.addColorStop(1, "rgba(9, 19, 24, 0.98)");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "rgba(201, 236, 241, 0.08)";
  for (let i = 0; i < 3; i += 1) {
    const shift = Math.sin(t * 0.8 + i) * 16;
    ctx.fillRect(width * (0.2 + i * 0.24) + shift, 0, 26, height);
  }

  for (let y = 18; y < height; y += 26) {
    ctx.strokeStyle = "rgba(173, 225, 233, 0.1)";
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  const grouped = groupSelectedParts(build, partsById);
  const coreParts = grouped.byCategory.core || [];
  const wingParts = grouped.byCategory.wings || [];
  const tailParts = grouped.byCategory.tail || [];
  const warheadParts = grouped.byCategory.warhead || [];
  const seekerParts = grouped.byCategory.seeker || [];
  const powerParts = grouped.byCategory.power || [];

  const tuning = normalizeBuildTuning(build?.tuning);
  const wingLengthScale = tuning.wingLength / 100;
  const wingSlopeDeg = tuning.wingSlope;
  const finLengthScale = tuning.finLength / 100;
  const finHeightScale = tuning.finHeight / 100;

  const materialTier = getDominantMaterial(coreParts);
  const palette = getMaterialPalette(materialTier);
  const thrustType = getActivePowerType(powerParts);

  const centerX = width * 0.52;
  const centerY = height * 0.56 + Math.sin(t * 1.8) * 1.5;
  const avgCoreWeight =
    coreParts.length > 0 ? coreParts.reduce((sum, part) => sum + (part.weight || 0), 0) / coreParts.length : 18;
  const avgCoreDur =
    coreParts.length > 0
      ? coreParts.reduce((sum, part) => sum + (part.durability || 0), 0) / coreParts.length
      : 52;

  const segmentCount = clamp(coreParts.length || 2, 1, 7);
  const segmentLen = 30 + clamp(avgCoreWeight * 0.5, 8, 24);
  const segmentRadius = 10 + clamp(avgCoreDur * 0.055, 2, 14);
  const segmentGap = 0;
  const bodyLen = segmentCount * segmentLen + (segmentCount - 1) * segmentGap;
  const startX = centerX - bodyLen * 0.5;
  const bodyTop = centerY - segmentRadius;

  ctx.fillStyle = "rgba(0, 0, 0, 0.32)";
  ctx.beginPath();
  ctx.ellipse(centerX + 4, centerY + segmentRadius + 22, bodyLen * 0.6, 12, 0, 0, Math.PI * 2);
  ctx.fill();

  if (coreParts.length === 0) {
    ctx.save();
    ctx.setLineDash([6, 5]);
    ctx.strokeStyle = "rgba(230, 246, 248, 0.65)";
    ctx.lineWidth = 2;
    const placeholderGap = 6;
    for (let i = 0; i < 3; i += 1) {
      const x = startX + i * (segmentLen + placeholderGap);
      drawRoundedRect(ctx, x, bodyTop, segmentLen, segmentRadius * 2, segmentRadius);
      ctx.stroke();
    }
    ctx.restore();
    ctx.fillStyle = "rgba(236, 248, 250, 0.95)";
    ctx.font = "600 15px Trebuchet MS";
    ctx.textAlign = "center";
    ctx.fillText("En az 1 govde silindir parcasi yerlestir", centerX, 34);
  } else {
    const grad = ctx.createLinearGradient(0, bodyTop, 0, bodyTop + segmentRadius * 2);
    grad.addColorStop(0, palette.top);
    grad.addColorStop(0.5, palette.mid);
    grad.addColorStop(1, palette.bottom);

    drawRoundedRect(ctx, startX, bodyTop, bodyLen, segmentRadius * 2, segmentRadius);
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.strokeStyle = palette.rim;
    ctx.lineWidth = 1.3;
    ctx.stroke();

    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.beginPath();
    ctx.ellipse(
      startX + bodyLen * 0.36,
      centerY - segmentRadius * 0.3,
      bodyLen * 0.18,
      segmentRadius * 0.24,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();

    ctx.fillStyle = "rgba(24, 39, 48, 0.88)";
    ctx.beginPath();
    ctx.ellipse(
      startX + bodyLen * 0.66,
      centerY - segmentRadius * 0.12,
      segmentLen * 0.28,
      segmentRadius * 0.28,
      -0.08,
      0,
      Math.PI * 2,
    );
    ctx.fill();

    const noseBaseX = startX + bodyLen;
    const noseLen = warheadParts.length > 0 ? 34 : seekerParts.length > 0 ? 26 : 18;
    const noseColor = warheadParts.length > 0 ? "#f48872" : palette.mid;

    ctx.fillStyle = noseColor;
    ctx.beginPath();
    ctx.moveTo(noseBaseX - 4, centerY - segmentRadius * 0.58);
    ctx.quadraticCurveTo(noseBaseX + noseLen * 0.72, centerY - segmentRadius * 0.2, noseBaseX + noseLen, centerY);
    ctx.quadraticCurveTo(noseBaseX + noseLen * 0.72, centerY + segmentRadius * 0.2, noseBaseX - 4, centerY + segmentRadius * 0.58);
    ctx.closePath();
    ctx.fill();

    if (seekerParts.length > 0) {
      const blink = clamp(0.4 + Math.sin(t * 7) * 0.3, 0.2, 0.85);
      ctx.fillStyle = "#88d9e7";
      ctx.beginPath();
      ctx.arc(noseBaseX + noseLen * 0.7, centerY, 6.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = `rgba(235, 250, 252, ${blink})`;
      ctx.beginPath();
      ctx.arc(noseBaseX + noseLen * 0.8, centerY - 1, 2.7, 0, Math.PI * 2);
      ctx.fill();
    }

    if (wingParts.length > 0) {
      const wingRef = wingParts[0];
      const lift = wingRef?.stats?.lift || 0;
      const control = wingRef?.stats?.control || 0;
      const drag = wingRef?.stats?.drag || 0;

      const wingChord = (58 + control * 2.2) * wingLengthScale;
      const wingThickness = 11 + drag * 1.2;
      const wingSweep = (30 + lift * 3.4 + wingParts.length * 14) * wingLengthScale;
      const wingX = startX + bodyLen * 0.62;
      const wingY = centerY + segmentRadius * 0.55;

      const wingGrad = ctx.createLinearGradient(
        wingX - wingChord - wingSweep,
        wingY - wingThickness,
        wingX,
        wingY + wingThickness * 2,
      );
      wingGrad.addColorStop(0, "rgba(18, 37, 42, 0.86)");
      wingGrad.addColorStop(0.5, "#7ccfc3");
      wingGrad.addColorStop(1, "#d9f2ee");

      drawAirfoil(ctx, wingX, wingY, wingChord, wingThickness, wingSweep, wingGrad, "rgba(219, 246, 246, 0.42)", {
        mirrorX: true,
        incidenceDeg: wingSlopeDeg,
      });

      if (wingParts.length > 1) {
        ctx.globalAlpha = 0.45;
        drawAirfoil(
          ctx,
          wingX - 8,
          wingY + 8,
          wingChord * 0.92,
          wingThickness * 0.8,
          wingSweep * 0.8,
          "rgba(160, 215, 208, 0.7)",
          "rgba(215, 241, 242, 0.42)",
          {
            mirrorX: true,
            incidenceDeg: wingSlopeDeg * 0.92,
          },
        );
        ctx.globalAlpha = 1;
      }
    } else {
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = "rgba(199, 233, 237, 0.5)";
      ctx.beginPath();
      ctx.moveTo(startX + bodyLen * 0.64, centerY + segmentRadius * 0.58);
      ctx.lineTo(startX + bodyLen * 0.3, centerY + segmentRadius * 1.25);
      ctx.lineTo(startX + bodyLen * 0.8, centerY + segmentRadius * 1.2);
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    }

    if (tailParts.length > 0) {
      const tailRef = tailParts[0];
      const finLength = clamp((44 + (tailRef?.stats?.stability || 0) * 2.1) * finLengthScale, 26, 130);
      const finHeight = clamp((24 + (tailRef?.stats?.control || 0) * 2.2) * finHeightScale, 18, 110);
      const finRootX = startX + 18;
      const finRootY = centerY + segmentRadius * 0.16;
      drawFinProfile(
        ctx,
        finRootX,
        finRootY,
        finLength,
        finHeight,
        palette.accent,
        "rgba(17, 24, 26, 0.44)",
      );
    }

    if (thrustType) {
      const nacelleX = startX + bodyLen * 0.24;
      const nacelleY = centerY + segmentRadius * 0.55;
      ctx.fillStyle = "#56646f";
      drawRoundedRect(ctx, nacelleX, nacelleY, 36, 10, 5);
      ctx.fill();

      if (thrustType === "electric") {
        const pulse = clamp(0.35 + Math.sin(t * 8.2) * 0.22, 0.12, 0.78);
        ctx.fillStyle = `rgba(122, 219, 255, ${pulse})`;
        ctx.beginPath();
        ctx.moveTo(startX - 2, centerY + 2);
        ctx.lineTo(startX - 24, centerY - 6);
        ctx.lineTo(startX - 26, centerY + 10);
        ctx.closePath();
        ctx.fill();
      } else if (thrustType === "gasoline") {
        const pulse = clamp(0.46 + Math.sin(t * 10.4) * 0.22, 0.18, 0.78);
        ctx.fillStyle = `rgba(255, 188, 88, ${pulse})`;
        ctx.beginPath();
        ctx.moveTo(startX + 2, centerY + 1);
        ctx.lineTo(startX - 28 - Math.sin(t * 7) * 4, centerY - 9);
        ctx.lineTo(startX - 24 - Math.sin(t * 7) * 4, centerY + 12);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = "rgba(70, 80, 84, 0.24)";
        ctx.beginPath();
        ctx.arc(startX - 26, centerY + 2, 7, 0, Math.PI * 2);
        ctx.fill();
      } else {
        const pulse = clamp(0.55 + Math.sin(t * 12.2) * 0.2, 0.22, 0.9);
        ctx.fillStyle = `rgba(255, 190, 96, ${pulse})`;
        ctx.beginPath();
        ctx.moveTo(startX + 2, centerY + 1);
        ctx.lineTo(startX - 42 - Math.sin(t * 10) * 6, centerY - 11);
        ctx.lineTo(startX - 40 - Math.sin(t * 10) * 6, centerY + 14);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = `rgba(140, 223, 255, ${pulse * 0.75})`;
        ctx.beginPath();
        ctx.moveTo(startX + 1, centerY + 1);
        ctx.lineTo(startX - 32 - Math.sin(t * 10) * 4, centerY - 6);
        ctx.lineTo(startX - 30 - Math.sin(t * 10) * 4, centerY + 9);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  ctx.fillStyle = "rgba(236, 248, 250, 0.93)";
  ctx.font = "600 14px Trebuchet MS";
  ctx.textAlign = "left";
  ctx.fillText("Yan profil kamikaze ucak", 12, 22);
  ctx.fillStyle = "rgba(211, 234, 237, 0.9)";
  ctx.font = "12px Trebuchet MS";
  ctx.fillText(
    `Govde: ${coreParts.length} | Kanat Boy ${tuning.wingLength}% | Kanat Egim ${tuning.wingSlope}deg | Fin Y ${tuning.finHeight}%`,
    12,
    40,
  );
}

function buildLoadoutChips(summary) {
  if (summary.selectedParts.length === 0) {
    return `<span class="small">Henuz parca yerlestirilmedi.</span>`;
  }

  const grouped = summary.selectedParts.reduce((acc, entry) => {
    const key = entry.part.id;
    if (!acc[key]) {
      acc[key] = { part: entry.part, count: 0 };
    }
    acc[key].count += 1;
    return acc;
  }, {});

  return Object.values(grouped)
    .map(({ part, count }) => {
      const label = `${shortName(part.ad, 18)}${count > 1 ? ` x${count}` : ""}`;
      return `<span class="loadout-chip chip-${part.kategori}">${label}</span>`;
    })
    .join("");
}

export function renderGarageScreen({ mount, appState, manager, audio, saveAll }) {
  const partsById = indexPartsById(appState.parts);
  const playerLevel = appState.save.progression.playerLevel;
  const testOverrideActive = isTestOverrideProgression(appState.save.progression);
  const nextLevel = getNextPlayableLevel(appState.save.progression, appState.levels.length);
  const levelBudget = appState.levels[nextLevel - 1]?.budgetLimit || 420;

  let activeCategory = "core";
  let alertMessage = "";

  let workingBuild = appState.save.currentBuild
    ? cloneBuild(appState.save.currentBuild)
    : createStarterBuild(appState.parts);

  let previewAnimationId = null;
  let previewCanvasRef = null;

  function stopPreviewAnimation() {
    if (previewAnimationId) {
      cancelAnimationFrame(previewAnimationId);
      previewAnimationId = null;
    }
    previewCanvasRef = null;
  }

  function startPreviewAnimation(canvas) {
    stopPreviewAnimation();
    previewCanvasRef = canvas;
    drawGaragePreview(previewCanvasRef, workingBuild, partsById, performance.now());

    const frame = (time) => {
      if (!previewCanvasRef) {
        return;
      }
      drawGaragePreview(previewCanvasRef, workingBuild, partsById, time);
      previewAnimationId = requestAnimationFrame(frame);
    };

    previewAnimationId = requestAnimationFrame(frame);
  }

  function isUnlocked(part) {
    return part.unlockLevel <= playerLevel;
  }

  function getSummary() {
    return calculateBuildSummary(workingBuild, partsById, levelBudget, {
      ignoreBudget: testOverrideActive,
      ignoreEnergy: testOverrideActive,
    });
  }

  function render() {
    stopPreviewAnimation();
    const summary = getSummary();
    const tuning = summary.tuning;
    const levelInfo = appState.levels[nextLevel - 1];
    const loadoutChips = buildLoadoutChips(summary);

    const visibleParts = appState.parts
      .filter((part) => part.kategori === activeCategory)
      .sort((a, b) => {
        const materialSort = (MATERIAL_RANK[materialTierForPart(a)] || 0) - (MATERIAL_RANK[materialTierForPart(b)] || 0);
        if (materialSort !== 0) return materialSort;
        if (a.unlockLevel !== b.unlockLevel) return a.unlockLevel - b.unlockLevel;
        return a.cost - b.cost;
      });

    const budgetRatio = levelBudget > 0 ? Math.round((summary.totals.cost / levelBudget) * 100) : 0;
    const energyDanger = !testOverrideActive && summary.stats.energyBalance < 0;
    const budgetDanger = !testOverrideActive && summary.totals.cost > levelBudget;

    mount.innerHTML = `
      <div class="screen-header garage-header">
        <div>
          <h2 class="screen-title">Garaj</h2>
          <div class="screen-subtitle">
            Sonraki gorev: ${levelInfo?.ad || `Gorev ${nextLevel}`} | Butce Limiti: ${levelBudget}
            ${testOverrideActive ? " | Test Override: Butce/Enerji kurali pasif" : ""}
          </div>
        </div>
        <div class="row">
          <button class="btn-secondary" data-action="back">Ana Menu</button>
        </div>
      </div>

      <div class="screen-body">
        <section class="garage-overview">
          <div class="garage-overview-card ${budgetDanger ? "is-alert" : ""}">
            <span>Butce Kullanimi</span>
            <strong>${summary.totals.cost} / ${levelBudget}</strong>
            <small>%${budgetRatio}</small>
          </div>
          <div class="garage-overview-card ${energyDanger ? "is-alert" : ""}">
            <span>Enerji Dengesi</span>
            <strong>${summary.stats.energyBalance}</strong>
            <small>${energyDanger ? "Negatif" : "Dengede"}</small>
          </div>
          <div class="garage-overview-card">
            <span>Pilot Seviyesi</span>
            <strong>${playerLevel}</strong>
            <small>Kategori secimi acik</small>
          </div>
          <div class="garage-overview-card">
            <span>Aktif Parca</span>
            <strong>${summary.totals.selectedCount}</strong>
            <small>Govde ${summary.totals.coreCount} | Kanat ${summary.totals.wingCount}</small>
          </div>
        </section>

        <div class="garage-layout">
          <section class="panel panel-catalog">
            <div class="panel-head">
              <h4>Parca Katalogu</h4>
              <span class="tag">Kademe: Kopuk -> Ahsap -> Kompozit</span>
            </div>
            <div class="small garage-helper-note">Kilitli parcalar pilot seviyesine gore acilir. Acik parcalari surukle birak yap.</div>
            <div class="category-tabs">
              ${Object.entries(CATEGORY_LABELS)
                .map(
                  ([key, label]) =>
                    `<button class="tab ${activeCategory === key ? "active" : ""}" data-action="tab" data-category="${key}">${label}</button>`,
                )
                .join("")}
            </div>
            <div class="part-list">
              ${visibleParts
                .map((part) => {
                  const unlocked = isUnlocked(part);
                  const thrust = part.kategori === "power" ? thrustLabel(thrustTypeForPart(part)) : null;

                  return `
                    <article class="part-card ${unlocked ? "" : "locked"}" draggable="${unlocked}" data-part-id="${part.id}">
                      <h5>${part.ad}</h5>
                      <p>${part.aciklama}</p>
                      <div class="part-meta">
                        <span class="tag ${materialClassName(part)}">Malzeme: ${materialLabel(part)}</span>
                        ${thrust ? `<span class="tag ${thrustClassName(part)}">Itki: ${thrust}</span>` : ""}
                        <span class="tag">Agirlik: ${part.weight}</span>
                        <span class="tag">Day: ${part.durability}</span>
                        <span class="tag">Maliyet: ${part.cost}</span>
                      </div>
                      <p class="small">${unlocked ? "Surukle birak" : `Kilitli | Seviye ${part.unlockLevel}`}</p>
                    </article>
                  `;
                })
                .join("")}
            </div>
          </section>

          <section class="panel panel-build">
            <div class="panel-head">
              <h4>Tasarim Alani</h4>
              <span class="tag">Serbest Grid</span>
            </div>
            <div class="garage-preview-wrap">
              <canvas id="garage-preview-canvas" class="garage-preview-canvas"></canvas>
              <div class="garage-preview-caption">
                <span>Yan Profil Onizleme</span>
                <span>Parca: ${summary.totals.selectedCount}</span>
                <span>Govde: ${summary.totals.coreCount}</span>
                <span>Kanat: ${summary.totals.wingCount}</span>
                <span>Agirlik: ${summary.totals.weight.toFixed(1)}</span>
                <span>Enerji: ${summary.stats.energyBalance}</span>
              </div>
              <div class="garage-preview-loadout">${loadoutChips}</div>
            </div>

            <div class="garage-grid">
              ${Array.from({ length: 3 })
                .map((_, row) => {
                  return Array.from({ length: 5 })
                    .map((__, col) => {
                      const slot = slotAt(row, col);
                      const partId = slot ? workingBuild.slots[slot.id] : null;
                      const part = partId ? partsById[partId] : null;
                      return `
                        <div class="slot ${part ? "filled" : "empty"}" data-slot-id="${slot?.id || ""}">
                          <span class="slot-part">${part ? shortName(part.ad, 16) : ""}</span>
                        </div>
                      `;
                    })
                    .join("");
                })
                .join("")}
            </div>

            <div class="small garage-grid-note">Istedigin parcayi istedigin hucreye birak. Dolu hucreye tiklayarak parcayi cikart.</div>
          </section>

          <section class="panel panel-stats">
            <div class="panel-head">
              <h4>Ucak Istatistikleri</h4>
              <span class="tag">Canli Hesaplama</span>
            </div>
            <div class="tuning-controls">
              <h5>Aerodinamik Ayar</h5>
              <div class="tuning-grid">
                <label class="tuning-item">Kanat Uzunlugu <strong>${tuning.wingLength}%</strong>
                  <input type="range" min="10" max="160" step="1" value="${tuning.wingLength}" data-tuning="wingLength" />
                </label>
                <label class="tuning-item">Kanat Egimi <strong>${tuning.wingSlope}deg</strong>
                  <input type="range" min="-20" max="22" step="1" value="${tuning.wingSlope}" data-tuning="wingSlope" />
                </label>
                <label class="tuning-item">Fin Uzunlugu <strong>${tuning.finLength}%</strong>
                  <input type="range" min="70" max="170" step="1" value="${tuning.finLength}" data-tuning="finLength" />
                </label>
                <label class="tuning-item">Fin Yuksekligi <strong>${tuning.finHeight}%</strong>
                  <input type="range" min="70" max="175" step="1" value="${tuning.finHeight}" data-tuning="finHeight" />
                </label>
              </div>
              <div class="small garage-helper-note">Kanat uzunluk ve egim lift-drag oranini, fin uzunluk ve yukseklik manevrayi etkiler.</div>
            </div>
            <div class="stats-table">
              <div class="stats-item"><span>Butce</span><strong class="${budgetDanger ? "badge-danger" : "badge-ok"}">${summary.totals.cost} / ${levelBudget}</strong></div>
              <div class="stats-item"><span>Toplam Agirlik</span><strong>${summary.totals.weight.toFixed(1)}</strong></div>
              <div class="stats-item"><span>Toplam Dayaniklilik</span><strong>${Math.round(summary.totals.durability)}</strong></div>
              <div class="stats-item"><span>Stabilite</span><strong>${summary.stats.stabilityScore}</strong></div>
              <div class="stats-item"><span>Kontrol</span><strong>${summary.stats.controlScore}</strong></div>
              <div class="stats-item"><span>Manevra</span><strong>${summary.stats.maneuverScore}</strong></div>
              <div class="stats-item"><span>Lift/Drag</span><strong>${summary.stats.liftScore}</strong></div>
              <div class="stats-item"><span>Lift/Drag Orani</span><strong>${summary.stats.liftToDragRatio}</strong></div>
              <div class="stats-item"><span>Enerji Dengesi</span><strong class="${energyDanger ? "badge-danger" : "badge-ok"}">${summary.stats.energyBalance}</strong></div>
              <div class="stats-item"><span>Kilit Kolayligi</span><strong>${summary.stats.lockEase}</strong></div>
              <div class="stats-item"><span>Hasar</span><strong>${summary.stats.damageScore}</strong></div>
            </div>

            ${summary.validation.reasons.length > 0 ? `<div class="alert alert-danger">${summary.validation.reasons.join("<br>")}</div>` : ""}
            ${summary.validation.warnings.length > 0 ? `<div class="alert alert-info">${summary.validation.warnings.join("<br>")}</div>` : ""}
            ${alertMessage ? `<div class="alert alert-info">${alertMessage}</div>` : ""}

            <div class="garage-actions">
              <button class="btn-secondary" data-action="test-flight" ${summary.validation.isValid ? "" : "disabled"}>Test Ucusu</button>
              <button class="btn-secondary" data-action="save-build">Kaydet</button>
              <button class="btn-secondary" data-action="load-build">Yukle</button>
              <button class="btn" data-action="start-mission" ${summary.validation.isValid ? "" : "disabled"}>Goreve Git</button>
            </div>
          </section>
        </div>
      </div>
    `;

    const previewCanvas = mount.querySelector("#garage-preview-canvas");
    if (previewCanvas) {
      startPreviewAnimation(previewCanvas);
    }

    bindDragEvents();
  }

  function bindDragEvents() {
    mount.querySelectorAll(".part-card[draggable='true']").forEach((card) => {
      card.addEventListener("dragstart", (event) => {
        event.dataTransfer.setData("text/plain", card.dataset.partId);
      });
    });

    mount.querySelectorAll(".slot[data-slot-id]").forEach((slotEl) => {
      slotEl.addEventListener("dragover", (event) => {
        event.preventDefault();
      });

      slotEl.addEventListener("drop", (event) => {
        event.preventDefault();
        const slotId = slotEl.dataset.slotId;
        const partId = event.dataTransfer.getData("text/plain");
        const part = partsById[partId];

        if (!slotId || !part || !isUnlocked(part)) {
          alertMessage = "Bu parca kilitli ya da gecersiz.";
          render();
          return;
        }

        const result = placePartInBuild(workingBuild, slotId, partId, partsById);
        if (!result.changed) {
          alertMessage = result.reason;
          render();
          return;
        }

        workingBuild = result.build;
        alertMessage = `${part.ad} eklendi.`;
        audio.click();
        render();
      });
    });
  }

  const onClick = (event) => {
    const tab = event.target.closest("button[data-action='tab']");
    if (tab) {
      activeCategory = tab.dataset.category;
      render();
      return;
    }

    const slot = event.target.closest(".slot[data-slot-id]");
    if (slot) {
      const slotId = slot.dataset.slotId;
      if (slotId && workingBuild.slots[slotId]) {
        workingBuild = removePartFromBuild(workingBuild, slotId);
        alertMessage = "Parca kaldirildi.";
        audio.click();
        render();
      }
      return;
    }

    const button = event.target.closest("button[data-action]");
    if (!button) {
      return;
    }

    const action = button.dataset.action;

    if (action === "back") {
      audio.click();
      manager.show("menu");
      return;
    }

    if (action === "save-build") {
      audio.click();
      appState.save.currentBuild = cloneBuild(workingBuild);
      saveAll();
      alertMessage = "Tasarim kaydedildi.";
      render();
      return;
    }

    if (action === "load-build") {
      audio.click();
      if (!appState.save.currentBuild) {
        alertMessage = "Kayitli tasarim bulunamadi.";
      } else {
        workingBuild = cloneBuild(appState.save.currentBuild);
        alertMessage = "Kayitli tasarim yuklendi.";
      }
      render();
      return;
    }

    if (action === "test-flight") {
      audio.click();
      appState.save.currentBuild = cloneBuild(workingBuild);
      saveAll();
      manager.show("level", { levelNumber: 1, testMode: true });
      return;
    }

    if (action === "start-mission") {
      audio.click();
      appState.save.currentBuild = cloneBuild(workingBuild);
      saveAll();
      manager.show("level", { levelNumber: nextLevel, testMode: false });
    }
  };

  const onInput = (event) => {
    const slider = event.target.closest("input[data-tuning]");
    if (!slider) {
      return;
    }

    const key = slider.dataset.tuning;
    const nextValue = Number(slider.value);
    if (!key || !Number.isFinite(nextValue)) {
      return;
    }

    const previous = workingBuild.tuning || {};
    workingBuild = cloneBuild({
      ...workingBuild,
      tuning: {
        ...previous,
        [key]: nextValue,
      },
    });
    render();
  };

  mount.addEventListener("click", onClick);
  mount.addEventListener("input", onInput);

  render();

  return {
    destroy() {
      stopPreviewAnimation();
      mount.removeEventListener("click", onClick);
      mount.removeEventListener("input", onInput);
    },
  };
}
