export function createScreenManager({ root, appState, systems, audio, saveAll }) {
  const registry = new Map();
  let currentScreen = null;

  root.innerHTML = `
    <div class="topbar">
      <div class="brand-lockup">
        <div class="brand-badge">AW</div>
        <div>
          <div class="brand">Angry Wings</div>
          <div class="small topbar-subline">Kamikaze drone gorev komuta merkezi</div>
        </div>
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
    const completedEntries = Object.entries(progression.completedLevels || {});
    const completed = completedEntries.length;
    const bestScore = completedEntries.reduce((maxScore, entry) => {
      const score = Number(entry[1]) || 0;
      return Math.max(maxScore, score);
    }, 0);

    metaEl.innerHTML = `
      <span class="top-chip top-chip-level">Pilot Lv ${progression.playerLevel}</span>
      <span class="top-chip top-chip-credits">Kredi ${progression.credits}</span>
      <span class="top-chip">Gorev ${completed}/${appState.levels.length}</span>
      <span class="top-chip">Acik ${unlocked}</span>
      <span class="top-chip">En Iyi ${Math.round(bestScore)}</span>
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
      throw new Error(`Ekran bulunamadi: ${name}`);
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
