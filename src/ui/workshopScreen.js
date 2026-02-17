const CATEGORY_LABELS = {
  core: "Govde / Core",
  wings: "Kanatlar",
  tail: "Kuyruk / Stabilite",
  warhead: "Harp Basligi",
  seeker: "Arayici Baslik",
  autopilot: "Otopilot",
  link: "Kumanda / Link",
  power: "Itki Sistemleri",
  extra: "Ek Moduller",
};

const MATERIAL_LABELS = {
  kopuk: "Kopuk",
  ahsap: "Ahsap",
  kompozit: "Kompozit",
};

const THRUST_LABELS = {
  electric: "Elektrikli",
  gasoline: "Benzinli",
  jet: "Jet",
};

function materialTierForPart(part) {
  if (part.materialTier) return part.materialTier;
  if (part.rarity === "epic") return "kompozit";
  if (part.rarity === "rare") return "ahsap";
  return "kopuk";
}

function materialLabel(part) {
  const tier = materialTierForPart(part);
  return MATERIAL_LABELS[tier] || "Kopuk";
}

function thrustLabel(part) {
  if (part.kategori !== "power") return "";
  const type =
    part.thrustType ||
    ((part.energyOut || 0) >= 6 ? "jet" : (part.energyOut || 0) >= 3.5 ? "gasoline" : "electric");
  return THRUST_LABELS[type] || "Elektrikli";
}

export function renderWorkshopScreen({ mount, appState, manager, audio }) {
  const level = appState.save.progression.playerLevel;
  const grouped = appState.parts.reduce((acc, part) => {
    if (!acc[part.kategori]) {
      acc[part.kategori] = [];
    }
    acc[part.kategori].push(part);
    return acc;
  }, {});

  const unlockedParts = appState.parts.filter((part) => part.unlockLevel <= level).length;

  mount.innerHTML = `
    <div class="screen-header workshop-header">
      <div>
        <h2 class="screen-title">Atolye</h2>
        <div class="screen-subtitle">Parca gelisim agaci ve teknoloji hattin</div>
      </div>
      <button class="btn-secondary" data-action="back">Ana Menu</button>
    </div>

    <div class="screen-body">
      <section class="workshop-overview">
        <div class="workshop-overview-card">
          <span>Pilot Seviyesi</span>
          <strong>${level}</strong>
        </div>
        <div class="workshop-overview-card">
          <span>Acik Parca</span>
          <strong>${unlockedParts}/${appState.parts.length}</strong>
        </div>
        <div class="workshop-overview-card">
          <span>Kredi</span>
          <strong>${appState.save.progression.credits}</strong>
        </div>
      </section>

      <div class="workshop-grid">
        ${Object.entries(CATEGORY_LABELS)
          .map(([key, label]) => {
            const parts = (grouped[key] || []).sort((a, b) => a.unlockLevel - b.unlockLevel || a.cost - b.cost);
            if (parts.length === 0) {
              return "";
            }

            const unlockedCount = parts.filter((part) => part.unlockLevel <= level).length;

            return `
              <section class="workshop-column">
                <div class="workshop-column-head">
                  <h4>${label}</h4>
                  <span class="tag">${unlockedCount}/${parts.length}</span>
                </div>
                <div class="workshop-column-body">
                  ${parts
                    .map((part) => {
                      const unlocked = part.unlockLevel <= level;
                      const thrust = thrustLabel(part);
                      return `
                        <article class="tech-node ${unlocked ? "" : "locked"}">
                          <div class="tech-node-head">
                            <strong>${part.ad}</strong>
                            <span class="tag tag-material-${materialTierForPart(part)}">${materialLabel(part)}</span>
                          </div>
                          <div class="small">${part.aciklama}</div>
                          <div class="tech-node-stats small">
                            ${thrust ? `<span>Itki: ${thrust}</span>` : ""}
                            <span>Maliyet: ${part.cost}</span>
                            <span>Agirlik: ${part.weight}</span>
                            <span>Day: ${part.durability}</span>
                          </div>
                          <div class="small tech-node-unlock">${unlocked ? "Acik" : `Kilitli | Seviye ${part.unlockLevel}`}</div>
                        </article>
                      `;
                    })
                    .join("")}
                </div>
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
