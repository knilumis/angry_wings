const CATEGORY_LABELS = {
  core: "Gövde / Core",
  wings: "Kanatlar",
  tail: "Kuyruk / Stabilite",
  warhead: "Harp Başlığı",
  seeker: "Arayıcı Başlık",
  autopilot: "Otopilot",
  link: "Kumanda / Link",
  power: "Güç Ünitesi",
  extra: "Ek Modüller",
};

export function renderWorkshopScreen({ mount, appState, manager, audio }) {
  const level = appState.save.progression.playerLevel;
  const grouped = appState.parts.reduce((acc, part) => {
    if (!acc[part.kategori]) {
      acc[part.kategori] = [];
    }
    acc[part.kategori].push(part);
    return acc;
  }, {});

  mount.innerHTML = `
    <div class="screen-header">
      <div>
        <h2 class="screen-title">Atölye (Parçalar)</h2>
        <div class="screen-subtitle">Teknoloji ağacı görünümü • Pilot Seviyesi ${level}</div>
      </div>
      <button class="btn-secondary" data-action="back">Ana Menü</button>
    </div>
    <div class="screen-body">
      <div class="workshop-grid">
        ${Object.entries(CATEGORY_LABELS)
          .map(([key, label]) => {
            const parts = (grouped[key] || []).sort((a, b) => a.unlockLevel - b.unlockLevel);
            if (parts.length === 0) {
              return "";
            }

            return `
              <section class="workshop-column">
                <h4>${label}</h4>
                ${parts
                  .map((part) => {
                    const unlocked = part.unlockLevel <= level;
                    return `
                      <article class="tech-node ${unlocked ? "" : "locked"}">
                        <strong>${part.ad}</strong>
                        <div class="small">${part.aciklama}</div>
                        <div class="small">Maliyet: ${part.cost} • Nadirlik: ${part.rarity}</div>
                        <div class="small">${unlocked ? "Açık" : `Kilitli • Seviye ${part.unlockLevel}`}</div>
                      </article>
                    `;
                  })
                  .join("")}
              </section>
            `;
          })
          .join("")}
      </div>
    </div>
  `;

  const onClick = (event) => {
    const button = event.target.closest("button[data-action='back']");
    if (!button) return;
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
