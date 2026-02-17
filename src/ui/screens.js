export function createScreenManager({ root, appState, systems, audio, saveAll }) {
  const registry = new Map();
  let currentScreen = null;

  root.innerHTML = `
    <div class="topbar">
      <div>
        <div class="brand">Angry Wings</div>
        <div class="small">Arcade görev simülasyonu (TR)</div>
      </div>
      <div class="meta" id="topbar-meta"></div>
    </div>
    <div id="screen-root" class="screen"></div>
  `;

  const metaEl = root.querySelector("#topbar-meta");
  const screenRoot = root.querySelector("#screen-root");

  function updateTopbar() {
    const progression = appState.save.progression;
    const unlocked = progression.unlockedLevels.length;
    const completed = Object.keys(progression.completedLevels || {}).length;

    metaEl.innerHTML = `
      <span class="tag">Pilot Seviyesi: ${progression.playerLevel}</span>
      <span class="tag">Kredi: ${progression.credits}</span>
      <span class="tag">Açık Görev: ${unlocked}</span>
      <span class="tag">Tamamlanan: ${completed}</span>
    `;
  }

  function clearScreen() {
    if (currentScreen && typeof currentScreen.destroy === "function") {
      currentScreen.destroy();
    }
    currentScreen = null;
    screenRoot.innerHTML = "";
  }

  function register(name, factory) {
    registry.set(name, factory);
  }

  function show(name, params = {}) {
    const factory = registry.get(name);
    if (!factory) {
      throw new Error(`Ekran bulunamadı: ${name}`);
    }

    clearScreen();
    updateTopbar();

    currentScreen = factory({
      mount: screenRoot,
      appState,
      systems,
      audio,
      manager: api,
      params,
      saveAll,
      updateTopbar,
    });
  }

  const api = {
    register,
    show,
    updateTopbar,
  };

  return api;
}
