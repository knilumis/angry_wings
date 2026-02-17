import {
  SLOT_DEFINITIONS,
  createDefaultBuild,
  indexPartsById,
  placePartInBuild,
  removePartFromBuild,
  calculateBuildSummary,
  cloneBuild,
} from "../systems/buildSystem.js";
import { getNextPlayableLevel } from "../systems/progressionSystem.js";

const CATEGORY_LABELS = {
  core: "Core",
  wings: "Kanat",
  tail: "Kuyruk",
  warhead: "Harp",
  seeker: "Arayıcı",
  autopilot: "Otopilot",
  link: "Link",
  power: "Güç",
  extra: "Ek",
};

const SLOT_LABELS = SLOT_DEFINITIONS.reduce((acc, slot) => {
  acc[slot.id] = slot.label;
  return acc;
}, {});

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
    build.slots.core = starterCore.id;
  }
  if (starterWing) {
    build.slots.wingLeft = starterWing.id;
    build.slots.wingRight = starterWing.id;
  }
  if (starterTail) {
    build.slots.tail = starterTail.id;
  }
  if (starterPower) {
    build.slots.power = starterPower.id;
  }

  return build;
}

function rarityLabel(rarity) {
  if (rarity === "epic") return "Efsane";
  if (rarity === "rare") return "Nadir";
  return "Standart";
}

function slotAt(row, col) {
  return SLOT_DEFINITIONS.find((slot) => slot.grid.row === row && slot.grid.col === col) || null;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function moduleColor(part, fallback = "#8ad4d8") {
  if (!part) {
    return fallback;
  }
  if (part.rarity === "epic") {
    return "#f17f76";
  }
  if (part.rarity === "rare") {
    return "#f4c16d";
  }
  return "#78d6c7";
}

function moduleAccent(part, fallback = "#cceeed") {
  if (!part) {
    return fallback;
  }
  if (part.rarity === "epic") {
    return "#ffd4cc";
  }
  if (part.rarity === "rare") {
    return "#ffe9be";
  }
  return "#d7f6f1";
}

function getAirframePalette(core) {
  if (!core) {
    return {
      top: "#c9d6db",
      mid: "#9aa9b0",
      bottom: "#6f7f86",
      line: "rgba(18, 24, 28, 0.45)",
      accent: "#a7d7d1",
    };
  }

  if (core.rarity === "epic") {
    return {
      top: "#b8c2ce",
      mid: "#8e9db1",
      bottom: "#66788f",
      line: "rgba(11, 17, 22, 0.5)",
      accent: "#f5d07f",
    };
  }

  if (core.rarity === "rare") {
    return {
      top: "#c2cdc1",
      mid: "#95a493",
      bottom: "#6f816d",
      line: "rgba(14, 20, 16, 0.48)",
      accent: "#9fd8c8",
    };
  }

  return {
    top: "#cfd7d8",
    mid: "#a9b4b8",
    bottom: "#78858c",
    line: "rgba(18, 24, 28, 0.45)",
    accent: "#8cd0d7",
  };
}

function shortName(value, max = 17) {
  if (!value || value.length <= max) {
    return value;
  }
  return `${value.slice(0, max - 3)}...`;
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
}

function drawCallout(ctx, note, width, height) {
  const textPaddingX = 6;
  const textHeight = 16;
  const fontSize = 11;

  ctx.save();
  ctx.font = `600 ${fontSize}px Trebuchet MS`;

  const textWidth = ctx.measureText(note.text).width;
  const boxWidth = textWidth + textPaddingX * 2;
  const boxXRaw = note.align === "right" ? note.x - boxWidth : note.x;
  const boxX = clamp(boxXRaw, 8, width - boxWidth - 8);
  const boxY = clamp(note.y, 8, height - textHeight - 8);
  const attachX = note.align === "right" ? boxX + boxWidth : boxX;
  const attachY = boxY + textHeight * 0.55;

  ctx.strokeStyle = note.color;
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(note.anchorX, note.anchorY);
  ctx.lineTo(attachX, attachY);
  ctx.stroke();

  ctx.fillStyle = "rgba(5, 14, 18, 0.82)";
  drawRoundedRect(ctx, boxX, boxY, boxWidth, textHeight, 5);
  ctx.fill();
  ctx.strokeStyle = note.color;
  ctx.stroke();

  ctx.fillStyle = "#eef8fa";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(note.text, boxX + textPaddingX, boxY + textHeight * 0.55);
  ctx.restore();
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
  bg.addColorStop(0, "rgba(63, 119, 145, 0.85)");
  bg.addColorStop(0.56, "rgba(24, 50, 62, 0.92)");
  bg.addColorStop(1, "rgba(12, 26, 33, 0.98)");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  const beamShift = Math.sin(t * 0.9) * 28;
  ctx.fillStyle = "rgba(218, 246, 251, 0.09)";
  ctx.beginPath();
  ctx.moveTo(width * 0.22 + beamShift, 0);
  ctx.lineTo(width * 0.33 + beamShift, 0);
  ctx.lineTo(width * 0.18 + beamShift - 36, height);
  ctx.lineTo(width * 0.08 + beamShift - 36, height);
  ctx.closePath();
  ctx.fill();

  for (let y = 20; y < height - 34; y += 26) {
    ctx.strokeStyle = "rgba(172, 230, 240, 0.1)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
  for (let x = 24; x < width; x += 26) {
    ctx.strokeStyle = "rgba(172, 230, 240, 0.1)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }

  const floorGrad = ctx.createLinearGradient(0, height - 64, 0, height);
  floorGrad.addColorStop(0, "rgba(36, 58, 66, 0.2)");
  floorGrad.addColorStop(1, "rgba(7, 14, 18, 0.9)");
  ctx.fillStyle = floorGrad;
  ctx.fillRect(0, height - 64, width, 64);

  const core = build.slots.core ? partsById[build.slots.core] : null;
  const wingLeft = build.slots.wingLeft ? partsById[build.slots.wingLeft] : null;
  const wingRight = build.slots.wingRight ? partsById[build.slots.wingRight] : null;
  const wingCount = [wingLeft, wingRight].filter(Boolean).length;
  const wingPart = wingRight || wingLeft;
  const tail = build.slots.tail ? partsById[build.slots.tail] : null;
  const warhead = build.slots.warhead ? partsById[build.slots.warhead] : null;
  const seeker = build.slots.seeker ? partsById[build.slots.seeker] : null;
  const autopilot = build.slots.autopilot ? partsById[build.slots.autopilot] : null;
  const link = build.slots.link ? partsById[build.slots.link] : null;
  const power = build.slots.power ? partsById[build.slots.power] : null;
  const extra1 = build.slots.extra1 ? partsById[build.slots.extra1] : null;
  const extra2 = build.slots.extra2 ? partsById[build.slots.extra2] : null;

  const centerX = width * 0.52;
  const centerY = height * 0.54 + Math.sin(t * 1.9) * 1.5;
  const weightFactor = clamp((core?.weight || 20) / 36, 0.55, 1.2);
  const armorFactor = clamp((core?.durability || 80) / 130, 0.55, 1.2);
  const fuselageLen = 150 + weightFactor * 30;
  const fuselageH = 24 + armorFactor * 10;
  const noseLen = warhead ? 28 : seeker ? 22 : 16;
  const tailX = centerX - fuselageLen * 0.5;
  const noseBaseX = centerX + fuselageLen * 0.5 - 12;
  const noseTipX = noseBaseX + noseLen;
  const wingRootX = centerX - fuselageLen * 0.06;
  const callouts = [];

  if (!core) {
    ctx.save();
    ctx.strokeStyle = "rgba(231, 246, 247, 0.74)";
    ctx.setLineDash([7, 5]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(tailX + 18, centerY - fuselageH * 0.45);
    ctx.lineTo(noseBaseX, centerY - fuselageH * 0.4);
    ctx.lineTo(noseTipX, centerY);
    ctx.lineTo(noseBaseX, centerY + fuselageH * 0.4);
    ctx.lineTo(tailX + 18, centerY + fuselageH * 0.45);
    ctx.quadraticCurveTo(tailX - 4, centerY, tailX + 18, centerY - fuselageH * 0.45);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(wingRootX - 6, centerY + 2);
    ctx.lineTo(wingRootX + 46, centerY + 6);
    ctx.lineTo(wingRootX + 108, centerY + 42);
    ctx.lineTo(wingRootX + 42, centerY + 34);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = "#e8f4f4";
    ctx.font = "600 15px Trebuchet MS";
    ctx.textAlign = "center";
    ctx.fillText("Core takmadan uçak gövdesi tamamlanmaz", centerX, 34);
    return;
  }

  const palette = getAirframePalette(core);
  const fuselageTop = centerY - fuselageH * 0.52;
  const fuselageBottom = centerY + fuselageH * 0.46;
  const fuselageTailX = tailX + 14;

  ctx.fillStyle = "rgba(5, 13, 16, 0.42)";
  ctx.beginPath();
  ctx.ellipse(centerX + 8, centerY + 58, 142, 18, 0, 0, Math.PI * 2);
  ctx.fill();

  if (wingPart) {
    const wingSpanX = 82 + (wingPart.stats?.lift || 0) * 3.4 + wingCount * 10;
    const wingDropY = 20 + (wingPart.stats?.drag || 0) * 1.6;
    const wingChord = 30 + (wingPart.stats?.control || 0) * 1.2;

    const wingGrad = ctx.createLinearGradient(
      wingRootX,
      centerY + fuselageH * 0.1,
      wingRootX + wingSpanX,
      centerY + fuselageH * 0.9,
    );
    wingGrad.addColorStop(0, moduleAccent(wingPart, "#d9f4ef"));
    wingGrad.addColorStop(0.45, moduleColor(wingPart, "#7dd5c7"));
    wingGrad.addColorStop(1, "rgba(23, 41, 46, 0.85)");
    ctx.fillStyle = wingGrad;
    ctx.beginPath();
    ctx.moveTo(wingRootX - wingChord * 0.42, centerY + fuselageH * 0.08);
    ctx.lineTo(wingRootX + wingChord * 2.2, centerY + fuselageH * 0.2);
    ctx.lineTo(wingRootX + wingChord * 1.64 + wingSpanX, centerY + fuselageH * 0.9 + wingDropY);
    ctx.lineTo(wingRootX + wingChord * 0.16 + wingSpanX * 0.38, centerY + fuselageH * 0.82 + wingDropY * 1.1);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = "rgba(232, 248, 250, 0.34)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(wingRootX + wingChord * 0.1, centerY + fuselageH * 0.16);
    ctx.lineTo(wingRootX + wingChord * 1.96 + wingSpanX * 0.82, centerY + fuselageH * 0.82 + wingDropY * 0.78);
    ctx.stroke();

    callouts.push({
      text: `Ana Kanat: ${shortName(wingPart.ad)}`,
      color: moduleColor(wingPart),
      anchorX: wingRootX + wingChord * 1.2 + wingSpanX * 0.65,
      anchorY: centerY + fuselageH * 0.88 + wingDropY * 0.56,
      x: wingRootX + wingChord * 1.1 + wingSpanX * 0.72,
      y: centerY + fuselageH * 0.95 + wingDropY + 18,
      align: "left",
    });
  } else {
    ctx.strokeStyle = "rgba(184, 224, 230, 0.42)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(wingRootX + 4, centerY + fuselageH * 0.1);
    ctx.lineTo(wingRootX + 54, centerY + fuselageH * 0.2);
    ctx.lineTo(wingRootX + 112, centerY + fuselageH * 0.66);
    ctx.lineTo(wingRootX + 34, centerY + fuselageH * 0.62);
    ctx.closePath();
    ctx.stroke();
  }

  if (tail) {
    const tailLift = tail.stats?.stability || 0;
    const tailRootX = fuselageTailX + 8;
    const tailSpanX = 54 + tailLift * 1.2;
    const tailDrop = 16 + tailLift * 0.7;
    ctx.fillStyle = moduleColor(tail, "#9ec7d1");

    ctx.beginPath();
    ctx.moveTo(tailRootX, centerY + fuselageH * 0.12);
    ctx.lineTo(tailRootX + tailSpanX * 0.52, centerY + fuselageH * 0.1);
    ctx.lineTo(tailRootX + tailSpanX, centerY + fuselageH * 0.16 + tailDrop);
    ctx.lineTo(tailRootX + tailSpanX * 0.25, centerY + fuselageH * 0.16 + tailDrop * 0.8);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(tailRootX + 6, centerY - fuselageH * 0.04);
    ctx.lineTo(tailRootX - 10, centerY - fuselageH * 1.05);
    ctx.lineTo(tailRootX + 24, centerY - fuselageH * 0.46);
    ctx.closePath();
    ctx.fill();

    callouts.push({
      text: `${CATEGORY_LABELS.tail}: ${shortName(tail.ad)}`,
      color: moduleColor(tail),
      anchorX: tailRootX + 9,
      anchorY: centerY - fuselageH * 0.78,
      x: tailRootX - 94,
      y: centerY - fuselageH - 20,
      align: "right",
    });
  }

  const fuselageGrad = ctx.createLinearGradient(centerX, fuselageTop, centerX, fuselageBottom);
  fuselageGrad.addColorStop(0, palette.top);
  fuselageGrad.addColorStop(0.5, palette.mid);
  fuselageGrad.addColorStop(1, palette.bottom);
  ctx.fillStyle = fuselageGrad;
  ctx.strokeStyle = palette.line;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(fuselageTailX + 8, fuselageTop + fuselageH * 0.2);
  ctx.bezierCurveTo(
    centerX - fuselageLen * 0.28,
    fuselageTop - fuselageH * 0.34,
    centerX + fuselageLen * 0.16,
    fuselageTop - fuselageH * 0.22,
    noseBaseX,
    centerY - fuselageH * 0.32,
  );
  ctx.lineTo(noseTipX, centerY - fuselageH * 0.06);
  ctx.quadraticCurveTo(noseTipX + 3, centerY, noseTipX, centerY + fuselageH * 0.06);
  ctx.lineTo(noseBaseX, centerY + fuselageH * 0.33);
  ctx.bezierCurveTo(
    centerX + fuselageLen * 0.2,
    fuselageBottom + fuselageH * 0.18,
    centerX - fuselageLen * 0.3,
    fuselageBottom + fuselageH * 0.15,
    fuselageTailX + 14,
    fuselageBottom,
  );
  ctx.quadraticCurveTo(fuselageTailX - 10, centerY + fuselageH * 0.1, fuselageTailX + 8, fuselageTop + fuselageH * 0.2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "rgba(255,255,255,0.2)";
  ctx.beginPath();
  ctx.moveTo(centerX - fuselageLen * 0.18, fuselageTop + fuselageH * 0.02);
  ctx.quadraticCurveTo(centerX + fuselageLen * 0.06, fuselageTop - fuselageH * 0.14, noseBaseX - 22, centerY - fuselageH * 0.22);
  ctx.lineTo(centerX - fuselageLen * 0.08, centerY - fuselageH * 0.22);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "rgba(26, 43, 54, 0.88)";
  ctx.beginPath();
  ctx.moveTo(centerX + fuselageLen * 0.02, centerY - fuselageH * 0.42);
  ctx.quadraticCurveTo(centerX + fuselageLen * 0.22, centerY - fuselageH * 0.5, centerX + fuselageLen * 0.29, centerY - fuselageH * 0.28);
  ctx.quadraticCurveTo(centerX + fuselageLen * 0.17, centerY - fuselageH * 0.16, centerX + fuselageLen * 0.02, centerY - fuselageH * 0.2);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "rgba(193, 228, 236, 0.4)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(centerX + fuselageLen * 0.04, centerY - fuselageH * 0.35);
  ctx.quadraticCurveTo(centerX + fuselageLen * 0.15, centerY - fuselageH * 0.42, centerX + fuselageLen * 0.24, centerY - fuselageH * 0.3);
  ctx.stroke();

  ctx.fillStyle = "rgba(27, 40, 49, 0.72)";
  ctx.beginPath();
  ctx.ellipse(centerX + fuselageLen * 0.08, centerY + fuselageH * 0.24, 12, 6.2, 0, 0, Math.PI * 2);
  ctx.fill();

  for (let i = 0; i < 5; i += 1) {
    const x = centerX - fuselageLen * 0.18 + i * (fuselageLen * 0.14);
    ctx.strokeStyle = "rgba(28, 44, 53, 0.28)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, centerY - fuselageH * 0.28);
    ctx.lineTo(x + 5, centerY + fuselageH * 0.26);
    ctx.stroke();
  }

  ctx.fillStyle = palette.accent;
  ctx.fillRect(centerX - fuselageLen * 0.04, centerY + fuselageH * 0.04, 26, 3);
  ctx.fillRect(centerX - fuselageLen * 0.18, centerY + fuselageH * 0.01, 16, 2.5);

  callouts.push({
    text: `${CATEGORY_LABELS.core}: ${shortName(core.ad)}`,
    color: moduleAccent(core),
    anchorX: centerX + 4,
    anchorY: centerY - fuselageH * 0.62,
    x: centerX - 58,
    y: centerY - 86,
    align: "left",
  });

  if (warhead) {
    ctx.fillStyle = moduleColor(warhead, "#f48173");
    ctx.beginPath();
    ctx.moveTo(noseBaseX - 3, centerY - 8.5);
    ctx.lineTo(noseTipX + 12, centerY);
    ctx.lineTo(noseBaseX - 3, centerY + 8.5);
    ctx.closePath();
    ctx.fill();

    callouts.push({
      text: `${CATEGORY_LABELS.warhead}: ${shortName(warhead.ad)}`,
      color: moduleColor(warhead),
      anchorX: noseTipX + 4,
      anchorY: centerY + 1,
      x: noseTipX + 22,
      y: centerY + 20,
      align: "left",
    });
  }

  if (seeker) {
    const blink = clamp(0.45 + Math.sin(t * 6.2) * 0.3, 0.15, 0.9);
    ctx.fillStyle = moduleColor(seeker, "#8ed8ea");
    ctx.beginPath();
    ctx.arc(noseTipX - 2, centerY, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `rgba(225, 249, 252, ${blink})`;
    ctx.beginPath();
    ctx.arc(noseTipX, centerY - 1, 3.3, 0, Math.PI * 2);
    ctx.fill();

    callouts.push({
      text: `${CATEGORY_LABELS.seeker}: ${shortName(seeker.ad)}`,
      color: moduleColor(seeker),
      anchorX: noseTipX - 2,
      anchorY: centerY - 2,
      x: noseTipX + 20,
      y: centerY - 38,
      align: "left",
    });
  }

  if (autopilot) {
    ctx.fillStyle = moduleColor(autopilot, "#e8d790");
    drawRoundedRect(ctx, centerX - 8, centerY - fuselageH * 0.95, 38, 10, 4);
    ctx.fill();
    callouts.push({
      text: `${CATEGORY_LABELS.autopilot}: ${shortName(autopilot.ad)}`,
      color: moduleColor(autopilot),
      anchorX: centerX + 10,
      anchorY: centerY - fuselageH * 0.9,
      x: centerX + 50,
      y: centerY - 74,
      align: "left",
    });
  }

  if (link) {
    const mastX = tailX + 44;
    ctx.strokeStyle = moduleColor(link, "#a8deea");
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(mastX, centerY - 3);
    ctx.lineTo(mastX - 7, centerY - 19);
    ctx.stroke();

    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(mastX - 7, centerY - 19, 5, -1.35, 0.2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(mastX - 7, centerY - 19, 9, -1.35, 0.2);
    ctx.stroke();

    callouts.push({
      text: `${CATEGORY_LABELS.link}: ${shortName(link.ad)}`,
      color: moduleColor(link),
      anchorX: mastX - 7,
      anchorY: centerY - 19,
      x: mastX - 98,
      y: centerY - 52,
      align: "right",
    });
  }

  if (power) {
    const flame = clamp(0.42 + Math.sin(t * 9.4) * 0.2, 0.2, 0.7);
    const nacelleX = centerX - fuselageLen * 0.02;
    ctx.fillStyle = moduleColor(power, "#efc47e");
    drawRoundedRect(ctx, nacelleX, centerY + fuselageH * 0.18, 34, 10, 4);
    ctx.fill();

    ctx.fillStyle = `rgba(255, 203, 110, ${flame})`;
    ctx.beginPath();
    ctx.moveTo(tailX - 4, centerY + 2);
    ctx.lineTo(tailX - 24 - Math.sin(t * 11.4) * 6, centerY - 7);
    ctx.lineTo(tailX - 20 - Math.sin(t * 11.4) * 6, centerY + 12);
    ctx.closePath();
    ctx.fill();

    callouts.push({
      text: `${CATEGORY_LABELS.power}: ${shortName(power.ad)}`,
      color: moduleColor(power),
      anchorX: nacelleX + 18,
      anchorY: centerY + fuselageH * 0.32,
      x: nacelleX + 16,
      y: centerY + 30,
      align: "right",
    });
  }

  if (extra1) {
    const x = wingRootX + 72;
    const y = centerY - fuselageH * 0.72;
    ctx.fillStyle = moduleColor(extra1, "#8ccbe6");
    ctx.beginPath();
    ctx.arc(x, y, 6.2, 0, Math.PI * 2);
    ctx.fill();

    callouts.push({
      text: `${CATEGORY_LABELS.extra}: ${shortName(extra1.ad)}`,
      color: moduleColor(extra1),
      anchorX: x,
      anchorY: y,
      x: x + 14,
      y: y - 24,
      align: "left",
    });
  }

  if (extra2) {
    const x = wingRootX + 98;
    const y = centerY + fuselageH * 0.72;
    ctx.fillStyle = moduleColor(extra2, "#8ccbe6");
    ctx.beginPath();
    ctx.arc(x, y, 6.2, 0, Math.PI * 2);
    ctx.fill();

    callouts.push({
      text: `${CATEGORY_LABELS.extra}: ${shortName(extra2.ad)}`,
      color: moduleColor(extra2),
      anchorX: x,
      anchorY: y,
      x: x + 14,
      y: y + 12,
      align: "left",
    });
  }

  for (const note of callouts) {
    drawCallout(ctx, note, width, height);
  }

  ctx.fillStyle = "rgba(236, 248, 249, 0.93)";
  ctx.font = "600 14px Trebuchet MS";
  ctx.textAlign = "left";
  ctx.fillText(core.ad, 12, 22);
  ctx.fillStyle = "rgba(211, 234, 237, 0.88)";
  ctx.font = "12px Trebuchet MS";
  ctx.fillText(`Canlı Uçak Profili (Yandan) • Modül Sayısı ${Object.values(build.slots).filter(Boolean).length}`, 12, 40);
}

export function renderGarageScreen({ mount, appState, manager, audio, saveAll }) {
  const partsById = indexPartsById(appState.parts);
  const playerLevel = appState.save.progression.playerLevel;
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
    return calculateBuildSummary(workingBuild, partsById, levelBudget);
  }

  function render() {
    stopPreviewAnimation();
    const summary = getSummary();
    const levelInfo = appState.levels[nextLevel - 1];
    const loadoutChips =
      summary.selectedParts.length > 0
        ? summary.selectedParts
            .map((entry) => {
              const slotLabel = SLOT_LABELS[entry.slotId] || entry.slotId;
              return `<span class="loadout-chip chip-${entry.part.kategori}">${slotLabel}: ${shortName(entry.part.ad, 18)}</span>`;
            })
            .join("")
        : `<span class="small">Henüz parça yerleştirilmedi.</span>`;

    mount.innerHTML = `
      <div class="screen-header">
        <div>
          <h2 class="screen-title">Garaj</h2>
          <div class="screen-subtitle">Sonraki görev: ${levelInfo?.ad || `Görev ${nextLevel}`} • Bütçe Limiti: ${levelBudget}</div>
        </div>
        <div class="row">
          <button class="btn-secondary" data-action="back">Ana Menü</button>
        </div>
      </div>

      <div class="screen-body">
        <div class="garage-layout">
          <section class="panel">
            <h4>Parça Kataloğu</h4>
            <div class="category-tabs">
              ${Object.entries(CATEGORY_LABELS)
                .map(
                  ([key, label]) =>
                    `<button class="tab ${activeCategory === key ? "active" : ""}" data-action="tab" data-category="${key}">${label}</button>`,
                )
                .join("")}
            </div>
            <div class="part-list">
              ${appState.parts
                .filter((part) => part.kategori === activeCategory)
                .map((part) => {
                  const unlocked = isUnlocked(part);
                  return `
                    <article class="part-card ${unlocked ? "" : "locked"}" draggable="${unlocked}" data-part-id="${part.id}">
                      <h5>${part.ad}</h5>
                      <p>${part.aciklama}</p>
                      <div class="part-meta">
                        <span class="tag">Ağırlık: ${part.weight}</span>
                        <span class="tag">Day.: ${part.durability}</span>
                        <span class="tag">Maliyet: ${part.cost}</span>
                        <span class="tag">${rarityLabel(part.rarity)}</span>
                      </div>
                      <p class="small">${unlocked ? "Sürükleyip slota bırak" : `Kilitli • Seviye ${part.unlockLevel}`}</p>
                    </article>
                  `;
                })
                .join("")}
            </div>
          </section>

          <section class="panel">
            <h4>Tasarım Alanı (Grid + Snap)</h4>
            <div class="garage-preview-wrap">
              <canvas id="garage-preview-canvas" class="garage-preview-canvas"></canvas>
              <div class="garage-preview-caption">
                <span>Canlı Önizleme (Yandan)</span>
                <span>Parça: ${summary.selectedParts.length}</span>
                <span>Ağırlık: ${summary.totals.weight.toFixed(1)}</span>
                <span>Enerji: ${summary.stats.energyBalance}</span>
                <span>Stabilite: ${summary.stats.stabilityScore}</span>
              </div>
              <div class="garage-preview-loadout">${loadoutChips}</div>
            </div>
            <div class="garage-grid">
              ${Array.from({ length: 3 })
                .map((_, row) => {
                  return Array.from({ length: 5 })
                    .map((__, col) => {
                      const slot = slotAt(row, col);
                      if (!slot) {
                        return `<div class="slot" style="opacity:.15; border-style:dashed;"></div>`;
                      }

                      const partId = workingBuild.slots[slot.id];
                      const part = partId ? partsById[partId] : null;
                      const requiredClass = slot.required ? "required" : "";
                      const filledClass = part ? "filled" : "";

                      return `
                        <div class="slot ${requiredClass} ${filledClass}" data-slot-id="${slot.id}">
                          <span class="slot-name">${slot.label}</span>
                          <span class="slot-part">${part ? part.ad : "Boş"}</span>
                        </div>
                      `;
                    })
                    .join("");
                })
                .join("")}
            </div>
            <div class="small" style="margin-top:8px;">İpucu: Dolu slota tıklayarak parçayı çıkarabilirsin.</div>
          </section>

          <section class="panel">
            <h4>Drone İstatistikleri</h4>
            <div class="stats-table">
              <div class="stats-item"><span>Bütçe</span><strong class="${summary.totals.cost > levelBudget ? "badge-danger" : "badge-ok"}">${summary.totals.cost} / ${levelBudget}</strong></div>
              <div class="stats-item"><span>Ağırlık</span><strong>${summary.totals.weight.toFixed(1)}</strong></div>
              <div class="stats-item"><span>Dayanıklılık</span><strong>${Math.round(summary.totals.durability)}</strong></div>
              <div class="stats-item"><span>Stabilite</span><strong>${summary.stats.stabilityScore}</strong></div>
              <div class="stats-item"><span>Kontrol</span><strong>${summary.stats.controlScore}</strong></div>
              <div class="stats-item"><span>Lift/Drag</span><strong>${summary.stats.liftScore}</strong></div>
              <div class="stats-item"><span>Enerji Dengesi</span><strong class="${summary.stats.energyBalance < 0 ? "badge-danger" : "badge-ok"}">${summary.stats.energyBalance}</strong></div>
              <div class="stats-item"><span>Kilit Kolaylığı</span><strong>${summary.stats.lockEase}</strong></div>
              <div class="stats-item"><span>Hasar</span><strong>${summary.stats.damageScore}</strong></div>
            </div>

            ${summary.validation.reasons.length > 0 ? `<div class="alert alert-danger">${summary.validation.reasons.join("<br>")}</div>` : ""}
            ${summary.validation.warnings.length > 0 ? `<div class="alert alert-info">${summary.validation.warnings.join("<br>")}</div>` : ""}
            ${alertMessage ? `<div class="alert alert-info">${alertMessage}</div>` : ""}

            <div class="garage-actions">
              <button class="btn-secondary" data-action="test-flight" ${summary.validation.isValid ? "" : "disabled"}>Test Uçuşu</button>
              <button class="btn-secondary" data-action="save-build">Kaydet</button>
              <button class="btn-secondary" data-action="load-build">Yükle</button>
              <button class="btn" data-action="start-mission" ${summary.validation.isValid ? "" : "disabled"}>Göreve Git</button>
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

        if (!part || !isUnlocked(part)) {
          alertMessage = "Bu parça henüz kilitli.";
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
        alertMessage = `${part.ad} -> ${SLOT_DEFINITIONS.find((slot) => slot.id === slotId)?.label}`;
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
      if (workingBuild.slots[slotId]) {
        workingBuild = removePartFromBuild(workingBuild, slotId);
        alertMessage = `${SLOT_DEFINITIONS.find((item) => item.id === slotId)?.label} boşaltıldı.`;
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
      alertMessage = "Tasarım kaydedildi.";
      render();
      return;
    }

    if (action === "load-build") {
      audio.click();
      if (!appState.save.currentBuild) {
        alertMessage = "Kayıtlı bir tasarım bulunamadı.";
      } else {
        workingBuild = cloneBuild(appState.save.currentBuild);
        alertMessage = "Kayıtlı tasarım yüklendi.";
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

  mount.addEventListener("click", onClick);

  render();

  return {
    destroy() {
      stopPreviewAnimation();
      mount.removeEventListener("click", onClick);
    },
  };
}
