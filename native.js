/* Hunt Access NZ: bridges to native features when running as the Android app (Capacitor).
   Does nothing in a browser. Loaded before app.js.
   - navigator.share / canShare: Android's WebView has no Web Share API, so this uses the
     native share sheet (files are written to the app cache first).
   - window.print: the WebView can't print, so the trip report is shared as an HTML file instead.
   - HMNative.bgStart / bgStop: GPS that keeps recording with the screen off (foreground
     service with a notification), used for track recording. */
(() => {
  const C = window.Capacitor;
  if (!(C && C.isNativePlatform && C.isNativePlatform() && C.registerPlugin)) return;
  const Share = C.registerPlugin('Share'), FS = C.registerPlugin('Filesystem'), BG = C.registerPlugin('BackgroundGeolocation');
  document.documentElement.classList.add('native');

  const toBase64 = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = () => rej(r.error); r.readAsDataURL(blob); });
  const safeName = n => String(n || 'file').replace(/[^\w.-]+/g, '_');
  async function tempFile(file) {
    const r = await FS.writeFile({ path: safeName(file.name), data: await toBase64(file), directory: 'CACHE' });
    return r.uri;
  }
  const abort = () => { try { return new DOMException('Share cancelled', 'AbortError'); } catch (e) { const x = new Error('Share cancelled'); x.name = 'AbortError'; return x; } };

  navigator.canShare = () => true;
  navigator.share = async (d = {}) => {
    const files = [];
    for (const f of d.files || []) files.push(await tempFile(f));
    try {
      await Share.share({ title: d.title, text: d.text, url: d.url, files: files.length ? files : undefined, dialogTitle: d.title || 'Share' });
    } catch (e) {
      if (/cancel/i.test((e && e.message) || '')) throw abort();
      throw e;
    }
  };

  window.print = async () => {
    const rep = document.getElementById('report');
    if (!rep || rep.hidden) return;
    let css = '';
    try { css = await (await fetch('app.css')).text(); } catch (e) {}
    const html = `<!DOCTYPE html><html lang="en-NZ"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Trip report</title><style>${css}\n#report{position:static;overflow:visible;background:#fff;color:#111}html,body{height:auto;overflow:auto;background:#fff}.rp-bar{display:none}</style></head><body>${rep.outerHTML}</body></html>`;
    try { await navigator.share({ title: 'Trip report', files: [new File([html], 'Trip-report.html', { type: 'text/html' })] }); } catch (e) {}
  };

  let watcher = null;
  window.HMNative = {
    async bgStart(onLoc) {
      if (watcher) return;
      try {
        watcher = await BG.addWatcher({
          backgroundTitle: 'Hunt Access NZ',
          backgroundMessage: 'Recording your track. Tap Stop & save in the app to finish.',
          requestPermissions: true, stale: false, distanceFilter: 5
        }, (loc, err) => {
          if (err) { if (err.code === 'NOT_AUTHORIZED' && window.HuntMap) window.HuntMap.toast('Allow location for Hunt Access NZ in Android settings to record tracks'); return; }
          if (loc) onLoc(loc);
        });
      } catch (e) { watcher = null; }
    },
    async bgStop() {
      if (!watcher) return;
      const id = watcher; watcher = null;
      try { await BG.removeWatcher({ id }); } catch (e) {}
    }
  };
})();
