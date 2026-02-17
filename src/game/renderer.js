function colorForMaterial(material) {
  if (material === "metal") return "#8a9ca8";
  if (material === "beton") return "#90918d";
  return "#b08a61";
}

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

function drawBackground(ctx, width, height) {
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "#4e7f90");
  gradient.addColorStop(0.55, "#2c5362");
  gradient.addColorStop(1, "#1a343b");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "rgba(255,255,255,0.16)";
  for (let i = 0; i < 4; i += 1) {
    const x = 180 + i * 240;
    const y = 70 + (i % 2) * 28;
    ctx.beginPath();
    ctx.arc(x, y, 34, 0, Math.PI * 2);
    ctx.arc(x + 32, y + 8, 24, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawGround(ctx, width, groundY) {
  ctx.fillStyle = "#304640";
  ctx.fillRect(0, groundY, width, 100);

  ctx.strokeStyle = "rgba(126, 180, 126, 0.35)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, groundY + 8);
  for (let x = 0; x < width; x += 20) {
    ctx.lineTo(x, groundY + 8 + Math.sin(x * 0.05) * 3);
  }
  ctx.stroke();
}

function drawLaunchRamp(ctx, launchPoint) {
  ctx.save();
  ctx.translate(launchPoint.x - 36, launchPoint.y + 20);
  ctx.fillStyle = "#5f7278";
  ctx.fillRect(0, 0, 56, 14);
  ctx.fillStyle = "#7f949b";
  ctx.fillRect(16, -18, 8, 18);
  ctx.restore();
}

function drawObstacles(ctx, obstacles) {
  for (const obstacle of obstacles) {
    if (obstacle.destroyed) continue;
    ctx.fillStyle = colorForMaterial(obstacle.material);
    ctx.fillRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);
    ctx.strokeStyle = "rgba(0, 0, 0, 0.25)";
    ctx.strokeRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);
  }
}

function drawTargets(ctx, targets) {
  for (const target of targets) {
    if (target.destroyed) continue;

    ctx.beginPath();
    ctx.arc(target.x, target.y, target.radius, 0, Math.PI * 2);
    ctx.fillStyle = target.targetType === "radar" ? "#f46f6f" : "#f7c96d";
    ctx.fill();

    ctx.fillStyle = "rgba(23, 31, 35, 0.78)";
    ctx.beginPath();
    ctx.arc(target.x, target.y, target.radius * 0.48, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawBonusItems(ctx, bonusItems) {
  for (const bonus of bonusItems) {
    if (bonus.collected) continue;
    ctx.save();
    ctx.translate(bonus.x, bonus.y);
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

function drawDrone(ctx, state) {
  const drone = state.drone;
  const time = performance.now() * 0.001;

  ctx.save();
  ctx.translate(drone.x, drone.y);
  ctx.rotate(drone.angle);

  const active = Object.values(state.partDurabilityMap).filter((part) => !part.detached);
  const wings = active.filter((part) => part.kategori === "wings");
  const wingCount = wings.length;
  const hasWing = wingCount > 0;
  const hasTail = active.some((part) => part.kategori === "tail");
  const hasWarhead = active.some((part) => part.kategori === "warhead");
  const hasSeeker = active.some((part) => part.kategori === "seeker");
  const hasPower = active.some((part) => part.kategori === "power");

  const wingPart = wings[0] || null;
  const wingLift = wingPart?.stats?.lift || 0;
  const wingControl = wingPart?.stats?.control || 0;
  const wingDrag = wingPart?.stats?.drag || 0;

  const fuselageLen = drone.radius * 3.1;
  const fuselageH = drone.radius * 0.72;
  const tailX = -fuselageLen * 0.57;
  const noseBaseX = fuselageLen * 0.56 - drone.radius * 0.1;
  const noseLen = hasWarhead ? drone.radius * 0.84 : hasSeeker ? drone.radius * 0.68 : drone.radius * 0.5;
  const noseTipX = noseBaseX + noseLen;
  const wingRootX = -fuselageLen * 0.06;

  ctx.fillStyle = "rgba(0, 0, 0, 0.28)";
  ctx.beginPath();
  ctx.ellipse(0, drone.radius * 0.86, drone.radius * 1.95, drone.radius * 0.26, 0, 0, Math.PI * 2);
  ctx.fill();

  if (hasWing) {
    const span = drone.radius * (1.36 + Math.min(0.65, wingCount * 0.24) + wingLift * 0.03);
    const chord = drone.radius * (0.5 + wingControl * 0.015);
    const sweep = drone.radius * (0.22 + wingDrag * 0.01);
    const wingGrad = ctx.createLinearGradient(
      wingRootX,
      fuselageH * 0.08,
      wingRootX + chord * 1.4 + span,
      fuselageH * 0.82 + sweep,
    );
    wingGrad.addColorStop(0, "#d9e3e8");
    wingGrad.addColorStop(0.5, "#98a8b2");
    wingGrad.addColorStop(1, "#4f616c");
    ctx.fillStyle = wingGrad;

    ctx.beginPath();
    ctx.moveTo(wingRootX - chord * 0.44, fuselageH * 0.08);
    ctx.lineTo(wingRootX + chord * 1.95, fuselageH * 0.22);
    ctx.lineTo(wingRootX + chord * 1.44 + span, fuselageH * 0.82 + sweep);
    ctx.lineTo(wingRootX + chord * 0.08 + span * 0.34, fuselageH * 0.74 + sweep * 1.15);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "rgba(8, 14, 18, 0.2)";
    ctx.beginPath();
    ctx.moveTo(wingRootX + chord * 0.18, fuselageH * 0.18);
    ctx.lineTo(wingRootX + chord * 1.54, fuselageH * 0.26);
    ctx.lineTo(wingRootX + chord * 1.1 + span * 0.84, fuselageH * 0.7 + sweep * 0.84);
    ctx.lineTo(wingRootX + chord * 0.28 + span * 0.24, fuselageH * 0.64 + sweep);
    ctx.closePath();
    ctx.fill();

    if (wingCount > 1) {
      ctx.fillStyle = "rgba(224, 236, 241, 0.34)";
      ctx.beginPath();
      ctx.moveTo(wingRootX - chord * 0.2, fuselageH * 0.16);
      ctx.lineTo(wingRootX + chord * 1.68, fuselageH * 0.24);
      ctx.lineTo(wingRootX + chord * 1.22 + span * 0.9, fuselageH * 0.65 + sweep * 0.72);
      ctx.lineTo(wingRootX + chord * 0.04 + span * 0.36, fuselageH * 0.62 + sweep * 0.94);
      ctx.closePath();
      ctx.fill();
    }
  }

  if (hasTail) {
    const tailSpan = drone.radius * 0.58;
    const tailRootX = tailX + drone.radius * 0.36;
    ctx.fillStyle = "#9badb7";

    ctx.beginPath();
    ctx.moveTo(tailRootX + drone.radius * 0.04, fuselageH * 0.1);
    ctx.lineTo(tailRootX + drone.radius * 1.06, fuselageH * 0.1);
    ctx.lineTo(tailRootX + drone.radius * 1.55, tailSpan + fuselageH * 0.44);
    ctx.lineTo(tailRootX + drone.radius * 0.54, tailSpan + fuselageH * 0.34);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(tailRootX + drone.radius * 0.1, -fuselageH * 0.02);
    ctx.lineTo(tailRootX - drone.radius * 0.26, -fuselageH * 0.94);
    ctx.lineTo(tailRootX + drone.radius * 0.5, -fuselageH * 0.44);
    ctx.closePath();
    ctx.fill();
  }

  const bodyGrad = ctx.createLinearGradient(0, -fuselageH * 0.58, 0, fuselageH * 0.62);
  bodyGrad.addColorStop(0, "#d6dee2");
  bodyGrad.addColorStop(0.45, "#9eacb4");
  bodyGrad.addColorStop(1, "#6d7c86");
  ctx.fillStyle = bodyGrad;
  ctx.strokeStyle = "rgba(0, 0, 0, 0.38)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(tailX + drone.radius * 0.45, -fuselageH * 0.46);
  ctx.bezierCurveTo(
    -drone.radius * 0.74,
    -fuselageH * 0.67,
    drone.radius * 0.74,
    -fuselageH * 0.63,
    noseBaseX,
    -fuselageH * 0.36,
  );
  ctx.lineTo(noseTipX, 0);
  ctx.lineTo(noseBaseX, fuselageH * 0.36);
  ctx.bezierCurveTo(
    drone.radius * 0.74,
    fuselageH * 0.63,
    -drone.radius * 0.74,
    fuselageH * 0.67,
    tailX + drone.radius * 0.45,
    fuselageH * 0.46,
  );
  ctx.quadraticCurveTo(tailX - drone.radius * 0.08, 0, tailX + drone.radius * 0.45, -fuselageH * 0.46);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "rgba(255,255,255,0.2)";
  ctx.beginPath();
  ctx.moveTo(-drone.radius * 0.5, -fuselageH * 0.38);
  ctx.quadraticCurveTo(drone.radius * 0.35, -fuselageH * 0.5, noseBaseX - drone.radius * 0.3, -fuselageH * 0.2);
  ctx.lineTo(-drone.radius * 0.2, -fuselageH * 0.17);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "rgba(22, 38, 48, 0.9)";
  ctx.beginPath();
  ctx.ellipse(drone.radius * 0.42, -fuselageH * 0.12, drone.radius * 0.4, drone.radius * 0.16, -0.1, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#3b444c";
  ctx.beginPath();
  ctx.moveTo(noseBaseX - drone.radius * 0.03, -drone.radius * 0.22);
  ctx.lineTo(noseTipX + drone.radius * 0.34, 0);
  ctx.lineTo(noseBaseX - drone.radius * 0.03, drone.radius * 0.22);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "rgba(28, 42, 50, 0.3)";
  ctx.lineWidth = 0.8;
  for (let i = 0; i < 4; i += 1) {
    const x = -drone.radius * 0.72 + i * drone.radius * 0.62;
    ctx.beginPath();
    ctx.moveTo(x, -fuselageH * 0.24);
    ctx.lineTo(x + drone.radius * 0.05, fuselageH * 0.26);
    ctx.stroke();
  }

  if (hasWarhead) {
    ctx.fillStyle = "#f58a76";
    ctx.beginPath();
    ctx.moveTo(noseBaseX - drone.radius * 0.08, -drone.radius * 0.24);
    ctx.lineTo(noseTipX + drone.radius * 0.42, 0);
    ctx.lineTo(noseBaseX - drone.radius * 0.08, drone.radius * 0.24);
    ctx.closePath();
    ctx.fill();
  }

  if (hasSeeker) {
    const blink = 0.35 + Math.sin(time * 7.8) * 0.2;
    ctx.fillStyle = "#86d9ea";
    ctx.beginPath();
    ctx.arc(noseTipX - drone.radius * 0.05, 0, drone.radius * 0.28, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `rgba(232, 249, 252, ${clamp(blink, 0.2, 0.85)})`;
    ctx.beginPath();
    ctx.arc(noseTipX + drone.radius * 0.05, -drone.radius * 0.04, drone.radius * 0.11, 0, Math.PI * 2);
    ctx.fill();
  }

  if (hasPower) {
    const flame = 0.35 + Math.sin(time * 10.8) * 0.2;
    ctx.fillStyle = "#efc37b";
    drawRoundedRect(
      ctx,
      wingRootX + drone.radius * 0.72,
      fuselageH * 0.2,
      drone.radius * 0.9,
      drone.radius * 0.24,
      drone.radius * 0.09,
    );
    ctx.fill();

    ctx.fillStyle = `rgba(255, 200, 96, ${clamp(flame, 0.16, 0.7)})`;
    ctx.beginPath();
    ctx.moveTo(tailX + drone.radius * 0.02, -drone.radius * 0.02);
    ctx.lineTo(tailX - drone.radius * 0.74 - Math.sin(time * 14) * drone.radius * 0.18, -drone.radius * 0.26);
    ctx.lineTo(tailX - drone.radius * 0.7 - Math.sin(time * 14) * drone.radius * 0.18, drone.radius * 0.3);
    ctx.lineTo(tailX + drone.radius * 0.02, drone.radius * 0.15);
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();

  if (drone.health > 0) {
    const hpRatio = drone.health / drone.maxHealth;
    const barWidth = 62;
    const x = drone.x - barWidth / 2;
    const y = drone.y - drone.radius - 16;
    ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
    ctx.fillRect(x, y, barWidth, 6);
    ctx.fillStyle = hpRatio > 0.35 ? "#8fdf63" : "#f47e6f";
    ctx.fillRect(x, y, barWidth * hpRatio, 6);
  }
}

function drawExplosion(ctx, explosion) {
  if (!explosion) return;

  const alpha = Math.max(0, Math.min(1, explosion.ttl / 0.45));
  const radius = explosion.radius * (1.2 - alpha * 0.6);

  ctx.save();
  ctx.globalAlpha = alpha;

  const gradient = ctx.createRadialGradient(explosion.x, explosion.y, radius * 0.15, explosion.x, explosion.y, radius);
  gradient.addColorStop(0, "rgba(255, 233, 124, 0.95)");
  gradient.addColorStop(0.45, "rgba(255, 141, 77, 0.74)");
  gradient.addColorStop(1, "rgba(255, 80, 47, 0)");

  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(explosion.x, explosion.y, radius, 0, Math.PI * 2);
  ctx.fill();
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
  ctx.fillText(`Rüzgar ${mag}`, startX, startY - 6);
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

    drawBackground(ctx, width, height);
    drawGround(ctx, width, state.groundY);
    drawLaunchRamp(ctx, state.level.launchPoint || { x: 100, y: state.groundY - 28 });
    drawObstacles(ctx, state.obstacles);
    drawTargets(ctx, state.targets);
    drawBonusItems(ctx, state.bonusItems);
    drawDrone(ctx, state);
    drawExplosion(ctx, state.explosion);
    drawWind(ctx, state.wind);
  }

  return {
    render,
  };
}
