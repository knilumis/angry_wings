const STRINGS_TR = {
  oyunAdi: "Angry Wings",
  menuOyna: "Oyna",
  menuGaraj: "Garaj",
  menuAtolye: "Atölye (Parçalar)",
  menuAyarlar: "Ayarlar",
  menuNasilOynanir: "Nasıl Oynanır",
  sesAcik: "Ses: Açık",
  sesKapali: "Ses: Kapalı",
  kaydet: "Kaydet",
  yukle: "Yükle",
  goreveGit: "Göreve Git",
  testUcusu: "Test Uçuşu",
  geri: "Geri",
  hedefler: "Hedefler",
  gorevBasarili: "Görev Başarılı",
  gorevBasarisiz: "Görev Başarısız",
};

export function t(key, vars = {}) {
  const text = STRINGS_TR[key] || key;
  return Object.keys(vars).reduce(
    (acc, name) => acc.replaceAll(`{${name}}`, String(vars[name])),
    text,
  );
}

export function getTRStrings() {
  return { ...STRINGS_TR };
}
