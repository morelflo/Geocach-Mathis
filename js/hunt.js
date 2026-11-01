/* Données de la chasse au trésor : chargement, sauvegarde, partage, calculs GPS.
   Partagé entre le jeu (index.html) et le back-office (admin.html). */
const Hunt = (() => {
  const LS_HUNT = 'geocache.hunt';
  const LS_PROGRESS = 'geocache.progress.';
  const DEFAULT_RADIUS = 15;

  const uid = () => Math.random().toString(36).slice(2, 9);

  function emptyHunt() {
    return {
      title: 'La chasse au trésor',
      intro: 'Suis la flèche et résous les énigmes pour trouver le trésor !',
      finalMessage: 'Bravo ! Tu as trouvé le trésor ! 🎉',
      radius: DEFAULT_RADIUS,
      showMap: false,
      pois: [],
    };
  }

  function normalize(h) {
    const base = emptyHunt();
    const hunt = Object.assign(base, h || {});
    hunt.radius = Number(hunt.radius) || DEFAULT_RADIUS;
    hunt.showMap = !!hunt.showMap;
    hunt.pois = (Array.isArray(hunt.pois) ? hunt.pois : [])
      .filter((p) => p && isFinite(p.lat) && isFinite(p.lng))
      .map((p) => ({
        id: p.id || uid(),
        name: p.name || 'Cachette',
        lat: Number(p.lat),
        lng: Number(p.lng),
        riddle: p.riddle || '',
        hint: p.hint || '',
        reward: p.reward || '',
        emoji: p.emoji || '⭐',
        radius: Number(p.radius) || 0, // 0 = rayon par défaut de la chasse
      }));
    return hunt;
  }

  /* ---------- encodage pour le lien de partage (#h=...) ---------- */
  function bytesToB64url(bytes) {
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function b64urlToBytes(s) {
    s = s.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  async function pipe(bytes, stream) {
    const s = new Blob([bytes]).stream().pipeThrough(stream);
    return new Uint8Array(await new Response(s).arrayBuffer());
  }

  async function encode(hunt) {
    const bytes = new TextEncoder().encode(JSON.stringify(normalize(hunt)));
    if (typeof CompressionStream !== 'undefined') {
      try {
        return 'z' + bytesToB64url(await pipe(bytes, new CompressionStream('deflate-raw')));
      } catch (e) { /* on retombe sur la version non compressée */ }
    }
    return 'j' + bytesToB64url(bytes);
  }

  async function decode(str) {
    const kind = str[0];
    let bytes = b64urlToBytes(str.slice(1));
    if (kind === 'z') bytes = await pipe(bytes, new DecompressionStream('deflate-raw'));
    return normalize(JSON.parse(new TextDecoder().decode(bytes)));
  }

  /* ---------- stockage ---------- */
  function saveLocal(hunt) {
    try { localStorage.setItem(LS_HUNT, JSON.stringify(normalize(hunt))); return true; }
    catch (e) { return false; }
  }
  function loadLocal() {
    try {
      const raw = localStorage.getItem(LS_HUNT);
      return raw ? normalize(JSON.parse(raw)) : null;
    } catch (e) { return null; }
  }

  /** Ordre : lien partagé (#h=) > sauvegarde du téléphone > hunt.json > chasse vide. */
  async function load() {
    const m = location.hash.match(/[#&]h=([^&]+)/);
    if (m) {
      try {
        const hunt = await decode(m[1]);
        saveLocal(hunt);
        history.replaceState(null, '', location.pathname + location.search);
        return hunt;
      } catch (e) { console.warn('Lien de chasse illisible', e); }
    }
    const local = loadLocal();
    if (local) return local;
    try {
      const r = await fetch('hunt.json', { cache: 'no-store' });
      if (r.ok) return normalize(await r.json());
    } catch (e) { /* pas de fichier */ }
    return emptyHunt();
  }

  /* ---------- progression du joueur ---------- */
  function huntId(hunt) {
    const s = JSON.stringify(hunt.pois.map((p) => [p.id, p.lat, p.lng]));
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  }
  function loadProgress(hunt) {
    try {
      const p = JSON.parse(localStorage.getItem(LS_PROGRESS + huntId(hunt)));
      if (p && typeof p.index === 'number') return p;
    } catch (e) { /* rien */ }
    return { index: 0, started: false, hints: {} };
  }
  function saveProgress(hunt, progress) {
    try { localStorage.setItem(LS_PROGRESS + huntId(hunt), JSON.stringify(progress)); } catch (e) { /* rien */ }
  }
  function resetProgress() {
    try {
      Object.keys(localStorage)
        .filter((k) => k.startsWith(LS_PROGRESS))
        .forEach((k) => localStorage.removeItem(k));
    } catch (e) { /* rien */ }
  }

  /* ---------- géographie ---------- */
  const rad = (d) => (d * Math.PI) / 180;
  function distance(lat1, lng1, lat2, lng2) {
    const R = 6371000;
    const dLat = rad(lat2 - lat1);
    const dLng = rad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }
  function bearing(lat1, lng1, lat2, lng2) {
    const y = Math.sin(rad(lng2 - lng1)) * Math.cos(rad(lat2));
    const x = Math.cos(rad(lat1)) * Math.sin(rad(lat2)) -
      Math.sin(rad(lat1)) * Math.cos(rad(lat2)) * Math.cos(rad(lng2 - lng1));
    return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  }
  const radiusOf = (hunt, poi) => poi.radius || hunt.radius || DEFAULT_RADIUS;

  return {
    DEFAULT_RADIUS, uid, emptyHunt, normalize, encode, decode,
    saveLocal, loadLocal, load,
    huntId, loadProgress, saveProgress, resetProgress,
    distance, bearing, radiusOf,
  };
})();
