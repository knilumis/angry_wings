export function renderHowToPlayScreen({ mount, manager, audio }) {
  mount.innerHTML = `
    <div class="screen-header howto-header">
      <div>
        <h2 class="screen-title">Nasil Oynanir</h2>
        <div class="screen-subtitle">4 adimda tasarim, firlatis ve gorev tamamlama dongusu</div>
      </div>
      <button class="btn-secondary" data-action="back">Ana Menu</button>
    </div>

    <div class="screen-body">
      <section class="howto-hero">
        <h3>Hizli Taktik</h3>
        <p>Ilk atista %60 ustu hedef hasarina ulas, gorevi gec; sonra yildiz ve skor icin aerodinamik tuning ile tekrar dene.</p>
      </section>

      <div class="help-list help-list-timeline">
        <article class="help-step">
          <div class="step-index">01</div>
          <div class="help-step-body">
            <h4>Garajda tasarla</h4>
            <p>Parcalari surukle birak ile gorevde kullanacagin govde, kanat, fin ve itki kombinasyonuna yerlestir. Butce ve enerji dengesini kontrol et.</p>
          </div>
        </article>

        <article class="help-step">
          <div class="step-index">02</div>
          <div class="help-step-body">
            <h4>Firlatis acisini hazirla</h4>
            <p>Guc ve aci sliderlarini ayarla, firlat komutuyla kalkisi yap. Ucus sirasinda W/S veya dokunmatik surukleme ile pitch kontrolu sagla.</p>
          </div>
        </article>

        <article class="help-step">
          <div class="step-index">03</div>
          <div class="help-step-body">
            <h4>Otopilot modunu sec</h4>
            <p>Manuel, Stabilize ve Terminal Assist modlari arasindan goreve uygun olani sec. Arayici varsa terminal yardim hedefe kilitlenmeyi kolaylastirir.</p>
          </div>
        </article>

        <article class="help-step">
          <div class="step-index">04</div>
          <div class="help-step-body">
            <h4>Yildiz kazan, parcani ac</h4>
            <p>Hedef toplam hasarina gore gorev sonucu alinir. Yuksek hasar daha fazla yildiz, skor ve kredi getirir; seviye arttikca yeni moduller acilir.</p>
          </div>
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
