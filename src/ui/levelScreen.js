import { createGameLoop } from "../game/gameLoop.js";
import { createRenderer, resizeCanvasToDisplaySize } from "../game/renderer.js";
import { createInputController } from "../game/input.js";
import {
  createMissionState,
  launchDrone,
  setAutopilotMode,
  stepPhysics,
  getObjectiveProgress,
} from "../game/physics.js";
import {
  calculateBuildSummary,
  getPartDurabilityMap,
  indexPartsById,
  createDefaultBuild,
  isTestOverrideProgression,
} from "../systems/buildSystem.js";
import {
  completeLevel,
  getNextPlayableLevel,
  isLevelUnlocked,
} from "../systems/progressionSystem.js";

const POST_EXPLOSION_RESULT_DELAY_SEC = 1.5;

function starBar(stars = 0) {
  const safe = Math.max(0, Math.min(3, Number(stars) || 0));
  return `${"★".repeat(safe)}${"☆".repeat(3 - safe)}`;
}

function objectiveText(objective, progressItem) {
  const current = progressItem?.current || 0;
  const count = objective.count || 0;

  if (objective.type === "destroyTargets") {
    return `${objective.text} (${current}/${count})`;
  }
  if (objective.type === "destroyType") {
    return `${objective.text} (${current}/${count})`;
  }
  if (objective.type === "collectBonus") {
    return `${objective.text} (${current}/${count})`;
  }

  return objective.text;
}

export function renderLevelScreen({ mount, appState, manager, audio, params, saveAll, updateTopbar }) {
  const requestedLevel = Number(params?.levelNumber) || getNextPlayableLevel(appState.save.progression, appState.levels.length);
  const levelNumber = Math.max(1, Math.min(appState.levels.length, requestedLevel));
  const testMode = Boolean(params?.testMode);
  const level = appState.levels[levelNumber - 1];

  if (!level) {
    manager.show("menu");
    return null;
  }

  if (!testMode && !isLevelUnlocked(appState.save.progression, levelNumber)) {
    manager.show("menu");
    return null;
  }

  const build = appState.save.currentBuild || createDefaultBuild();
  const partsById = indexPartsById(appState.parts);
  const validationOverride = testMode || isTestOverrideProgression(appState.save.progression);
  const summary = calculateBuildSummary(build, partsById, level.budgetLimit, {
    ignoreBudget: validationOverride,
    ignoreEnergy: validationOverride,
  });
  const hasSeeker = summary.selectedParts.some((entry) => entry.part.kategori === "seeker");

  if (!summary.validation.isValid) {
    mount.innerHTML = `
      <div class="screen-header">
        <div>
          <h2 class="screen-title">Göreve Hazır Değil</h2>
          <div class="screen-subtitle">Tasarım doğrulamasından geçmeyen bir drone ile görev açılamaz.</div>
        </div>
        <button class="btn-secondary" data-action="to-garage">Garaja Dön</button>
      </div>
      <div class="screen-body">
        <div class="alert alert-danger">${summary.validation.reasons.join("<br>")}</div>
      </div>
    `;

    const onClickInvalid = (event) => {
      const button = event.target.closest("button[data-action='to-garage']");
      if (!button) return;
      audio.click();
      manager.show("garage");
    };

    mount.addEventListener("click", onClickInvalid);

    return {
      destroy() {
        mount.removeEventListener("click", onClickInvalid);
      },
    };
  }

  mount.innerHTML = `
    <div class="screen-header">
      <div>
        <h2 class="screen-title">${testMode ? "Test Uçuşu" : level.ad || `Görev ${String(levelNumber).padStart(2, "0")}`}</h2>
        <div class="screen-subtitle">${level.aciklama || "Hedefleri vur, engelleri aş."}</div>
      </div>
      <div class="row">
        <button class="btn-secondary" data-action="garage">Garaj</button>
        <button class="btn-secondary" data-action="menu">Ana Menü</button>
      </div>
    </div>

    <div class="screen-body">
      <div class="level-layout">
        <div class="level-top">
          <section class="objective-box">
            <h4 style="margin:0 0 8px;">Görev Hedefleri</h4>
            <ol id="objective-list" class="objective-list"></ol>
          </section>

          <section class="control-box">
            <h4 style="margin:0 0 8px;">Fırlatma / Otopilot</h4>
            <div class="control-grid">
              <label>Güç
                <input type="range" min="15" max="100" value="70" id="power-range" />
              </label>
              <label>Açı
                <input type="range" min="-80" max="20" value="-22" id="angle-range" />
              </label>
            </div>
            <div class="garage-actions" style="margin-top:8px;">
              <button class="btn" id="launch-btn">Fırlat</button>
              <button class="tab active" data-autopilot="off">Manuel</button>
              <button class="tab" data-autopilot="stabilize">Stabilize</button>
              <button class="tab" data-autopilot="terminal" ${hasSeeker ? "" : "disabled"}>Terminal Assist${hasSeeker ? "" : " (Arayıcı Gerekli)"}</button>
            </div>
          </section>
        </div>

        <div class="level-canvas-wrap">
          <canvas id="level-canvas" class="level-canvas"></canvas>
          <div class="hud" id="hud"></div>
          <div class="modal" id="result-modal" style="display:none;"></div>
        </div>
      </div>
    </div>
  `;

  const canvas = mount.querySelector("#level-canvas");
  const hud = mount.querySelector("#hud");
  const objectiveList = mount.querySelector("#objective-list");
  const resultModal = mount.querySelector("#result-modal");
  const launchButton = mount.querySelector("#launch-btn");
  const powerRange = mount.querySelector("#power-range");
  const angleRange = mount.querySelector("#angle-range");
  const autopilotButtons = [...mount.querySelectorAll("button[data-autopilot]")];

  resizeCanvasToDisplaySize(canvas);

  const missionState = createMissionState({
    level,
    buildSummary: summary,
    durabilityMap: getPartDurabilityMap(summary),
    canvasSize: {
      width: canvas.clientWidth,
      height: canvas.clientHeight,
    },
  });
  missionState.launchAssist = {
    powerPercent: Number(powerRange.value),
    angleDeg: Number(angleRange.value),
  };

  const renderer = createRenderer(canvas);
  const input = createInputController(canvas);

  let disposed = false;
  let missionEnded = false;
  let rewardText = "";
  let postExplosionDelayElapsed = 0;

  function renderObjectives() {
    const progress = getObjectiveProgress(missionState);
    objectiveList.innerHTML = missionState.objectives
      .map((objective, index) => {
        const item = progress[index];
        const done = item?.done;
        return `<li class="${done ? "badge-ok" : ""}">${objectiveText(objective, item)}</li>`;
      })
      .join("");
  }

  function renderHud() {
    const warnLines = missionState.detachedParts.slice(-2).map((partName) => `Parça koptu: ${partName}`);

    hud.innerHTML = `
      <div>Süre: ${missionState.time.toFixed(1)} / ${missionState.timeLimit}s</div>
      <div>Skor: ${Math.round(missionState.score)}</div>
      <div>Can: ${Math.max(0, Math.round(missionState.drone.health))}</div>
      <div>Hedef: ${missionState.destroyedTargets}</div>
      <div>Hedef Hasari: %${(Number(missionState.targetDamagePercent) || 0).toFixed(1)}</div>
      <div>Yildiz: ${starBar(missionState.missionStars)}</div>
      <div>Bonus: ${missionState.collectedBonus}</div>
      <div>Otopilot: ${missionState.autopilotMode === "off" ? "Manuel" : missionState.autopilotMode}</div>
      ${warnLines.map((line) => `<div class="warn">${line}</div>`).join("")}
      ${missionState.status === "fail" ? `<div class="fail">Görev başarısız.</div>` : ""}
    `;
  }

  function onMissionFinished() {
    missionEnded = true;
    loop.stop();
    const damagePercent = (Number(missionState.targetDamagePercent) || 0).toFixed(1);
    const starLabel = starBar(missionState.missionStars);

    if (missionState.status === "success") {
      if (!testMode) {
        const result = completeLevel({
          progression: appState.save.progression,
          levelNumber,
          score: missionState.score,
          parts: appState.parts,
          totalLevels: appState.levels.length,
        });

        appState.save.progression = result.progression;
        saveAll();
        updateTopbar();
        audio.success();

        const unlockedText =
          result.reward.newlyUnlockedParts.length > 0
            ? `Yeni parçalar: ${result.reward.newlyUnlockedParts.join(", ")}`
            : "Yeni parça açılmadı.";

        rewardText = `+${result.reward.credits} kredi • ${unlockedText}`;
      } else {
        rewardText = "Test uçuşunda ilerleme kaydı yapılmaz.";
        audio.success();
      }
    } else {
      audio.fail();
      rewardText = "Drone düştü veya süre doldu.";
    }

    const damageSummary = `Hasar %${damagePercent} • ${starLabel}`;
    if (missionState.status === "success") {
      rewardText = testMode
        ? `${damageSummary} • Test ucusunda ilerleme kaydi yapilmaz.`
        : `${damageSummary} • ${rewardText}`;
    } else {
      rewardText = `${damageSummary} • %60 alti hasar: gorev basarisiz.`;
    }

    const nextLevel = Math.min(appState.levels.length, levelNumber + 1);
    const canGoNext = !testMode && missionState.status === "success" && levelNumber < appState.levels.length;

    resultModal.style.display = "flex";
    resultModal.innerHTML = `
      <div class="modal-card">
        <h3>${missionState.status === "success" ? "Görev Başarılı" : "Görev Başarısız"}</h3>
        <p>Skor: <strong>${Math.round(missionState.score)}</strong></p>
        <p>Hedef Hasari: <strong>%${damagePercent}</strong> • Yildiz: <strong>${starLabel}</strong></p>
        <p>${rewardText}</p>
        <div class="row">
          <button class="btn-secondary" data-modal-action="retry">Tekrar Dene</button>
          ${canGoNext ? `<button class="btn" data-modal-action="next" data-level="${nextLevel}">Sonraki Görev</button>` : ""}
          <button class="btn-secondary" data-modal-action="garage">Garaj</button>
          <button class="btn-secondary" data-modal-action="menu">Ana Menü</button>
        </div>
      </div>
    `;
  }

  function processEvents() {
    const impactEvent = missionState.events.find((event) => event.type === "impact" && event.speed > 16);
    const explosionEvent = missionState.events.find((event) => event.type === "explosion");

    if (explosionEvent) {
      audio.impact();
    } else if (impactEvent) {
      audio.impact();
    }
  }

  function update(dt) {
    const pitchInput = input.getPitch();
    stepPhysics(missionState, dt, pitchInput);

    processEvents();
    renderHud();
    renderObjectives();

    if (!missionEnded && (missionState.status === "success" || missionState.status === "fail")) {
      const explodedAt = Number(missionState.lastExplosionAt);
      const shouldDelayResult = Number.isFinite(explodedAt) && postExplosionDelayElapsed < POST_EXPLOSION_RESULT_DELAY_SEC;

      if (shouldDelayResult) {
        postExplosionDelayElapsed += dt;
        return;
      }
      onMissionFinished();
    }
  }

  function render() {
    renderer.render(missionState);
  }

  const updateLaunchAssist = () => {
    missionState.launchAssist = {
      powerPercent: Number(powerRange.value),
      angleDeg: Number(angleRange.value),
    };
  };

  const loop = createGameLoop({ update, render });
  loop.start();

  renderObjectives();
  renderHud();

  const onClick = (event) => {
    const target = event.target;

    const actionButton = target.closest("button[data-action]");
    if (actionButton) {
      const action = actionButton.dataset.action;
      audio.click();

      if (action === "menu") {
        manager.show("menu");
      } else if (action === "garage") {
        manager.show("garage");
      }
      return;
    }

    const autopilotButton = target.closest("button[data-autopilot]");
    if (autopilotButton) {
      const mode = autopilotButton.dataset.autopilot;
      setAutopilotMode(missionState, mode);
      autopilotButtons.forEach((button) => {
        button.classList.toggle("active", button.dataset.autopilot === mode);
      });
      audio.click();
      return;
    }

    const modalButton = target.closest("button[data-modal-action]");
    if (modalButton) {
      const modalAction = modalButton.dataset.modalAction;
      audio.click();
      if (modalAction === "retry") {
        manager.show("level", { levelNumber, testMode });
      } else if (modalAction === "next") {
        manager.show("level", { levelNumber: Number(modalButton.dataset.level), testMode: false });
      } else if (modalAction === "garage") {
        manager.show("garage");
      } else {
        manager.show("menu");
      }
    }
  };

  const onLaunch = () => {
    updateLaunchAssist();
    launchDrone(missionState, {
      powerPercent: Number(powerRange.value),
      angleDeg: Number(angleRange.value),
    });
    missionState.launchAssist = null;
    launchButton.disabled = true;
    audio.launch();
  };

  powerRange.addEventListener("input", updateLaunchAssist);
  angleRange.addEventListener("input", updateLaunchAssist);
  launchButton.addEventListener("click", onLaunch);
  mount.addEventListener("click", onClick);

  return {
    destroy() {
      if (disposed) {
        return;
      }
      disposed = true;
      loop.stop();
      input.dispose();
      powerRange.removeEventListener("input", updateLaunchAssist);
      angleRange.removeEventListener("input", updateLaunchAssist);
      launchButton.removeEventListener("click", onLaunch);
      mount.removeEventListener("click", onClick);
    },
  };
}
