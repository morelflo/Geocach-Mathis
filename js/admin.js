/* Back-office : placer les cachettes sur la carte, écrire les énigmes, partager la chasse. */
(async () => {
  const $ = (id) => document.getElementById(id);
  let hunt = await Hunt.load();
  let addMode = false;
  const markers = {}; // id -> {marker, circle}

  /* ---------------- sauvegarde automatique ---------------- */
  let saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const ok = Hunt.saveLocal(hunt);
      const el = $('saved');
      el.textContent = ok ? 'Enregistré ✓' : '⚠️ Non enregistré';
      el.classList.add('flash');
      setTimeout(() => el.classList.remove('flash'), 600);
      $('share-box').classList.add('hidden');
    }, 250);
  }

  /* ---------------- réglages généraux ---------------- */
  const bind = (id, key, conv = (v) => v, prop = 'value') => {
    const el = $(id);
    el[prop] = hunt[key];
    el.addEventListener('input', () => {
      hunt[key] = conv(el[prop]);
      if (key === 'radius') refreshMarkers();
      save();
    });
  };
  bind('f-title', 'title');
  bind('f-intro', 'intro');
  bind('f-final', 'finalMessage');
  bind('f-radius', 'radius', (v) => Number(v) || Hunt.DEFAULT_RADIUS);
  bind('f-showmap', 'showMap', Boolean, 'checked');

  /* ---------------- carte ---------------- */
  const map = L.map('map-admin');
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '© OpenStreetMap',
  }).addTo(map);

  function fit() {
    if (hunt.pois.length) {
      map.fitBounds(L.latLngBounds(hunt.pois.map((p) => [p.lat, p.lng])).pad(0.3), { maxZoom: 18 });
    } else {
      map.setView([46.6, 2.4], 6); // France
      if ('geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition((p) => {
          if (!hunt.pois.length) map.setView([p.coords.latitude, p.coords.longitude], 17);
        }, () => {}, { timeout: 8000 });
      }
    }
  }

  const numIcon = (n) => L.divIcon({
    className: 'num-pin', html: `<span>${n}</span>`, iconSize: [32, 32], iconAnchor: [16, 16],
  });

  function refreshMarkers() {
    Object.values(markers).forEach(({ marker, circle }) => { marker.remove(); circle.remove(); });
    Object.keys(markers).forEach((k) => delete markers[k]);
    hunt.pois.forEach((poi, i) => {
      const circle = L.circle([poi.lat, poi.lng], {
        radius: Hunt.radiusOf(hunt, poi), color: '#ff9f1c', weight: 2, fillOpacity: 0.15,
      }).addTo(map);
      const marker = L.marker([poi.lat, poi.lng], { draggable: true, icon: numIcon(i + 1), title: poi.name }).addTo(map);
      marker.on('drag', (e) => circle.setLatLng(e.target.getLatLng()));
      marker.on('dragend', (e) => {
        const ll = e.target.getLatLng();
        poi.lat = round(ll.lat); poi.lng = round(ll.lng);
        const li = document.querySelector(`.poi[data-id="${poi.id}"]`);
        if (li) {
          li.querySelector('[data-k="lat"]').value = poi.lat;
          li.querySelector('[data-k="lng"]').value = poi.lng;
        }
        save();
      });
      marker.on('click', () => {
        const li = document.querySelector(`.poi[data-id="${poi.id}"]`);
        if (li) { li.scrollIntoView({ behavior: 'smooth', block: 'center' }); li.classList.add('flash'); setTimeout(() => li.classList.remove('flash'), 900); }
      });
      markers[poi.id] = { marker, circle };
    });
  }

  const round = (x) => Math.round(x * 1e6) / 1e6;

  function addPoi(lat, lng) {
    const n = hunt.pois.length + 1;
    const emojis = ['⭐', '🌟', '💎', '🗝️', '🦖', '🚀', '🦄', '🐉'];
    hunt.pois.push({
      id: Hunt.uid(), name: `Cachette ${n}`, lat: round(lat), lng: round(lng),
      riddle: '', hint: '', reward: '', emoji: emojis[(n - 1) % emojis.length], radius: 0,
    });
    render();
    save();
    const li = document.querySelector('.poi:last-child');
    if (li) { li.scrollIntoView({ behavior: 'smooth', block: 'center' }); li.querySelector('[data-k="riddle"]').focus({ preventScroll: true }); }
  }

  map.on('click', (e) => {
    if (!addMode) return;
    addMode = false;
    $('map-admin').classList.remove('adding');
    $('btn-add-map').textContent = '➕ Ajouter sur la carte';
    addPoi(e.latlng.lat, e.latlng.lng);
  });
  $('btn-add-map').addEventListener('click', () => {
    addMode = !addMode;
    $('map-admin').classList.toggle('adding', addMode);
    $('btn-add-map').textContent = addMode ? '👆 Touchez la carte…' : '➕ Ajouter sur la carte';
  });
  $('btn-add-here').addEventListener('click', () => {
    const btn = $('btn-add-here');
    btn.textContent = '📡 Localisation…';
    navigator.geolocation.getCurrentPosition((p) => {
      btn.textContent = '📍 Ajouter à ma position';
      map.setView([p.coords.latitude, p.coords.longitude], 18);
      addPoi(p.coords.latitude, p.coords.longitude);
      if (p.coords.accuracy > 20) alert(`Attention, position peu précise (± ${Math.round(p.coords.accuracy)} m). Vous pouvez ajuster le marqueur à la main.`);
    }, (err) => {
      btn.textContent = '📍 Ajouter à ma position';
      alert('Impossible d\'obtenir la position : ' + err.message);
    }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
  });

  $('search-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const q = $('search').value.trim();
    if (!q) return;
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`, {
        headers: { 'Accept-Language': 'fr' },
      });
      const res = await r.json();
      if (res[0]) map.setView([+res[0].lat, +res[0].lon], 17);
      else alert('Lieu introuvable.');
    } catch (err) { alert('Recherche impossible : ' + err.message); }
  });

  /* ---------------- liste des cachettes ---------------- */
  function render() {
    const list = $('poi-list');
    list.innerHTML = '';
    const tpl = $('poi-tpl');
    hunt.pois.forEach((poi, i) => {
      const li = tpl.content.firstElementChild.cloneNode(true);
      li.dataset.id = poi.id;
      li.querySelector('.poi-num').textContent = i + 1;
      li.querySelectorAll('[data-k]').forEach((el) => {
        const k = el.dataset.k;
        el.value = k === 'radius' ? (poi.radius || '') : poi[k];
        el.addEventListener('input', () => {
          if (k === 'lat' || k === 'lng') {
            const v = parseFloat(el.value);
            if (!isFinite(v)) return;
            poi[k] = v;
            markers[poi.id].marker.setLatLng([poi.lat, poi.lng]);
            markers[poi.id].circle.setLatLng([poi.lat, poi.lng]);
          } else if (k === 'radius') {
            poi.radius = Number(el.value) || 0;
            markers[poi.id].circle.setRadius(Hunt.radiusOf(hunt, poi));
          } else {
            poi[k] = el.value;
          }
          save();
        });
      });
      li.querySelector('.poi-actions').addEventListener('click', (e) => {
        const act = e.target.dataset.act;
        if (!act) return;
        const idx = hunt.pois.indexOf(poi);
        if (act === 'locate') {
          map.setView([poi.lat, poi.lng], 18);
          $('map-admin').scrollIntoView({ behavior: 'smooth', block: 'center' });
          return;
        }
        if (act === 'del' && !confirm(`Supprimer « ${poi.name} » ?`)) return;
        if (act === 'del') hunt.pois.splice(idx, 1);
        if (act === 'up' && idx > 0) hunt.pois.splice(idx - 1, 0, hunt.pois.splice(idx, 1)[0]);
        if (act === 'down' && idx < hunt.pois.length - 1) hunt.pois.splice(idx + 1, 0, hunt.pois.splice(idx, 1)[0]);
        render();
        save();
      });
      list.appendChild(li);
    });
    if (!hunt.pois.length) {
      list.innerHTML = '<li class="note">Aucune cachette pour l\'instant. Ajoutez-en 3 ou 4 !</li>';
    }
    refreshMarkers();
  }

  /* ---------------- partage ---------------- */
  $('btn-share').addEventListener('click', async () => {
    const code = await Hunt.encode(hunt);
    const url = new URL('index.html', location.href);
    url.hash = 'h=' + code;
    $('share-url').value = url.href;
    const qr = $('qr');
    qr.innerHTML = '';
    try {
      new QRCode(qr, { text: url.href, width: 240, height: 240, correctLevel: QRCode.CorrectLevel.L });
    } catch (e) {
      qr.innerHTML = '<p class="note small">Lien trop long pour un QR code : copiez-le et envoyez-le par SMS ou e-mail.</p>';
    }
    if (location.protocol === 'file:') {
      qr.insertAdjacentHTML('beforeend', '<p class="note small">⚠️ Le site est ouvert en fichier local : publiez-le (GitHub Pages) pour que le lien marche sur un téléphone.</p>');
    }
    $('share-box').classList.remove('hidden');
  });
  $('btn-copy').addEventListener('click', async () => {
    const url = $('share-url').value;
    try { await navigator.clipboard.writeText(url); }
    catch (e) { $('share-url').select(); document.execCommand('copy'); }
    $('btn-copy').textContent = 'Copié ✓';
    setTimeout(() => ($('btn-copy').textContent = 'Copier le lien'), 1500);
  });

  /* ---------------- import / export ---------------- */
  $('btn-export').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(Hunt.normalize(hunt), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'hunt.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  $('file-import').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      hunt = Hunt.normalize(JSON.parse(await file.text()));
      Hunt.saveLocal(hunt);
      location.reload();
    } catch (err) { alert('Fichier invalide : ' + err.message); }
  });
  $('btn-reset-progress').addEventListener('click', () => {
    Hunt.resetProgress();
    alert('La partie reprendra à la première énigme sur cet appareil.');
  });
  $('btn-clear').addEventListener('click', () => {
    if (!confirm('Effacer toutes les cachettes et les textes ?')) return;
    hunt = Hunt.emptyHunt();
    Hunt.saveLocal(hunt);
    Hunt.resetProgress();
    location.reload();
  });

  render();
  fit();
})();
