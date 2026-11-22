# Hunt Access NZ: path to the app stores

The Android app is the web app packaged with Capacitor 8 (`app/`). Every push to `main` builds a
test APK in GitHub Actions and publishes it under **Releases**.

## Done

- Android project (`app/android`), app ID `nz.huntaccess.app`, icons and splash.
- Native features:
  - track recording carries on with the screen off (foreground service and notification)
  - native share sheet for GPX files, trip reports and plans
  - offline maps work through the service worker inside the app
- `config.js` has slots for a LINZ developer key and an Open-Meteo commercial key.
- A Credits & licences screen, plus Open-Meteo attribution links wherever weather shows.
- A privacy policy at https://engchecker.github.io/huntmap/privacy.html

## Your to-dos (Martin)

1. **App ID.** `nz.huntaccess.app` is permanent once uploaded to Google Play. Change it now if you'd prefer another.
2. **Google Play account.** It costs US$25, paid once.
   - A **personal** account must first run a closed test: 12 or more testers, 14 continuous days.
   - An **organisation** account (for example EAP Engineering Ltd, or a new company) needs a D-U-N-S number, which can take up to about 30 days. It skips the tester requirement.
3. **LINZ.** Email basemaps@linz.govt.nz for a developer key. Say it's for a paid mobile app. If they restrict the key to named sites, ask for:
   - `https://engchecker.github.io`
   - `https://localhost`

   Put the key in `config.js`.
4. **Open-Meteo.** Before the app earns money, take a commercial subscription (open-meteo.com/en/pricing) and put the key in `config.js`.
5. **Hosting.** Move the web version to your own domain (for example on Netlify or Cloudflare Pages), then update `privacyUrl` in `config.js`.
6. **Contact.** Decide on a support email for the store listing and privacy policy. The policy currently points to GitHub Issues.

## Next build steps (Claude)

- **Release signing.** Create an upload key and store it as GitHub secrets. Build a signed `.aab` for Play.
- **Subscriptions.**
  - Agree what's free and what's paid.
  - Set up products in Play Console.
  - Wire Google Play Billing through RevenueCat, which carries over to iPhone later.
  - Update the privacy policy to cover purchases.
- **Store listing.** Screenshots, description, data-safety form, and the background-location declaration (Google will ask why location is used with the screen off).
- **iPhone (later).**
  - Add the Capacitor iOS platform. The service worker doesn't run in the iOS app, so offline tiles there need a different cache.
  - Build on a cloud Mac.
  - Apple Developer Program: US$99 a year.

## Building locally (optional)

```
cd app
npm ci
npm run apk     # needs Android Studio / SDK and JDK 21
```
