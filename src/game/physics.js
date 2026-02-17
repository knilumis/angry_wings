import { summarizeFromDurabilityMap } from "../systems/buildSystem.js";

const GRAVITY = 116;
const BASE_THRUST_PER_ENERGY = 3.15;
const THRUST_MULTIPLIER_BY_TYPE = {
  electric: 1.38,
  gasoline: 1.82,
  jet: 2.28,
};
const EXPLOSION_TTL = 0.62;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeAngle(angle) {
  let a = angle;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function deepCopy(value) {
  return JSON.parse(JSON.stringify(value));
}

function rectCircleCollision(rect, circle) {
  const closestX = clamp(circle.x, rect.x, rect.x + rect.width);
  const closestY = clamp(circle.y, rect.y, rect.y + rect.height);
  const dx = circle.x - closestX;
  const dy = circle.y - closestY;
  return dx * dx + dy * dy <= circle.radius * circle.radius;
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function getImpactSpeed(drone) {
  return Math.hypot(drone.vx, drone.vy);
}

function inferPowerType(part) {
  if (!part) return null;
  if (part.thrustType) return part.thrustType;
  if ((part.energyOut || 0) >= 6) return "jet";
  if ((part.energyOut || 0) >= 3.5) return "gasoline";
  return "electric";
}

function getThrustMultiplier(state) {
  const activePowerParts = Object.values(state.partDurabilityMap).filter(
    (part) => !part.detached && part.kategori === "power",
  );
  if (activePowerParts.length === 0) {
    return 1;
  }

  return activePowerParts.reduce((maxMultiplier, part) => {
    const type = inferPowerType(part);
    const candidate = THRUST_MULTIPLIER_BY_TYPE[type] || 1;
    return Math.max(maxMultiplier, candidate);
  }, 1);
}

function getWarheadPowerScale(state) {
  const activeWarheads = Object.values(state.partDurabilityMap).filter(
    (part) => !part.detached && part.kategori === "warhead",
  );

  if (activeWarheads.length === 0) {
    return 1;
  }

  const damageRadiusScore = Math.max(0, Number(state.liveSummary?.stats?.damageRadius) || 0);
  const countBonus = Math.min(0.32, activeWarheads.length * 0.16);
  const statBonus = Math.min(0.7, damageRadiusScore * 0.07);
  return 1.18 + countBonus + statBonus;
}

function materialMultiplier(material) {
  if (material === "metal") return 1.25;
  if (material === "beton") return 1.5;
  return 1;
}

function getMissionStarsFromDamagePercent(percent) {
  const safePercent = clamp(Number(percent) || 0, 0, 100);
  if (safePercent >= 90) return 3;
  if (safePercent >= 75) return 2;
  if (safePercent >= 60) return 1;
  return 0;
}

function refreshMissionRating(state) {
  const totalDurability = Math.max(0, Number(state.totalTargetDurability) || 0);
  if (totalDurability <= 0) {
    state.targetDamageDealt = 0;
    state.targetDamagePercent = 100;
    state.missionStars = 3;
    return;
  }

  const remainingDurability = state.targets.reduce((sum, target) => {
    return sum + Math.max(0, Number(target.durability) || 0);
  }, 0);

  const dealt = clamp(totalDurability - remainingDurability, 0, totalDurability);
  const percent = clamp((dealt / totalDurability) * 100, 0, 100);

  state.targetDamageDealt = Math.round(dealt * 10) / 10;
  state.targetDamagePercent = Math.round(percent * 10) / 10;
  state.missionStars = getMissionStarsFromDamagePercent(percent);
}

function finalizeMissionByDamage(state) {
  if (state.status === "active" || state.missionResolved) {
    return;
  }

  refreshMissionRating(state);
  const passed = state.missionStars >= 1;
  state.status = passed ? "success" : "fail";
  state.missionResolved = true;
  addEvent(state, {
    type: passed ? "missionSuccess" : "missionFail",
    reason: "damageThreshold",
    damagePercent: state.targetDamagePercent,
    stars: state.missionStars,
  });
}

function addEvent(state, event) {
  state.events.push({ ...event, at: state.time });
}

function pickDamageTarget(state) {
  const entries = Object.entries(state.partDurabilityMap).filter(([, part]) => !part.detached);
  if (entries.length === 0) {
    return null;
  }

  const nonCore = entries.filter(([, part]) => part.kategori !== "core");
  const pool = nonCore.length > 0 ? nonCore : entries;
  const selected = pool[Math.floor(Math.random() * pool.length)];
  return { slotId: selected[0], part: selected[1] };
}

function refreshLiveSummary(state) {
  state.liveSummary = summarizeFromDurabilityMap(state.partDurabilityMap, state.baseSummary);
}

function applyImpactDamage(state, impact) {
  const effective = Math.max(0, impact - 8);
  if (effective <= 0) {
    return;
  }

  const droneDamage = effective * (1.2 - Math.min(0.55, state.liveSummary.stats.stabilityScore / 180));
  state.drone.health = Math.max(0, state.drone.health - droneDamage);

  const hit = pickDamageTarget(state);
  if (hit) {
    hit.part.durability = Math.max(0, hit.part.durability - effective * 0.8);
    if (hit.part.durability <= 0 && !hit.part.detached) {
      hit.part.detached = true;
      state.detachedParts.push(hit.part.ad);
      addEvent(state, { type: "partDetached", partName: hit.part.ad });
      refreshLiveSummary(state);
    }
  }

  if (state.drone.health <= 0) {
    state.drone.destroyed = true;
    addEvent(state, { type: "droneDestroyed" });
  }
}

function applyExplosionDamage(state, x, y, radius, powerScale = 1) {
  for (const obstacle of state.obstacles) {
    if (obstacle.destroyed) continue;
    const center = { x: obstacle.x + obstacle.width / 2, y: obstacle.y + obstacle.height / 2 };
    const dist = distance({ x, y }, center);
    const maxDist = radius + Math.max(obstacle.width, obstacle.height) * 0.5;
    if (dist > maxDist) continue;

    const damage = (1 - dist / maxDist) * 130 * powerScale;
    obstacle.durability -= damage;
    if (obstacle.durability <= 0) {
      obstacle.destroyed = true;
      state.damageDealt += 70;
    }
  }

  for (const target of state.targets) {
    if (target.destroyed) continue;
    const dist = distance({ x, y }, target);
    if (dist > radius + target.radius) continue;

    const damage = (1 - dist / (radius + target.radius)) * 190 * powerScale;
    target.durability -= damage;
    if (target.durability <= 0) {
      target.destroyed = true;
      state.damageDealt += 140;
      state.destroyedTargets += 1;
      state.destroyedByType[target.targetType] = (state.destroyedByType[target.targetType] || 0) + 1;
      addEvent(state, { type: "targetDestroyed", targetType: target.targetType, targetId: target.id });
    }
  }
}

function triggerExplosion(state, reason = "impact") {
  if (state.explosion) {
    return;
  }

  const damageRadiusScore = Math.max(0, Number(state.liveSummary?.stats?.damageRadius) || 0);
  const warheadPowerScale = getWarheadPowerScale(state);
  const blastScale = 0.88 + warheadPowerScale * 0.24;
  const radius = clamp((30 + damageRadiusScore * 18) * blastScale, 24, 240);
  state.explosion = {
    x: state.drone.x,
    y: state.drone.y,
    radius,
    ttl: EXPLOSION_TTL,
    ttlMax: EXPLOSION_TTL,
    powerScale: warheadPowerScale,
  };
  state.drone.destroyed = true;
  state.lastExplosionAt = state.time;
  addEvent(state, { type: "explosion", reason, radius, powerScale: warheadPowerScale });
  applyExplosionDamage(state, state.drone.x, state.drone.y, radius, warheadPowerScale);
}

function collisionWithObstacles(state) {
  for (const obstacle of state.obstacles) {
    if (obstacle.destroyed) {
      continue;
    }

    const hit = rectCircleCollision(obstacle, {
      x: state.drone.x,
      y: state.drone.y,
      radius: state.drone.radius,
    });

    if (!hit) {
      continue;
    }

    const impact = getImpactSpeed(state.drone);
    const damage = impact * 1.05 * (1 + state.liveSummary.stats.damageScore / 180);
    obstacle.durability -= damage / materialMultiplier(obstacle.material);

    if (obstacle.durability <= 0) {
      obstacle.destroyed = true;
      state.damageDealt += 90;
    }

    applyImpactDamage(state, impact * 0.8 * materialMultiplier(obstacle.material));

    const obstacleCenterY = obstacle.y + obstacle.height / 2;
    if (state.drone.y < obstacleCenterY) {
      state.drone.vy = -Math.abs(state.drone.vy) * 0.3;
    } else {
      state.drone.vy = Math.abs(state.drone.vy) * 0.3;
    }
    state.drone.vx *= -0.45;

    if (impact > 30 - state.liveSummary.stats.damageRadius * 0.8) {
      triggerExplosion(state, "obstacle");
      return;
    }

    addEvent(state, { type: "impact", material: obstacle.material, speed: impact });
  }
}

function collisionWithTargets(state) {
  for (const target of state.targets) {
    if (target.destroyed) {
      continue;
    }

    const dist = distance(target, state.drone);
    if (dist > state.drone.radius + target.radius) {
      continue;
    }

    const impact = getImpactSpeed(state.drone);
    target.durability -= impact * 1.4 + 8;

    if (target.durability <= 0) {
      target.destroyed = true;
      state.destroyedTargets += 1;
      state.destroyedByType[target.targetType] = (state.destroyedByType[target.targetType] || 0) + 1;
      state.damageDealt += 160;
      addEvent(state, { type: "targetDestroyed", targetType: target.targetType, targetId: target.id });
    }

    applyImpactDamage(state, impact * 0.55);

    if (impact > 18) {
      triggerExplosion(state, "target");
      return;
    }

    state.drone.vx *= 0.72;
    state.drone.vy *= 0.72;
    addEvent(state, { type: "impact", material: "target", speed: impact });
  }
}

function collectBonusItems(state) {
  for (const bonus of state.bonusItems) {
    if (bonus.collected) {
      continue;
    }

    const dist = distance(bonus, state.drone);
    if (dist > bonus.radius + state.drone.radius) {
      continue;
    }

    bonus.collected = true;
    state.collectedBonus += 1;
    state.damageDealt += 40;
    addEvent(state, { type: "bonusCollected", bonusId: bonus.id });
  }
}

function applyAutopilot(state, inputPitch) {
  const drone = state.drone;
  const stats = state.liveSummary.stats;
  let autopilotPitch = 0;

  if (state.autopilotMode === "stabilize" || state.autopilotMode === "terminal") {
    const velocityAngle = Math.atan2(drone.vy, drone.vx || 0.001);
    const diff = normalizeAngle(velocityAngle - drone.angle);
    autopilotPitch += diff * 0.7 - drone.angularVelocity * 0.22;
  }

  if (state.autopilotMode === "terminal") {
    const nearest = state.targets
      .filter((target) => !target.destroyed)
      .map((target) => ({ target, dist: distance(target, drone) }))
      .sort((a, b) => a.dist - b.dist)[0];

    if (nearest && nearest.dist < 320) {
      const desiredAngle = Math.atan2(nearest.target.y - drone.y, nearest.target.x - drone.x);
      const diff = normalizeAngle(desiredAngle - drone.angle);
      const assistStrength = clamp(stats.guidance / 18 + stats.lockEase / 60, 0.1, 1.8);
      autopilotPitch += diff * assistStrength;
    }
  }

  const authority = clamp(0.8 + stats.controlScore / 100, 0.35, 2.1);
  const command = clamp(inputPitch + autopilotPitch, -1.8, 1.8);
  return command * authority;
}

function applyGroundCollision(state) {
  if (state.drone.y + state.drone.radius < state.groundY) {
    return;
  }

  const impact = getImpactSpeed(state.drone);
  state.drone.y = state.groundY - state.drone.radius;
  state.drone.vy = -Math.abs(state.drone.vy) * 0.24;
  state.drone.vx *= 0.7;

  applyImpactDamage(state, impact * 0.9);
  addEvent(state, { type: "impact", material: "zemin", speed: impact });

  if (impact > 26 - state.liveSummary.stats.damageRadius * 0.6) {
    triggerExplosion(state, "ground");
  }
}

function advanceExplosion(state, dt) {
  if (!state.explosion) {
    return;
  }

  state.explosion.ttl -= dt;
  if (state.explosion.ttl <= 0) {
    state.explosion = null;
  }
}

export function createMissionState({ level, buildSummary, durabilityMap, canvasSize }) {
  // Seviye + build verisini fizik döngüsünün çalışacağı tek bir durum nesnesine çevirir.
  const launchPoint = level.launchPoint || { x: 140, y: 370 };
  const targets = deepCopy(level.targets || []).map((item) => ({
    ...item,
    radius: item.radius || 22,
    durability: item.durability,
    maxDurability: item.durability,
    destroyed: false,
  }));
  const totalTargetDurability = targets.reduce((sum, target) => {
    return sum + Math.max(0, Number(target.maxDurability) || 0);
  }, 0);

  const initialHealth = Math.max(80, buildSummary.totals.durability * 0.62);

  return {
    level: deepCopy(level),
    baseSummary: buildSummary,
    liveSummary: buildSummary,
    partDurabilityMap: deepCopy(durabilityMap),
    detachedParts: [],
    drone: {
      x: launchPoint.x,
      y: launchPoint.y,
      vx: 0,
      vy: 0,
      angle: -0.1,
      angularVelocity: 0,
      radius: clamp(12 + buildSummary.totals.weight * 0.08, 12, 30),
      health: initialHealth,
      maxHealth: initialHealth,
      launched: false,
      destroyed: false,
      throttle: 0.65,
    },
    obstacles: deepCopy(level.obstacles || []).map((item) => ({
      ...item,
      durability: item.durability,
      destroyed: false,
    })),
    targets,
    totalTargetDurability: Math.round(totalTargetDurability * 10) / 10,
    targetDamageDealt: 0,
    targetDamagePercent: totalTargetDurability > 0 ? 0 : 100,
    missionStars: totalTargetDurability > 0 ? 0 : 3,
    missionResolved: false,
    bonusItems: (level.bonusItems || []).map((item) => ({ ...item, collected: false })),
    objectives: deepCopy(level.objectives || []),
    wind: {
      x: level.wind?.x || 0,
      y: level.wind?.y || 0,
    },
    groundY: (canvasSize?.height || 640) - 34,
    bounds: {
      width: canvasSize?.width || 1200,
      height: canvasSize?.height || 640,
    },
    timeLimit: level.timeLimit || 80,
    time: 0,
    score: 0,
    damageDealt: 0,
    destroyedTargets: 0,
    destroyedByType: {},
    collectedBonus: 0,
    autopilotMode: "off",
    explosion: null,
    lastExplosionAt: null,
    status: "active",
    events: [],
  };
}

export function launchDrone(state, { powerPercent = 65, angleDeg = -20 }) {
  if (state.drone.launched || state.status !== "active") {
    return;
  }

  const power = clamp(powerPercent, 15, 100);
  const angle = (clamp(angleDeg, -80, 20) * Math.PI) / 180;
  const speed = 150 + power * 2.55;

  state.drone.launched = true;
  state.drone.angle = angle;
  state.drone.vx = Math.cos(angle) * speed;
  state.drone.vy = Math.sin(angle) * speed;
  state.drone.throttle = power / 100;
  addEvent(state, { type: "launch", power, angleDeg });
}

export function setAutopilotMode(state, mode) {
  state.autopilotMode = ["off", "stabilize", "terminal"].includes(mode) ? mode : "off";
}

function updateObjectives(state) {
  const progress = state.objectives.map((objective) => {
    if (objective.type === "destroyTargets") {
      const current = state.destroyedTargets;
      const done = current >= objective.count;
      return {
        ...objective,
        current,
        done,
      };
    }

    if (objective.type === "destroyType") {
      const current = state.destroyedByType[objective.targetType] || 0;
      const done = current >= objective.count;
      return {
        ...objective,
        current,
        done,
      };
    }

    if (objective.type === "collectBonus") {
      const current = state.collectedBonus;
      const done = current >= objective.count;
      return {
        ...objective,
        current,
        done,
      };
    }

    return {
      ...objective,
      current: 0,
      done: false,
    };
  });

  state.objectiveProgress = progress;
}

function updateScore(state) {
  const timePenalty = Math.floor(state.time * 4);
  const healthBonus = Math.floor(state.drone.health * 0.7);
  state.score = Math.max(0, state.damageDealt + state.destroyedTargets * 180 + state.collectedBonus * 70 + healthBonus - timePenalty);
}

export function stepPhysics(state, dt, inputPitch = 0) {
  // Her frame: kuvvetler, çarpışmalar, hedef ilerlemesi ve skor tek noktadan güncellenir.
  if (state.status !== "active") {
    advanceExplosion(state, dt);
    updateObjectives(state);
    refreshMissionRating(state);
    finalizeMissionByDamage(state);
    updateScore(state);
    return state;
  }

  state.events = [];
  state.time += dt;

  if (state.drone.launched && !state.drone.destroyed) {
    const drone = state.drone;
    const stats = state.liveSummary.stats;

    const controlCommand = applyAutopilot(state, inputPitch);
    drone.angularVelocity += controlCommand * dt * 4.6;

    const damping = clamp(0.16 + stats.stabilityScore / 220, 0.08, 0.56);
    drone.angularVelocity *= 1 - damping * dt;
    drone.angle += drone.angularVelocity * dt;

    const relVx = drone.vx - state.wind.x;
    const relVy = drone.vy - state.wind.y;
    const dragBase = Number.isFinite(stats.effectiveDrag) ? stats.effectiveDrag : Math.max(0, stats.drag);
    const dragCoefficient = 0.11 + Math.max(0, dragBase) * 0.005;

    drone.vx += -relVx * dragCoefficient * dt;
    drone.vy += -relVy * dragCoefficient * dt;

    const liftStrength = Math.max(0, stats.liftScore) * 0.85;
    drone.vx += -Math.sin(drone.angle) * liftStrength * dt;
    drone.vy += -Math.cos(drone.angle) * liftStrength * dt;

    const thrustMultiplier = getThrustMultiplier(state);
    const throttleFactor = clamp(0.52 + (drone.throttle || 0.65) * 0.95, 0.52, 1.48);
    const thrust =
      Math.max(0, state.liveSummary.stats.energyBalance) * BASE_THRUST_PER_ENERGY * thrustMultiplier * throttleFactor;
    drone.vx += Math.cos(drone.angle) * thrust * dt;
    drone.vy += Math.sin(drone.angle) * thrust * dt;

    drone.vy += GRAVITY * dt;

    drone.x += drone.vx * dt;
    drone.y += drone.vy * dt;

    applyGroundCollision(state);
    collisionWithObstacles(state);
    collisionWithTargets(state);
    collectBonusItems(state);

    if (
      drone.x < -120 ||
      drone.x > state.bounds.width + 120 ||
      drone.y > state.bounds.height + 220 ||
      drone.y < -220
    ) {
      state.status = "fail";
      addEvent(state, { type: "missionFail", reason: "bounds" });
    }

    if (drone.destroyed && !state.explosion) {
      state.status = "fail";
      addEvent(state, { type: "missionFail", reason: "destroyed" });
    }
  }

  if (state.time >= state.timeLimit && state.status === "active") {
    state.status = "fail";
    addEvent(state, { type: "missionFail", reason: "timeout" });
  }

  advanceExplosion(state, dt);
  updateObjectives(state);
  refreshMissionRating(state);

  if (state.status === "active" && state.targetDamagePercent >= 100) {
    state.status = "success";
  }

  if (state.status === "active" && state.drone.destroyed && !state.explosion) {
    state.status = "fail";
    addEvent(state, { type: "missionFail", reason: "destroyed" });
  }

  finalizeMissionByDamage(state);

  if (state.status === "success" && state.explosion) {
    state.explosion = null;
  }

  updateScore(state);
  return state;
}

export function getObjectiveProgress(state) {
  return state.objectiveProgress || [];
}
