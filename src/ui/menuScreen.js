import { getNextPlayableLevel } from "../systems/progressionSystem.js";

function getCompletedCount(progression) {
  return Object.keys(progression.completedLevels || {}).length;
}

function getBestScore(progression) {
  return Object.values(progression.completedLevels || {}).reduce((best, value) => {
    return Math.max(best, Number(value) || 0);
  }, 0);
}

function getAverageScore(progression) {
  const values = Object.values(progression.completedLevels || {}).map((value) => Number(value) || 0);
  if (values.length === 0) {
    return 0;
  }
  const total = values.reduce((sum, value) => sum + value, 0);
  return Math.round(total / values.length);
}

export function renderMenuScreen({ mount, appState, audio, manager, saveAll }) {
  const progression = appState.save.progression;
  const totalLevels = appState.levels.length;
  const nextLevel = getNextPlayableLevel(progression, totalLevels);
  const completedCount = getCompletedCount(progression);
  const unlockedCount = progression.unlockedLevels.length;
  const completionRatio = totalLevels > 0 ? Math.round((completedCount / totalLevels) * 100) : 0;
  const bestScore = getBestScore(progression);
  const avgScore = getAverageScore(progression);

  mount.innerHTML = `
    <div class="screen-header menu-header">
      <div>
        <h2 class="screen-title">Ana Menu</h2>
        <div class="screen-subtitle">Tasarla, firlat, hedefleri vur, yeni parcalari ac.</div>
      </div>
      <div class="tag">Sonraki Gorev ${String(nextLevel).padStart(2, "0")}</div>
    </div>

    <div class="screen-body menu-body">
      <section class="menu-hero">
        <div class="menu-hero-copy">
          <p class="menu-kicker">Operasyon Brifingi</p>
          <h3>Kamikaze ucagini optimize et, tek atista hedef zincirini indir.</h3>
          <p>Garajda aerodinamik tuning yap, atolyeden parcani sec, gorevde dogru aciyla firlat.</p>
          <div class="menu-hero-actions">
            <button class="btn" data-action="play">Goreve Basla</button>
            <button class="btn-secondary" data-action="garage">Garaja Git</button>
          </div>
        </div>

        <div class="menu-hero-stats">
          <div class="hero-stat">
            <span>Seviye Tamamlama</span>
            <strong>%${completionRatio}</strong>
          </div>
          <div class="hero-stat">
            <span>Tamamlanan</span>
            <strong>${completedCount}/${totalLevels}</strong>
          </div>
          <div class="hero-stat">
            <span>Acik Gorev</span>
            <strong>${unlockedCount}</strong>
          </div>
          <div class="hero-stat">
            <span>En Yuksek Skor</span>
            <strong>${Math.round(bestScore)}</strong>
          </div>
          <div class="hero-stat">
            <span>Ortalama Skor</span>
            <strong>${avgScore}</strong>
          </div>
          <div class="hero-stat">
            <span>Kredi Havuzu</span>
            <strong>${progression.credits}</strong>
          </div>
        </div>
      </section>

      <div class="menu-grid menu-grid-rich">
        <section class="menu-card">
          <div>
            <h3>Kampanya</h3>
            <p>Bir sonraki acik gorevden devam et ve puanini yukari cek.</p>
          </div>
          <div class="menu-actions">
            <button class="btn" data-action="play">Goreve Basla</button>
          </div>
        </section>

        <section class="menu-card">
          <div>
            <h3>Garaj</h3>
            <p>Yan profilde ucagini parca parca kur ve tuning degerlerini ayarla.</p>
          </div>
          <div class="menu-actions">
            <button class="btn-secondary" data-action="garage">Garaja Git</button>
          </div>
        </section>

        <section class="menu-card">
          <div>
            <h3>Atolye</h3>
            <p>Malzeme kademelerini, itki tiplerini ve kilitli parcalari incele.</p>
          </div>
          <div class="menu-actions">
            <button class="btn-secondary" data-action="workshop">Atolyeyi Ac</button>
          </div>
        </section>

        <section class="menu-card">
          <div>
            <h3>Nasil Oynanir</h3>
            <p>Tasarimdan firlatisa kadar tum donguyu 4 adimda ogren.</p>
          </div>
          <div class="menu-actions">
            <button class="btn-secondary" data-action="howto">Rehberi Ac</button>
          </div>
        </section>

        <section class="menu-card">
          <div>
            <h3>Ayarlar</h3>
            <p>Ses ayarini yonet, gerekirse tum ilerlemeyi sifirla.</p>
          </div>
          <div class="menu-actions">
            <button class="btn-secondary" data-action="toggle-sound">${appState.save.settings.soundEnabled ? "Ses: Acik" : "Ses: Kapali"}</button>
            <button class="btn-danger" data-action="reset-progress">Sifirla</button>
          </div>
        </section>
      </div>
    </div>
  `;

  const onClick = (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) {
      return;
    }

    const action = button.dataset.action;
    audio.click();

    if (action === "play") {
      manager.show("level", { levelNumber: nextLevel });
      return;
    }

    if (action === "garage") {
      manager.show("garage");
      return;
    }

    if (action === "workshop") {
      manager.show("workshop");
      return;
    }

    if (action === "howto") {
      manager.show("howto");
      return;
    }

    if (action === "toggle-sound") {
      appState.save.settings.soundEnabled = !appState.save.settings.soundEnabled;
      audio.setEnabled(appState.save.settings.soundEnabled);
      saveAll();
      manager.show("menu");
      return;
    }

    if (action === "reset-progress") {
      const confirmed = window.confirm("Tum ilerleme, krediler ve gorev kayitlari sifirlansin mi?");
      if (!confirmed) {
        return;
      }

      appState.save.progression = {
        playerLevel: 1,
        unlockedLevels: [1],
        completedLevels: {},
        credits: 0,
      };
      appState.save.currentBuild = null;
      saveAll();
      manager.show("menu");
    }
  };

  mount.addEventListener("click", onClick);

  return {
    destroy() {
      mount.removeEventListener("click", onClick);
    },
  };
}
