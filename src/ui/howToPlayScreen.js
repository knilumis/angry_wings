export function renderHowToPlayScreen({ mount, manager, audio }) {
  mount.innerHTML = `
    <div class="screen-header">
      <div>
        <h2 class="screen-title">Nasıl Oynanır</h2>
        <div class="screen-subtitle">3 adımda görev döngüsü</div>
      </div>
      <button class="btn-secondary" data-action="back">Ana Menü</button>
    </div>
    <div class="screen-body">
      <div class="help-list">
        <article class="help-step">
          <h4>1) Garajda tasarla</h4>
          <p>Sol panelden parçayı sürükleyip slotlara bırak. Core zorunludur. Bütçe ve enerji dengesini sağla.</p>
        </article>

        <article class="help-step">
          <h4>2) Göreve fırlat</h4>
          <p>Güç ve açı ayarla, ardından fırlat. Uçuş sırasında <strong>W/S</strong> ya da dokunmatik sürükleme ile pitch kontrolü yap.</p>
        </article>

        <article class="help-step">
          <h4>3) Otopilot ve hedefler</h4>
          <p>Stabilize modu uçağı dengeler. Terminal Assist hedefe yaklaşınca yön düzeltir. Üstteki görevleri tamamlayınca ödül kazanırsın.</p>
        </article>

        <article class="help-step">
          <h4>4) Atölyede geliş</h4>
          <p>Görev bitirerek pilot seviyeni yükselt. Yeni seviyelerde yeni parçalar açılır, daha güçlü tasarımlar kurarsın.</p>
        </article>
      </div>
    </div>
  `;

  const onClick = (event) => {
    const button = event.target.closest("button[data-action='back']");
    if (!button) {
      return;
    }
    audio.click();
    manager.show("menu");
  };

  mount.addEventListener("click", onClick);

  return {
    destroy() {
      mount.removeEventListener("click", onClick);
    },
  };
}
