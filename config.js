/* Hunt Access NZ: service keys and settings in one place.
   Fill these in before charging for the app (see app/STORE-CHECKLIST.md).

   linzKey      LINZ Basemaps developer key (email basemaps@linz.govt.nz). Blank = the app makes
                free 90-day standard keys itself. If LINZ restricts the key to nominated sites, ask
                for https://engchecker.github.io and https://localhost (the Android app's origin).
   openMeteoKey Open-Meteo commercial API key (open-meteo.com/en/pricing). Blank = the free,
                non-commercial API, which must not be used once the app earns money.
*/
window.HM_CONFIG = {
  version: '2.2',
  linzKey: '',
  openMeteoKey: '',
  privacyUrl: 'https://engchecker.github.io/huntmap/privacy.html',
  contactUrl: 'https://github.com/engchecker/huntmap/issues'
};
