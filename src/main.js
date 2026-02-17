import { createScreenManager } from "./ui/screens.js";
import { renderMenuScreen } from "./ui/menuScreen.js";
import { renderGarageScreen } from "./ui/garageScreen.js";
import { renderLevelScreen } from "./ui/levelScreen.js";
import { renderWorkshopScreen } from "./ui/workshopScreen.js";
import { renderHowToPlayScreen } from "./ui/howToPlayScreen.js";
import { createAudioSystem } from "./game/audio.js";
import { createDefaultBuild } from "./systems/buildSystem.js";
import { loadGame, saveGame } from "./systems/saveSystem.js";

async function loadJson(path) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`${path} yüklenemedi (${response.status})`);
  }
  return response.json();
}

async function loadLevels() {
  const levels = [];
  for (let i = 1; i <= 10; i += 1) {
    const fileName = `level${String(i).padStart(2, "0")}.json`;
    const level = await loadJson(`./src/data/levels/${fileName}`);
    levels.push(level);
  }
  return levels;
}

function normalizeBuild(rawBuild) {
  const base = createDefaultBuild();
  if (!rawBuild || typeof rawBuild !== "object") {
    return base;
  }

  return {
    ...base,
    ...rawBuild,
    slots: {
      ...base.slots,
      ...(rawBuild.slots || {}),
    },
  };
}

async function bootstrap() {
  const appRoot = document.getElementById("app");

  try {
    const [parts, levels] = await Promise.all([
      loadJson("./src/data/parts.json"),
      loadLevels(),
    ]);

    const save = loadGame();
    save.currentBuild = save.currentBuild ? normalizeBuild(save.currentBuild) : null;

    const appState = {
      parts,
      levels,
      save,
    };

    const audio = createAudioSystem();
    audio.setEnabled(save.settings.soundEnabled);

    const manager = createScreenManager({
      root: appRoot,
      appState,
      audio,
      systems: {},
      saveAll: () => {
        saveGame(appState.save);
      },
    });

    manager.register("menu", renderMenuScreen);
    manager.register("garage", renderGarageScreen);
    manager.register("level", renderLevelScreen);
    manager.register("workshop", renderWorkshopScreen);
    manager.register("howto", renderHowToPlayScreen);

    manager.show("menu");

    window.__ANGRY_WINGS__ = {
      appState,
      manager,
      save: () => saveGame(appState.save),
    };
  } catch (error) {
    appRoot.innerHTML = `
      <div class="screen">
        <div class="screen-header">
          <h2 class="screen-title">Başlatma Hatası</h2>
        </div>
        <div class="screen-body">
          <p>Oyun verileri yüklenemedi.</p>
          <pre>${String(error.message || error)}</pre>
          <p class="small">Yerel dosya erişim kısıtında kalıyorsan küçük bir HTTP sunucu ile aç.</p>
        </div>
      </div>
    `;
    console.error(error);
  }
}

bootstrap();
