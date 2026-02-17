const SAVE_KEY = "angry_wings_save_v1";

export function createDefaultSave() {
  return {
    settings: {
      soundEnabled: true,
      language: "tr",
    },
    progression: {
      playerLevel: 1,
      unlockedLevels: [1],
      completedLevels: {},
      credits: 0,
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
    return {
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
