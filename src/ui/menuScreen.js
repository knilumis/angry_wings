import { getNextPlayableLevel } from "../systems/progressionSystem.js";

export function renderMenuScreen({ mount, appState, audio, manager, saveAll }) {
  const totalLevels = appState.levels.length;
  const nextLevel = getNextPlayableLevel(appState.save.progression, totalLevels);

  mount.innerHTML = `
    <div class="screen-header">
      <div>
        <h2 class="screen-title">Ana Menü</h2>
        <div class="screen-subtitle">Tasarla, fırlat, hedefleri vur, yeni parçaları aç.</div>
      </div>
      <div class="tag">Sonraki Görev: ${String(nextLevel).padStart(2, "0")}</div>
    </div>
    <div class="screen-body">
      <div class="menu-grid">
        <section class="menu-card">
          <div>
            <h3>Oyna</h3>
            <p>Bir sonraki açık göreve hemen başla.</p>
          </div>
          <div class="menu-actions">
            <button class="btn" data-action="play">Göreve Başla</button>
          </div>
        </section>

        <section class="menu-card">
          <div>
            <h3>Garaj</h3>
            <p>Drone tasarımını sürükle-bırak ile hazırla.</p>
          </div>
          <div class="menu-actions">
            <button class="btn-secondary" data-action="garage">Garaja Git</button>
          </div>
        </section>

        <section class="menu-card">
          <div>
            <h3>Atölye (Parçalar)</h3>
            <p>Seviye ile açılan modülleri ve teknoloji yolunu incele.</p>
          </div>
          <div class="menu-actions">
            <button class="btn-secondary" data-action="workshop">Atölyeyi Aç</button>
          </div>
        </section>

        <section class="menu-card">
          <div>
            <h3>Nasıl Oynanır</h3>
            <p>Kısa rehber: tasarla, fırlat, kontrol et, hedefleri tamamla.</p>
          </div>
          <div class="menu-actions">
            <button class="btn-secondary" data-action="howto">Rehberi Aç</button>
          </div>
        </section>

        <section class="menu-card">
          <div>
            <h3>Ayarlar</h3>
            <p>Dil sabit: Türkçe. Ses ve ilerleme seçeneklerini yönet.</p>
          </div>
          <div class="menu-actions">
            <button class="btn-secondary" data-action="toggle-sound">${appState.save.settings.soundEnabled ? "Ses: Açık" : "Ses: Kapalı"}</button>
            <button class="btn-danger" data-action="reset-progress">Sıfırla</button>
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
      const confirmed = window.confirm("Tüm ilerleme, krediler ve görev kayıtları sıfırlansın mı?");
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
