function colorForMaterial(material) {
  if (material === "metal") return "#8a9ca8";
  if (material === "beton") return "#90918d";
  return "#b08a61";
}

const DEFAULT_TUNING = {
  wingLength: 100,
  wingSlope: 0,
  finLength: 100,
  finHeight: 100,
};

const FX_LIMIT_TRAIL = 120;
const FX_LIMIT_SPARKS = 140;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
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

function materialTierFromPart(part) {
  if (!part) return "kopuk";
  if (part.materialTier) return part.materialTier;
  if (part.rarity === "epic") return "kompozit";
  if (part.rarity === "rare") return "ahsap";
  return "kopuk";
}

function getMaterialPalette(tier) {
  if (tier === "kompozit") {
    return {
      top: "#d7e0e8",
      mid: "#94a6b7",
      bottom: "#65798b",
      rim: "rgba(9, 15, 21, 0.42)",
      accent: "#f2ce81",
    };
  }
  if (tier === "ahsap") {
    return {
      top: "#d7c59f",
      mid: "#b59062",
      bottom: "#7e6242",
      rim: "rgba(28, 18, 10, 0.43)",
      accent: "#f1e0b4",
    };
  }
  return {
    top: "#f5efda",
    mid: "#dcd1b3",
    bottom: "#b8ad95",
    rim: "rgba(32, 28, 22, 0.38)",
    accent: "#fef5dd",
  };
}

function drawAirfoilProfile(ctx, x, y, chord, thickness, sweep, fillStyle, strokeStyle, options = {}) {
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
  ctx.bezierCurveTo(chord * 0.14, -thickness * 1.04, chord * 0.64, -thickness * 0.36, chord + sweep, 0);
  ctx.bezierCurveTo(chord * 0.68, thickness * 0.5, chord * 0.16, thickness * 0.72, 0, 0);
  ctx.closePath();
  ctx.fillStyle = fillStyle;
  ctx.fill();

  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.strokeStyle = "rgba(239, 252, 255, 0.34)";
  ctx.beginPath();
  ctx.moveTo(chord * 0.08, -thickness * 0.26);
  ctx.quadraticCurveTo(chord * 0.45, -thickness * 0.64, chord * 0.9, -thickness * 0.18);
  ctx.stroke();
  ctx.restore();
}

function drawFinProfile(ctx, rootX, rootY, finLength, finHeight, fillStyle, strokeStyle) {
  const tailChord = finLength * 0.94;
  const tailThickness = Math.max(2.2, finHeight * 0.12);
  const tailSweep = finLength * 0.24;

  drawAirfoilProfile(
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

function inferPowerType(part) {
  if (!part) return null;
  if (part.thrustType) return part.thrustType;
  if ((part.energyOut || 0) >= 6) return "jet";
  if ((part.energyOut || 0) >= 3.5) return "gasoline";
  return "electric";
}

function getActivePowerType(powerParts) {
  if (!powerParts || powerParts.length === 0) return null;
  const rank = { electric: 1, gasoline: 2, jet: 3 };
  const selected = [...powerParts].sort((a, b) => {
    const typeA = inferPowerType(a);
    const typeB = inferPowerType(b);
    const score = (rank[typeB] || 0) - (rank[typeA] || 0);
    if (score !== 0) return score;
    return (b.energyOut || 0) - (a.energyOut || 0);
  })[0];
  return inferPowerType(selected);
}

function activePowerTypeFromState(state) {
  const active = Object.values(state.partDurabilityMap || {}).filter((part) => !part.detached && part.kategori === "power");
  return getActivePowerType(active);
}

function ensureFx(state) {
  if (!state.visualFx) {
    state.visualFx = {
      lastTime: 0,
      trail: [],
      sparks: [],
      trailAccumulator: 0,
      shake: 0,
      shakeX: 0,
      shakeY: 0,
      lastExplosionAt: null,
      lastImpactAt: null,
    };
  }
  return state.visualFx;
}

function pushTrail(fx, p) {
  fx.trail.push(p);
  if (fx.trail.length > FX_LIMIT_TRAIL) {
    fx.trail.splice(0, fx.trail.length - FX_LIMIT_TRAIL);
  }
}

function pushSpark(fx, p) {
  fx.sparks.push(p);
  if (fx.sparks.length > FX_LIMIT_SPARKS) {
    fx.sparks.splice(0, fx.sparks.length - FX_LIMIT_SPARKS);
  }
}

function spawnExplosionBurst(fx, x, y, radius = 56, powerScale = 1) {
  const count = clamp(Math.floor(14 + radius * 0.12 + powerScale * 7), 14, 52);
  for (let i = 0; i < count; i += 1) {
    const a = (Math.PI * 2 * i) / count + Math.random() * 0.25;
    const speed = radius * (0.65 + Math.random() * 1.5) * clamp(powerScale, 1, 2.5);
    const life = 0.3 + Math.random() * 0.48;
    pushSpark(fx, {
      x,
      y,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed - 24,
      ttl: life,
      maxT: life,
      size: 1.2 + Math.random() * 2.7,
      hue: 24 + Math.random() * 26,
    });
  }
}

function updateFx(state, fx, dt) {
  for (const event of state.events || []) {
    if (event.type === "explosion") {
      if (fx.lastExplosionAt !== event.at) {
        fx.lastExplosionAt = event.at;
        const src = state.explosion || state.drone;
        spawnExplosionBurst(
          fx,
          Number(src?.x) || 0,
          Number(src?.y) || 0,
          Number(event.radius) || Number(state.explosion?.radius) || 56,
          Number(event.powerScale) || 1,
        );
      }
      fx.shake = clamp(fx.shake + 6 + (Number(event.radius) || 40) * 0.05, 0, 18);
    } else if (event.type === "impact") {
      if (fx.lastImpactAt !== event.at) {
        fx.lastImpactAt = event.at;
        fx.shake = clamp(fx.shake + Math.min(4, (Number(event.speed) || 0) * 0.08), 0, 18);
      }
    }
  }

  const drone = state.drone;
  if (drone?.launched && !drone.destroyed) {
    const speed = Math.hypot(drone.vx || 0, drone.vy || 0);
    const powerType = activePowerTypeFromState(state);
    const color = powerType === "jet" ? "255,173,99" : powerType === "gasoline" ? "255,199,124" : "141,223,255";

    fx.trailAccumulator += dt * clamp(16 + speed * 0.05, 10, 60);
    while (fx.trailAccumulator >= 1) {
      fx.trailAccumulator -= 1;
      const life = 0.2 + Math.random() * 0.32;
      pushTrail(fx, {
        x: drone.x - Math.cos(drone.angle) * drone.radius * 1.02 + (Math.random() - 0.5) * 2.8,
        y: drone.y - Math.sin(drone.angle) * drone.radius * 1.02 + (Math.random() - 0.5) * 2.8,
        vx: -Math.cos(drone.angle) * (20 + Math.random() * 38) - drone.vx * 0.12,
        vy: -Math.sin(drone.angle) * (18 + Math.random() * 30) - drone.vy * 0.12,
        ttl: life,
        maxT: life,
        size: 1.6 + Math.random() * 3,
        color,
      });
    }
  }

  for (const p of fx.trail) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 1 - dt * 2.5;
    p.vy = p.vy * (1 - dt * 2.1) - dt * 7;
    p.ttl -= dt;
  }
  fx.trail = fx.trail.filter((p) => p.ttl > 0);

  for (const p of fx.sparks) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 1 - dt * 1.2;
    p.vy += 90 * dt;
    p.ttl -= dt;
  }
  fx.sparks = fx.sparks.filter((p) => p.ttl > 0);

  fx.shake = Math.max(0, fx.shake - dt * 10);
  fx.shakeX = (Math.random() - 0.5) * fx.shake;
  fx.shakeY = (Math.random() - 0.5) * fx.shake;
}

function drawCloud(ctx, x, y, scale, alpha) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.fillStyle = `rgba(226, 243, 251, ${alpha})`;
  ctx.beginPath();
  ctx.arc(-22, 0, 18, 0, Math.PI * 2);
  ctx.arc(0, -7, 24, 0, Math.PI * 2);
  ctx.arc(28, 2, 18, 0, Math.PI * 2);
  ctx.arc(50, 2, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawMountainLayer(ctx, width, height, baseY, amp, detail, color, shift, seed) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(-120, height + 80);
  for (let x = -120; x <= width + 120; x += detail) {
    const w = x + shift;
    const y = baseY + Math.sin(w * 0.0038 + seed) * amp + Math.sin(w * 0.0089 + seed * 1.7) * amp * 0.42;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(width + 120, height + 80);
  ctx.closePath();
  ctx.fill();
}

function drawBackground(ctx, width, height, timeSec, camShift) {
  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, "#7eb4cc");
  sky.addColorStop(0.45, "#4a7b95");
  sky.addColorStop(0.74, "#2f5569");
  sky.addColorStop(1, "#1d3543");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  const sunX = width * 0.78 + Math.sin(timeSec * 0.06) * 26 - camShift * 0.02;
  const sunY = height * 0.2 + Math.cos(timeSec * 0.05) * 8;
  const sunGrad = ctx.createRadialGradient(sunX, sunY, 12, sunX, sunY, 110);
  sunGrad.addColorStop(0, "rgba(255, 241, 190, 0.9)");
  sunGrad.addColorStop(0.35, "rgba(255, 214, 136, 0.52)");
  sunGrad.addColorStop(1, "rgba(255, 214, 136, 0)");
  ctx.fillStyle = sunGrad;
  ctx.beginPath();
  ctx.arc(sunX, sunY, 110, 0, Math.PI * 2);
  ctx.fill();

  const horizonY = height * 0.64;
  drawMountainLayer(ctx, width, height, horizonY - 62, 42, 18, "rgba(39, 70, 87, 0.56)", camShift * 0.12, 1.1);
  drawMountainLayer(ctx, width, height, horizonY - 28, 34, 15, "rgba(31, 56, 72, 0.72)", camShift * 0.22, 2.9);

  const step = 160;
  const start = -step * 2 + ((-camShift * 0.22) % step);
  ctx.fillStyle = "rgba(23, 39, 49, 0.45)";
  for (let x = start; x < width + step * 2; x += step) {
    const towerH = 30 + Math.abs(Math.sin((x + camShift) * 0.012)) * 64;
    const stackH = 40 + Math.abs(Math.cos((x + camShift) * 0.015)) * 70;
    ctx.fillRect(x, horizonY - towerH, 88, towerH + 24);
    ctx.fillRect(x + 94, horizonY - stackH, 22, stackH + 18);
  }

  drawCloud(ctx, 120 - camShift * 0.05 + Math.sin(timeSec * 0.06) * 18, 100, 1.05, 0.22);
  drawCloud(ctx, 390 - camShift * 0.08 + Math.cos(timeSec * 0.07) * 22, 66, 0.9, 0.18);
  drawCloud(ctx, 700 - camShift * 0.06 + Math.sin(timeSec * 0.05 + 0.8) * 20, 116, 1.12, 0.2);

  const haze = ctx.createLinearGradient(0, horizonY - 60, 0, horizonY + 120);
  haze.addColorStop(0, "rgba(182, 213, 227, 0)");
  haze.addColorStop(1, "rgba(123, 168, 189, 0.22)");
  ctx.fillStyle = haze;
  ctx.fillRect(0, horizonY - 60, width, 180);
}

function drawGround(ctx, width, groundY, timeSec, camShift) {
  const ground = ctx.createLinearGradient(0, groundY, 0, groundY + 120);
  ground.addColorStop(0, "#33524c");
  ground.addColorStop(0.55, "#243c38");
  ground.addColorStop(1, "#1a2b29");
  ctx.fillStyle = ground;
  ctx.fillRect(0, groundY, width, 120);

  const stripeOffset = (-camShift * 0.35 + timeSec * 20) % 46;
  ctx.strokeStyle = "rgba(132, 182, 154, 0.16)";
  ctx.lineWidth = 1;
  for (let x = -46 + stripeOffset; x < width + 46; x += 46) {
    ctx.beginPath();
    ctx.moveTo(x, groundY + 2);
    ctx.lineTo(x + 26, groundY + 30);
    ctx.lineTo(x + 8, groundY + 52);
    ctx.stroke();
  }

  ctx.strokeStyle = "rgba(126, 180, 126, 0.32)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, groundY + 8);
  for (let x = 0; x < width; x += 20) {
    ctx.lineTo(x, groundY + 8 + Math.sin((x + camShift) * 0.05 + timeSec * 0.6) * 3);
  }
  ctx.stroke();
}
function drawLaunchRamp(ctx, launchPoint) {
  ctx.save();
  ctx.translate(launchPoint.x - 44, launchPoint.y + 20);
  const baseGrad = ctx.createLinearGradient(0, 0, 0, 18);
  baseGrad.addColorStop(0, "#7f96a0");
  baseGrad.addColorStop(1, "#4a5f67");
  ctx.fillStyle = baseGrad;
  drawRoundedRect(ctx, 0, 0, 72, 18, 6);
  ctx.fill();

  ctx.fillStyle = "#9cb3bb";
  drawRoundedRect(ctx, 26, -26, 10, 26, 4);
  ctx.fill();

  ctx.fillStyle = "rgba(203, 236, 246, 0.35)";
  ctx.fillRect(4, 3, 60, 3);
  ctx.restore();
}

function drawLaunchGuide(ctx, state) {
  if (state.drone?.launched) {
    return;
  }

  const assist = state.launchAssist || {};
  const angleDeg = clamp(Number(assist.angleDeg), -80, 20);
  const powerPercent = clamp(Number(assist.powerPercent), 15, 100);
  const launchPoint = state.level.launchPoint || { x: 100, y: state.groundY - 28 };
  const angleRad = (angleDeg * Math.PI) / 180;

  const guideLength = 62 + powerPercent * 0.95;
  const endX = launchPoint.x + Math.cos(angleRad) * guideLength;
  const endY = launchPoint.y + Math.sin(angleRad) * guideLength;

  ctx.save();
  ctx.lineCap = "round";
  ctx.setLineDash([8, 6]);
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(170, 237, 255, 0.9)";
  ctx.beginPath();
  ctx.moveTo(launchPoint.x, launchPoint.y);
  ctx.lineTo(endX, endY);
  ctx.stroke();

  const headSize = 10;
  const nx = -Math.sin(angleRad);
  const ny = Math.cos(angleRad);
  ctx.setLineDash([]);
  ctx.fillStyle = "rgba(170, 237, 255, 0.92)";
  ctx.beginPath();
  ctx.moveTo(endX, endY);
  ctx.lineTo(endX - Math.cos(angleRad) * headSize + nx * headSize * 0.45, endY - Math.sin(angleRad) * headSize + ny * headSize * 0.45);
  ctx.lineTo(endX - Math.cos(angleRad) * headSize - nx * headSize * 0.45, endY - Math.sin(angleRad) * headSize - ny * headSize * 0.45);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "rgba(214, 246, 254, 0.95)";
  ctx.font = "12px Trebuchet MS";
  ctx.fillText(`Aci ${Math.round(angleDeg)}deg`, launchPoint.x + 12, launchPoint.y - 24);
  ctx.restore();
}

function drawObstacles(ctx, obstacles) {
  for (const obstacle of obstacles) {
    if (obstacle.destroyed) continue;

    const base = colorForMaterial(obstacle.material);
    const grad = ctx.createLinearGradient(obstacle.x, obstacle.y, obstacle.x, obstacle.y + obstacle.height);
    grad.addColorStop(0, base);
    grad.addColorStop(1, "rgba(36, 48, 54, 0.92)");

    ctx.fillStyle = grad;
    ctx.fillRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);

    ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
    ctx.fillRect(obstacle.x + 2, obstacle.y + 2, obstacle.width - 4, Math.max(2, obstacle.height * 0.1));

    ctx.strokeStyle = "rgba(0, 0, 0, 0.28)";
    ctx.lineWidth = 1.2;
    ctx.strokeRect(obstacle.x + 0.5, obstacle.y + 0.5, obstacle.width - 1, obstacle.height - 1);
  }
}

function drawTargets(ctx, targets, timeSec) {
  for (const target of targets) {
    if (target.destroyed) continue;

    const pulse = 1 + Math.sin(timeSec * 4.6 + target.x * 0.03) * 0.08;
    const r = target.radius * pulse;

    const g = ctx.createRadialGradient(target.x, target.y, r * 0.18, target.x, target.y, r);
    if (target.targetType === "radar") {
      g.addColorStop(0, "rgba(255, 196, 196, 0.96)");
      g.addColorStop(0.56, "rgba(245, 111, 111, 0.88)");
      g.addColorStop(1, "rgba(164, 52, 52, 0.92)");
    } else {
      g.addColorStop(0, "rgba(255, 234, 186, 0.96)");
      g.addColorStop(0.56, "rgba(247, 201, 109, 0.88)");
      g.addColorStop(1, "rgba(174, 126, 44, 0.94)");
    }

    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(target.x, target.y, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "rgba(255, 250, 222, 0.5)";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(target.x, target.y, r * 1.14, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = "rgba(23, 31, 35, 0.78)";
    ctx.beginPath();
    ctx.arc(target.x, target.y, r * 0.48, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawBonusItems(ctx, bonusItems, timeSec) {
  for (const bonus of bonusItems) {
    if (bonus.collected) continue;
    ctx.save();
    ctx.translate(bonus.x, bonus.y);
    ctx.rotate(timeSec * 0.8);

    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, bonus.radius * 2.2);
    glow.addColorStop(0, "rgba(132, 226, 217, 0.5)");
    glow.addColorStop(1, "rgba(132, 226, 217, 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, bonus.radius * 2.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#84e2d9";
    ctx.beginPath();
    ctx.moveTo(0, -bonus.radius);
    for (let i = 1; i < 10; i += 1) {
      const radius = i % 2 === 0 ? bonus.radius : bonus.radius * 0.42;
      const angle = (-Math.PI / 2) + (i * Math.PI) / 5;
      ctx.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

function drawTrailParticles(ctx, trail) {
  for (const p of trail) {
    const alpha = clamp(p.ttl / p.maxT, 0, 1);
    const radius = p.size * (0.6 + (1 - alpha) * 1.4);

    ctx.fillStyle = `rgba(${p.color}, ${alpha * 0.45})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = `rgba(${p.color}, ${alpha * 0.24})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius * 1.8, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawSparkParticles(ctx, sparks) {
  for (const p of sparks) {
    const alpha = clamp(p.ttl / p.maxT, 0, 1);
    const color = `hsla(${p.hue}, 100%, 68%, ${alpha * 0.9})`;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * (0.55 + alpha), 0, Math.PI * 2);
    ctx.fill();
  }
}
function drawDrone(ctx, state) {
  const drone = state.drone;
  const time = performance.now() * 0.001;

  ctx.save();
  ctx.translate(drone.x, drone.y);
  ctx.rotate(drone.angle);

  const active = Object.values(state.partDurabilityMap).filter((part) => !part.detached);
  const coreParts = active.filter((part) => part.kategori === "core");
  const wings = active.filter((part) => part.kategori === "wings");
  const tailParts = active.filter((part) => part.kategori === "tail");
  const warheadParts = active.filter((part) => part.kategori === "warhead");
  const seekerParts = active.filter((part) => part.kategori === "seeker");
  const powerParts = active.filter((part) => part.kategori === "power");

  const wingPart = wings[0] || null;
  const wingLift = wingPart?.stats?.lift || 0;
  const wingControl = wingPart?.stats?.control || 0;
  const wingDrag = wingPart?.stats?.drag || 0;

  const tuning = {
    ...DEFAULT_TUNING,
    ...(state.liveSummary?.tuning || {}),
  };
  const wingLengthScale = clamp(tuning.wingLength / 100, 0.1, 1.6);
  const wingSlopeDeg = clamp(tuning.wingSlope, -20, 22);
  const finLengthScale = clamp(tuning.finLength / 100, 0.7, 1.7);
  const finHeightScale = clamp(tuning.finHeight / 100, 0.7, 1.75);

  const dominantTier =
    coreParts
      .map((part) => materialTierFromPart(part))
      .sort((a, b) => {
        const rank = { kopuk: 1, ahsap: 2, kompozit: 3 };
        return (rank[b] || 0) - (rank[a] || 0);
      })[0] || "kopuk";

  const palette = getMaterialPalette(dominantTier);
  const powerType = getActivePowerType(powerParts);

  const avgCoreWeight =
    coreParts.length > 0 ? coreParts.reduce((sum, part) => sum + (part.weight || 0), 0) / coreParts.length : 18;
  const avgCoreDur =
    coreParts.length > 0
      ? coreParts.reduce((sum, part) => sum + (part.durability || 0), 0) / coreParts.length
      : 56;

  const segmentCount = clamp(coreParts.length || 1, 1, 6);
  const segmentLen = drone.radius * (0.72 + clamp(avgCoreWeight / 75, 0.06, 0.34));
  const segmentRadius = drone.radius * (0.34 + clamp(avgCoreDur / 260, 0.1, 0.36));
  const segmentGap = 0;
  const bodyLen = segmentCount * segmentLen + (segmentCount - 1) * segmentGap;
  const bodyStartX = -bodyLen * 0.5;

  ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
  ctx.beginPath();
  ctx.ellipse(0, segmentRadius + drone.radius * 0.58, bodyLen * 0.56, drone.radius * 0.24, 0, 0, Math.PI * 2);
  ctx.fill();

  const bodyGrad = ctx.createLinearGradient(0, -segmentRadius, 0, segmentRadius);
  bodyGrad.addColorStop(0, palette.top);
  bodyGrad.addColorStop(0.5, palette.mid);
  bodyGrad.addColorStop(1, palette.bottom);

  drawRoundedRect(ctx, bodyStartX, -segmentRadius, bodyLen, segmentRadius * 2, segmentRadius);
  ctx.fillStyle = bodyGrad;
  ctx.fill();

  ctx.strokeStyle = palette.rim;
  ctx.lineWidth = 1.2;
  ctx.stroke();

  ctx.fillStyle = "rgba(255,255,255,0.18)";
  ctx.beginPath();
  ctx.ellipse(
    bodyStartX + bodyLen * 0.36,
    -segmentRadius * 0.3,
    bodyLen * 0.18,
    segmentRadius * 0.22,
    0,
    0,
    Math.PI * 2,
  );
  ctx.fill();

  const noseBaseX = bodyStartX + bodyLen;
  const hasWarhead = warheadParts.length > 0;
  const hasSeeker = seekerParts.length > 0;
  const noseLen = hasWarhead ? drone.radius * 0.92 : hasSeeker ? drone.radius * 0.74 : drone.radius * 0.56;
  const noseColor = hasWarhead ? "#f48974" : palette.mid;

  ctx.fillStyle = noseColor;
  ctx.beginPath();
  ctx.moveTo(noseBaseX - drone.radius * 0.06, -segmentRadius * 0.55);
  ctx.quadraticCurveTo(noseBaseX + noseLen * 0.72, -segmentRadius * 0.2, noseBaseX + noseLen, 0);
  ctx.quadraticCurveTo(noseBaseX + noseLen * 0.72, segmentRadius * 0.2, noseBaseX - drone.radius * 0.06, segmentRadius * 0.55);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "rgba(24, 38, 49, 0.9)";
  ctx.beginPath();
  ctx.ellipse(
    bodyStartX + bodyLen * 0.66,
    -segmentRadius * 0.1,
    segmentLen * 0.28,
    segmentRadius * 0.28,
    -0.08,
    0,
    Math.PI * 2,
  );
  ctx.fill();

  if (hasSeeker) {
    const blink = clamp(0.35 + Math.sin(time * 7.8) * 0.2, 0.2, 0.85);
    ctx.fillStyle = "#86d9ea";
    ctx.beginPath();
    ctx.arc(noseBaseX + noseLen * 0.7, 0, drone.radius * 0.26, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = `rgba(232, 249, 252, ${blink})`;
    ctx.beginPath();
    ctx.arc(noseBaseX + noseLen * 0.8, -drone.radius * 0.04, drone.radius * 0.1, 0, Math.PI * 2);
    ctx.fill();
  }

  if (wings.length > 0) {
    const wingChord = drone.radius * (1.8 + wingControl * 0.03) * wingLengthScale;
    const wingThickness = drone.radius * (0.24 + wingDrag * 0.012);
    const wingSweep = drone.radius * (0.82 + wingLift * 0.05 + wings.length * 0.18) * wingLengthScale;
    const wingX = bodyStartX + bodyLen * 0.64;
    const wingY = segmentRadius * 0.7;

    const wingGrad = ctx.createLinearGradient(
      wingX - wingChord - wingSweep,
      wingY - wingThickness,
      wingX,
      wingY + wingThickness * 2,
    );
    wingGrad.addColorStop(0, "rgba(18, 37, 42, 0.88)");
    wingGrad.addColorStop(0.5, "#80d0c5");
    wingGrad.addColorStop(1, "#d9f2ee");

    drawAirfoilProfile(ctx, wingX, wingY, wingChord, wingThickness, wingSweep, wingGrad, "rgba(224, 246, 247, 0.42)", {
      mirrorX: true,
      incidenceDeg: wingSlopeDeg,
    });

    if (wings.length > 1) {
      ctx.globalAlpha = 0.45;
      drawAirfoilProfile(
        ctx,
        wingX - drone.radius * 0.24,
        wingY + drone.radius * 0.18,
        wingChord * 0.9,
        wingThickness * 0.8,
        wingSweep * 0.84,
        "rgba(157, 216, 209, 0.72)",
        "rgba(211, 242, 245, 0.42)",
        {
          mirrorX: true,
          incidenceDeg: wingSlopeDeg * 0.92,
        },
      );
      ctx.globalAlpha = 1;
    }
  }

  if (tailParts.length > 0) {
    const tailRef = tailParts[0];
    const finLength = clamp(
      drone.radius * (1.2 + (tailRef?.stats?.stability || 0) * 0.06) * finLengthScale,
      drone.radius * 0.8,
      drone.radius * 3,
    );
    const finHeight = clamp(
      drone.radius * (0.7 + (tailRef?.stats?.control || 0) * 0.05) * finHeightScale,
      drone.radius * 0.5,
      drone.radius * 2.6,
    );

    drawFinProfile(
      ctx,
      bodyStartX + drone.radius * 0.24,
      segmentRadius * 0.16,
      finLength,
      finHeight,
      palette.accent,
      "rgba(22, 29, 31, 0.42)",
    );
  }

  if (powerType) {
    const nacelleX = bodyStartX + bodyLen * 0.22;
    const nacelleY = segmentRadius * 0.55;
    ctx.fillStyle = "#56646f";
    drawRoundedRect(ctx, nacelleX, nacelleY, drone.radius * 1.2, drone.radius * 0.34, drone.radius * 0.12);
    ctx.fill();

    if (powerType === "electric") {
      const pulse = clamp(0.34 + Math.sin(time * 8.2) * 0.2, 0.14, 0.74);
      ctx.fillStyle = `rgba(124, 218, 255, ${pulse})`;
      ctx.beginPath();
      ctx.moveTo(bodyStartX - drone.radius * 0.02, drone.radius * 0.05);
      ctx.lineTo(bodyStartX - drone.radius * 0.86, -drone.radius * 0.24);
      ctx.lineTo(bodyStartX - drone.radius * 0.92, drone.radius * 0.34);
      ctx.closePath();
      ctx.fill();
    } else if (powerType === "gasoline") {
      const pulse = clamp(0.44 + Math.sin(time * 10.2) * 0.22, 0.18, 0.8);
      ctx.fillStyle = `rgba(255, 188, 90, ${pulse})`;
      ctx.beginPath();
      ctx.moveTo(bodyStartX + drone.radius * 0.04, drone.radius * 0.05);
      ctx.lineTo(bodyStartX - drone.radius * 1.04 - Math.sin(time * 7) * drone.radius * 0.16, -drone.radius * 0.33);
      ctx.lineTo(bodyStartX - drone.radius * 0.9 - Math.sin(time * 7) * drone.radius * 0.16, drone.radius * 0.42);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = "rgba(65, 73, 78, 0.25)";
      ctx.beginPath();
      ctx.arc(bodyStartX - drone.radius * 0.95, drone.radius * 0.1, drone.radius * 0.25, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const pulse = clamp(0.54 + Math.sin(time * 12.1) * 0.2, 0.24, 0.9);
      ctx.fillStyle = `rgba(255, 190, 96, ${pulse})`;
      ctx.beginPath();
      ctx.moveTo(bodyStartX + drone.radius * 0.04, drone.radius * 0.04);
      ctx.lineTo(bodyStartX - drone.radius * 1.42 - Math.sin(time * 10) * drone.radius * 0.2, -drone.radius * 0.38);
      ctx.lineTo(bodyStartX - drone.radius * 1.32 - Math.sin(time * 10) * drone.radius * 0.2, drone.radius * 0.5);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = `rgba(141, 223, 255, ${pulse * 0.75})`;
      ctx.beginPath();
      ctx.moveTo(bodyStartX + drone.radius * 0.02, drone.radius * 0.05);
      ctx.lineTo(bodyStartX - drone.radius * 1.08 - Math.sin(time * 10) * drone.radius * 0.14, -drone.radius * 0.23);
      ctx.lineTo(bodyStartX - drone.radius * 1.02 - Math.sin(time * 10) * drone.radius * 0.14, drone.radius * 0.34);
      ctx.closePath();
      ctx.fill();
    }
  }

  ctx.restore();

  if (drone.health > 0) {
    const hpRatio = clamp(drone.health / drone.maxHealth, 0, 1);
    const barWidth = 66;
    const x = drone.x - barWidth / 2;
    const y = drone.y - drone.radius - 18;

    ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
    drawRoundedRect(ctx, x, y, barWidth, 7, 4);
    ctx.fill();

    const hpGrad = ctx.createLinearGradient(x, y, x + barWidth, y);
    hpGrad.addColorStop(0, hpRatio > 0.35 ? "#9ce676" : "#f5a08b");
    hpGrad.addColorStop(1, hpRatio > 0.35 ? "#4fb96d" : "#e06060");

    ctx.fillStyle = hpGrad;
    drawRoundedRect(ctx, x + 0.6, y + 0.6, Math.max(0, (barWidth - 1.2) * hpRatio), 5.8, 3);
    ctx.fill();
  }
}
function drawExplosion(ctx, explosion) {
  if (!explosion) return;

  const ttlMax = Math.max(0.01, Number(explosion.ttlMax) || 0.62);
  const alpha = Math.max(0, Math.min(1, explosion.ttl / ttlMax));
  const powerScale = Math.max(1, Number(explosion.powerScale) || 1);
  const radius = explosion.radius * (1.26 - alpha * 0.54);
  const shockRadius = radius * (1.1 + (1 - alpha) * 0.34) * clamp(powerScale, 1, 2.4);

  ctx.save();
  ctx.globalAlpha = alpha;

  const gradient = ctx.createRadialGradient(explosion.x, explosion.y, radius * 0.15, explosion.x, explosion.y, radius);
  gradient.addColorStop(0, "rgba(255, 245, 184, 0.98)");
  gradient.addColorStop(0.28, "rgba(255, 194, 96, 0.88)");
  gradient.addColorStop(0.56, "rgba(255, 120, 63, 0.78)");
  gradient.addColorStop(1, "rgba(255, 80, 47, 0)");

  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(explosion.x, explosion.y, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.lineWidth = 3 + powerScale * 1.4;
  ctx.strokeStyle = `rgba(255, 214, 134, ${0.6 * alpha})`;
  ctx.beginPath();
  ctx.arc(explosion.x, explosion.y, shockRadius, 0, Math.PI * 2);
  ctx.stroke();

  const spokeCount = 10;
  ctx.strokeStyle = `rgba(255, 232, 175, ${0.52 * alpha})`;
  ctx.lineWidth = 2;
  for (let i = 0; i < spokeCount; i += 1) {
    const a = (Math.PI * 2 * i) / spokeCount;
    const inner = radius * 0.62;
    const outer = shockRadius * (0.9 + (i % 2) * 0.14);
    ctx.beginPath();
    ctx.moveTo(explosion.x + Math.cos(a) * inner, explosion.y + Math.sin(a) * inner);
    ctx.lineTo(explosion.x + Math.cos(a) * outer, explosion.y + Math.sin(a) * outer);
    ctx.stroke();
  }
  ctx.restore();
}

function drawWind(ctx, wind) {
  const startX = 20;
  const startY = 40;
  const mag = Math.hypot(wind.x, wind.y).toFixed(1);

  ctx.strokeStyle = "rgba(210, 240, 244, 0.8)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.lineTo(startX + wind.x * 8, startY + wind.y * 8);
  ctx.stroke();

  ctx.fillStyle = "rgba(210, 240, 244, 0.88)";
  ctx.font = "12px Trebuchet MS";
  ctx.fillText(`Ruzgar ${mag}`, startX, startY - 6);
}

function drawCinematicOverlay(ctx, width, height, timeSec) {
  const vignette = ctx.createRadialGradient(
    width * 0.52,
    height * 0.44,
    Math.min(width, height) * 0.2,
    width * 0.5,
    height * 0.5,
    Math.max(width, height) * 0.72,
  );
  vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
  vignette.addColorStop(1, "rgba(2, 8, 12, 0.42)");

  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);

  const scanAlpha = 0.03 + Math.sin(timeSec * 1.5) * 0.01;
  ctx.fillStyle = `rgba(219, 238, 244, ${scanAlpha})`;
  for (let y = 0; y < height; y += 4) {
    ctx.fillRect(0, y, width, 1);
  }
}

export function resizeCanvasToDisplaySize(canvas) {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  return { width, height };
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext("2d");

  function render(state) {
    const { width, height } = resizeCanvasToDisplaySize(canvas);
    state.bounds.width = width;
    state.bounds.height = height;
    state.groundY = height - 34;

    const fx = ensureFx(state);
    const now = performance.now() * 0.001;
    if (!fx.lastTime) {
      fx.lastTime = now;
    }
    const dt = clamp(now - fx.lastTime, 0.001, 0.05);
    fx.lastTime = now;

    updateFx(state, fx, dt);

    const launchPoint = state.level.launchPoint || { x: 100, y: state.groundY - 28 };
    const camShift = (state.drone.x - launchPoint.x) * 0.5;

    ctx.save();
    ctx.translate(fx.shakeX, fx.shakeY);

    drawBackground(ctx, width, height, now, camShift);
    drawGround(ctx, width, state.groundY, now, camShift);
    drawLaunchRamp(ctx, launchPoint);
    drawLaunchGuide(ctx, state);

    drawTrailParticles(ctx, fx.trail);
    drawObstacles(ctx, state.obstacles);
    drawTargets(ctx, state.targets, now);
    drawBonusItems(ctx, state.bonusItems, now);
    drawDrone(ctx, state);
    drawExplosion(ctx, state.explosion);
    drawSparkParticles(ctx, fx.sparks);
    drawWind(ctx, state.wind);

    ctx.restore();
    drawCinematicOverlay(ctx, width, height, now);
  }

  return {
    render,
  };
}
