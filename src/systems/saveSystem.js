const SAVE_KEY = "angry_wings_save_v1";
const TEST_PLAYER_LEVEL = 100;
const TEST_CREDITS = 99999999;

export function createDefaultSave() {
  return {
    settings: {
      soundEnabled: true,
      language: "tr",
    },
    progression: {
      playerLevel: TEST_PLAYER_LEVEL,
      unlockedLevels: [1],
      completedLevels: {},
      credits: TEST_CREDITS,
    },
    currentBuild: null,
  };
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) {
      return createDefaultSave();
    }
    const parsed = JSON.parse(raw);
    const base = createDefaultSave();
    const mergedSave = {
      ...base,
      ...parsed,
      settings: {
        ...base.settings,
        ...(parsed.settings || {}),
      },
      progression: {
        ...base.progression,
        ...(parsed.progression || {}),
      },
    };
    mergedSave.progression.playerLevel = Math.max(
      TEST_PLAYER_LEVEL,
      Number(mergedSave.progression.playerLevel) || 0,
    );
    mergedSave.progression.credits = Math.max(
      TEST_CREDITS,
      Number(mergedSave.progression.credits) || 0,
    );
    return mergedSave;
  } catch (error) {
    console.warn("Kayıt okunamadı, varsayılan yükleniyor:", error);
    return createDefaultSave();
  }
}

export function saveGame(saveData) {
  localStorage.setItem(SAVE_KEY, JSON.stringify(saveData));
}

export function clearSave() {
  localStorage.removeItem(SAVE_KEY);
}
