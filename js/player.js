/* Le jeu côté enfant : boussole, distance « chaud / froid », énigmes lues à voix haute. */
(async () => {
  const $ = (id) => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  const SIM = params.has('sim'); // mode test : cliquer sur la carte pour se déplacer

  const hunt = await Hunt.load();
  let progress = Hunt.loadProgress(hunt);
  let pos = null;          // {lat, lng, accuracy}
  let heading = null;      // degrés, 0 = Nord
  let arrowAngle = 0;      // angle cumulé (évite les tours complets de la flèche)
  let foundLock = false;
  let map = null, meMarker = null, targetMarker = null, targetCircle = null;

  /* ---------------- écrans ---------------- */
  function show(id) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === id));
    window.scrollTo(0, 0);
  }

  $('start-title').textContent = hunt.title;
  $('start-intro').textContent = hunt.intro;
  document.title = hunt.title;
  if (!hunt.pois.length) {
    $('btn-start').classList.add('hidden');
    $('start-empty').classList.remove('hidden');
  } else if (progress.started) {
    $('btn-start').textContent = progress.index >= hunt.pois.length ? 'Voir le trésor 🏆' : 'Continuer ! 🚀';
  }

  /* ---------------- voix ---------------- */
  let frVoice = null;
  function pickVoice() {
    const voices = speechSynthesis.getVoices();
    frVoice = voices.find((v) => v.lang === 'fr-FR' && v.localService) ||
      voices.find((v) => v.lang && v.lang.startsWith('fr')) || null;
  }
  if ('speechSynthesis' in window) {
    pickVoice();
    speechSynthesis.onvoiceschanged = pickVoice;
  }
  function speak(text) {
    if (!('speechSynthesis' in window) || !text) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, ''));
    u.lang = 'fr-FR';
    if (frVoice) u.voice = frVoice;
    u.rate = 0.9;
    u.pitch = 1.1;
    speechSynthesis.speak(u);
  }

  /* ---------------- sons ---------------- */
  let audio = null;
  function fanfare() {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const notes = [523, 659, 784, 1047];
      notes.forEach((f, i) => {
        const o = audio.createOscillator();
        const g = audio.createGain();
        o.type = 'triangle';
        o.frequency.value = f;
        const t = audio.currentTime + i * 0.15;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.3, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + (i === notes.length - 1 ? 0.8 : 0.3));
        o.connect(g).connect(audio.destination);
        o.start(t);
        o.stop(t + 1);
      });
    } catch (e) { /* pas de son */ }
    if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 400]);
  }

  /* ---------------- confettis ---------------- */
  function confetti() {
    const cv = $('confetti');
    const ctx = cv.getContext('2d');
    cv.width = innerWidth; cv.height = innerHeight;
    const colors = ['#ff9f1c', '#2ec4b6', '#e71d36', '#ffbf69', '#5e60ce', '#80ed99'];
    const parts = Array.from({ length: 160 }, () => ({
      x: Math.random() * cv.width, y: -20 - Math.random() * cv.height * 0.5,
      vx: (Math.random() - 0.5) * 4, vy: 2 + Math.random() * 4,
      r: 4 + Math.random() * 6, c: colors[(Math.random() * colors.length) | 0],
      a: Math.random() * Math.PI, va: (Math.random() - 0.5) * 0.3,
    }));
    const end = performance.now() + 3500;
    (function frame(now) {
      ctx.clearRect(0, 0, cv.width, cv.height);
      parts.forEach((p) => {
        p.x += p.vx; p.y += p.vy; p.a += p.va; p.vy += 0.03;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a);
        ctx.fillStyle = p.c; ctx.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2);
        ctx.restore();
      });
      if (now < end) requestAnimationFrame(frame);
      else ctx.clearRect(0, 0, cv.width, cv.height);
    })(performance.now());
  }

  /* ---------------- écran allumé ---------------- */
  let wakeLock = null;
  async function keepAwake() {
    try { if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen'); } catch (e) { /* rien */ }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && $('screen-play').classList.contains('active')) keepAwake();
  });

  /* ---------------- boussole ---------------- */
  function onOrientation(e) {
    let h = null;
    if (typeof e.webkitCompassHeading === 'number') h = e.webkitCompassHeading;       // iPhone
    else if ((e.absolute || e.type === 'deviceorientationabsolute') && e.alpha != null) h = 360 - e.alpha; // Android
    if (h == null) return;
    const screenAngle = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
    h = (h + screenAngle + 360) % 360;
    // lissage pour éviter que la flèche tremble
    if (heading == null) heading = h;
    else {
      let d = ((h - heading + 540) % 360) - 180;
      heading = (heading + d * 0.25 + 360) % 360;
    }
    $('compass-note').classList.add('hidden');
    update();
  }
  async function startCompass() {
    try {
      if (typeof DeviceOrientationEvent !== 'undefined' &&
          typeof DeviceOrientationEvent.requestPermission === 'function') {
        await DeviceOrientationEvent.requestPermission(); // iOS : doit venir d'un clic
      }
    } catch (e) { /* refusé */ }
    if ('ondeviceorientationabsolute' in window) window.addEventListener('deviceorientationabsolute', onOrientation);
    else window.addEventListener('deviceorientation', onOrientation);
    setTimeout(() => {
      if (heading == null) {
        const note = $('compass-note');
        note.textContent = 'Boussole indisponible : la flèche montre la direction avec le Nord en haut.';
        note.classList.remove('hidden');
      }
    }, 3000);
  }

  /* ---------------- GPS ---------------- */
  function setPos(lat, lng, accuracy) {
    pos = { lat, lng, accuracy };
    update();
  }
  function startGps() {
    if (SIM) {
      const first = hunt.pois[Math.min(progress.index, hunt.pois.length - 1)];
      setPos(first.lat - 0.001, first.lng, 5); // ~110 m au sud de la première cachette
      $('gps-status').textContent = '🧪 Mode test : touche la carte pour te déplacer.';
      return;
    }
    if (!('geolocation' in navigator)) {
      $('gps-status').textContent = '⚠️ Ce téléphone ne donne pas sa position.';
      return;
    }
    navigator.geolocation.watchPosition(
      (p) => setPos(p.coords.latitude, p.coords.longitude, p.coords.accuracy),
      (err) => {
        $('distance').textContent = 'Pas de GPS 😕';
        $('gps-status').textContent = err.code === 1
          ? '⚠️ Autorise la localisation pour ce site dans les réglages du téléphone.'
          : '⚠️ Position introuvable, va un peu plus à découvert.';
      },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 }
    );
  }

  /* ---------------- carte ---------------- */
  function ensureMap() {
    if (map || typeof L === 'undefined') return;
    $('map-play').classList.remove('hidden');
    map = L.map('map-play', { zoomControl: true, attributionControl: true });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '© OpenStreetMap',
    }).addTo(map);
    meMarker = L.circleMarker([0, 0], { radius: 9, color: '#fff', weight: 3, fillColor: '#3a86ff', fillOpacity: 1 }).addTo(map);
    targetMarker = L.marker([0, 0], {
      icon: L.divIcon({ className: 'pin', html: '<span>🎁</span>', iconSize: [36, 36], iconAnchor: [18, 18] }),
    }).addTo(map);
    targetCircle = L.circle([0, 0], { radius: 10, color: '#ff9f1c', weight: 2, fillOpacity: 0.15 }).addTo(map);
    if (SIM) map.on('click', (e) => setPos(e.latlng.lat, e.latlng.lng, 5));
    const poi = currentPoi();
    map.setView(pos ? [pos.lat, pos.lng] : [poi.lat, poi.lng], 17);
    update();
  }
  $('btn-map').addEventListener('click', () => {
    if (map) {
      const hidden = $('map-play').classList.toggle('hidden');
      $('btn-map').textContent = hidden ? '🗺️ Voir la carte' : '🗺️ Cacher la carte';
      if (!hidden) map.invalidateSize();
    } else {
      ensureMap();
      $('btn-map').textContent = '🗺️ Cacher la carte';
    }
  });

  /* ---------------- logique de jeu ---------------- */
  const currentPoi = () => hunt.pois[progress.index];

  function tempOf(d, r) {
    if (d <= r) return ['🎯 Tu y es !', 'hot5'];
    if (d < r + 15) return ['🔥 Brûlant !', 'hot4'];
    if (d < 50) return ['🌡️ Chaud !', 'hot3'];
    if (d < 100) return ['🙂 Tiède', 'hot2'];
    if (d < 200) return ['❄️ Froid', 'hot1'];
    return ['🥶 Très froid', 'hot0'];
  }

  function update() {
    const poi = currentPoi();
    if (!poi || !$('screen-play').classList.contains('active')) return;
    if (map) {
      targetMarker.setLatLng([poi.lat, poi.lng]);
      targetCircle.setLatLng([poi.lat, poi.lng]).setRadius(Hunt.radiusOf(hunt, poi));
    }
    if (!pos) return;
    if (map) meMarker.setLatLng([pos.lat, pos.lng]);

    const d = Hunt.distance(pos.lat, pos.lng, poi.lat, poi.lng);
    const b = Hunt.bearing(pos.lat, pos.lng, poi.lat, poi.lng);
    const r = Hunt.radiusOf(hunt, poi);

    // flèche : direction de la cachette par rapport au haut du téléphone
    const target = b - (heading || 0);
    let delta = ((target - arrowAngle) % 360 + 540) % 360 - 180;
    arrowAngle += delta;
    $('arrow').style.transform = `rotate(${arrowAngle}deg)`;

    const [label, cls] = tempOf(d, r);
    $('temp').textContent = label;
    document.body.className = 'player ' + cls;
    const steps = Math.round(d / 0.6); // un pas d'enfant ≈ 60 cm
    $('distance').innerHTML = d < 1000
      ? `<strong>${Math.round(d)} m</strong> <span>≈ ${steps} pas</span>`
      : `<strong>${(d / 1000).toFixed(1)} km</strong>`;
    if (!SIM) {
      $('gps-status').textContent = pos.accuracy > 30
        ? `📡 GPS peu précis (± ${Math.round(pos.accuracy)} m)…`
        : `📡 Précision ± ${Math.round(pos.accuracy)} m`;
    }

    if (d <= r && !foundLock) found();
  }

  function renderSteps() {
    $('steps').innerHTML = hunt.pois.map((p, i) =>
      `<span class="step ${i < progress.index ? 'done' : i === progress.index ? 'current' : ''}">${i < progress.index ? p.emoji : i + 1}</span>`
    ).join('');
  }

  function startStage() {
    foundLock = false;
    const poi = currentPoi();
    if (!poi) return finish();
    renderSteps();
    $('riddle-label').textContent = `Énigme ${progress.index + 1} sur ${hunt.pois.length}`;
    $('riddle-text').textContent = poi.riddle || `Trouve la cachette « ${poi.name} » en suivant la flèche !`;
    const hintShown = progress.hints[poi.id];
    $('hint-text').textContent = poi.hint;
    $('hint-text').classList.toggle('hidden', !hintShown);
    $('btn-hint').classList.toggle('hidden', !poi.hint || hintShown);
    show('screen-play');
    document.body.className = 'player';
    $('temp').textContent = '…';
    keepAwake();
    if (map) map.setView([poi.lat, poi.lng], map.getZoom());
    update();
    setTimeout(() => speak(`Énigme ${progress.index + 1}. ${$('riddle-text').textContent}`), 400);
  }

  function found() {
    foundLock = true;
    const poi = currentPoi();
    progress.index += 1;
    Hunt.saveProgress(hunt, progress);
    $('found-emoji').textContent = poi.emoji;
    $('found-name').textContent = poi.name;
    $('found-reward').textContent = poi.reward;
    $('btn-next').textContent = progress.index >= hunt.pois.length ? 'Voir le trésor 🏆' : 'Énigme suivante ➡️';
    show('screen-found');
    document.body.className = 'player';
    fanfare();
    confetti();
    speak(`Bravo ! Tu as trouvé ${poi.name} ! ${poi.reward}`);
  }

  function finish() {
    progress.index = hunt.pois.length;
    Hunt.saveProgress(hunt, progress);
    $('end-message').textContent = hunt.finalMessage;
    $('badges').innerHTML = hunt.pois.map((p) => `<span title="${p.name.replace(/"/g, '&quot;')}">${p.emoji}</span>`).join('');
    show('screen-end');
    document.body.className = 'player';
    fanfare();
    confetti();
    setTimeout(confetti, 1800);
    speak(hunt.finalMessage);
  }

  /* ---------------- boutons ---------------- */
  $('btn-start').addEventListener('click', async () => {
    progress.started = true;
    Hunt.saveProgress(hunt, progress);
    speak(' '); // débloque la voix sur iPhone
    try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); audio.resume(); } catch (e) { /* rien */ }
    await startCompass();
    startGps();
    if (hunt.showMap || SIM) $('btn-map').classList.remove('hidden');
    if (progress.index >= hunt.pois.length) return finish();
    startStage();
    if (SIM) { ensureMap(); $('btn-map').textContent = '🗺️ Cacher la carte'; }
  });
  $('btn-speak').addEventListener('click', () => speak($('riddle-text').textContent));
  $('btn-hint').addEventListener('click', () => {
    const poi = currentPoi();
    progress.hints[poi.id] = true;
    Hunt.saveProgress(hunt, progress);
    $('hint-text').classList.remove('hidden');
    $('btn-hint').classList.add('hidden');
    speak('Indice : ' + poi.hint);
  });
  $('btn-next').addEventListener('click', () => (progress.index >= hunt.pois.length ? finish() : startStage()));
  $('btn-replay').addEventListener('click', () => {
    if (!confirm('Recommencer la chasse depuis le début ?')) return;
    progress = { index: 0, started: true, hints: {} };
    Hunt.saveProgress(hunt, progress);
    startStage();
  });

  const menu = $('parent-menu');
  $('btn-parent').addEventListener('click', () => menu.showModal());
  $('btn-close-menu').addEventListener('click', () => menu.close());
  $('btn-force').addEventListener('click', () => { menu.close(); if (currentPoi()) found(); });
  $('btn-prev').addEventListener('click', () => {
    menu.close();
    if (progress.index > 0) { progress.index -= 1; Hunt.saveProgress(hunt, progress); }
    startStage();
  });
})();
