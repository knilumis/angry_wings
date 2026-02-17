function toSet(values = []) {
  return new Set(Array.isArray(values) ? values : []);
}

export function isLevelUnlocked(progression, levelNumber) {
  const unlocked = toSet(progression.unlockedLevels);
  return unlocked.has(levelNumber);
}

export function getNextPlayableLevel(progression, totalLevels) {
  const unlocked = [...toSet(progression.unlockedLevels)].sort((a, b) => a - b);
  for (const levelNumber of unlocked) {
    if (!progression.completedLevels?.[String(levelNumber)]) {
      return Math.min(levelNumber, totalLevels);
    }
  }
  return Math.min(unlocked[unlocked.length - 1] || 1, totalLevels);
}

export function getUnlockedParts(parts, progression) {
  return parts.filter((part) => part.unlockLevel <= progression.playerLevel);
}

export function completeLevel({ progression, levelNumber, score, parts, totalLevels }) {
  const nextProgression = {
    ...progression,
    completedLevels: { ...(progression.completedLevels || {}) },
    unlockedLevels: [...new Set([...(progression.unlockedLevels || [1])])],
  };

  const levelKey = String(levelNumber);
  const currentBest = nextProgression.completedLevels[levelKey] || 0;
  nextProgression.completedLevels[levelKey] = Math.max(currentBest, Math.floor(score));

  const oldPlayerLevel = nextProgression.playerLevel;
  nextProgression.playerLevel = Math.max(nextProgression.playerLevel, levelNumber + 1);

  const nextLevel = levelNumber + 1;
  if (nextLevel <= totalLevels) {
    nextProgression.unlockedLevels.push(nextLevel);
  }

  nextProgression.unlockedLevels = [...new Set(nextProgression.unlockedLevels)].sort((a, b) => a - b);

  const creditReward = 250 + Math.max(0, Math.floor(score / 8));
  nextProgression.credits = (nextProgression.credits || 0) + creditReward;

  const newlyUnlockedParts = parts
    .filter((part) => part.unlockLevel > oldPlayerLevel && part.unlockLevel <= nextProgression.playerLevel)
    .map((part) => part.ad);

  return {
    progression: nextProgression,
    reward: {
      credits: creditReward,
      newlyUnlockedParts,
    },
  };
}
