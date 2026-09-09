/* =========================================================================
   Schlaftagebuch – Anwendungslogik
   Speichert ausschließlich lokal (localStorage). Keine Netzwerkzugriffe.

   Datumslogik: Eine Nacht trägt das Datum des ABENDS, an dem man ins Bett
   geht. Die letzte vollständige Nacht ist damit immer „gestern“.
   ========================================================================= */
(function () {
  'use strict';

  var C = window.SleepCore;
  var KEY_ENTRIES = 'schlaftagebuch.entries.v1';
  var KEY_SETTINGS = 'schlaftagebuch.settings.v1';
  var KEY_BACKUP = 'schlaftagebuch.backup.v1';
  var KEY_PLANNED = 'schlaftagebuch.planned.v1';
  var APP_VERSION = 'v7';

  var $ = function (sel) { return document.querySelector(sel); };
  var $$ = function (sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); };

  /* ------------------------------------------------------------ Speicher */

  var storageOk = true;

  function readJson(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return fallback;
      var v = JSON.parse(raw);
      return v === null || v === undefined ? fallback : v;
    } catch (e) {
      console.warn('Lesefehler', key, e);
      return fallback;
    }
  }

  function writeJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      storageOk = false;
      console.error('Schreibfehler', key, e);
      toast('Speichern fehlgeschlagen. Der Gerätespeicher ist voll oder gesperrt.', true);
      return false;
    }
  }

  var state = {
    entries: [],
    settings: {},
    planned: null,
    view: 'night',
    date: null,
    draft: null,
    dirty: false,
    freeLatency: false,
    freeAwake: false,
    range: 30,
    scatterX: 'sleep',
    selectedDay: null
  };

  function loadAll() {
    var e = readJson(KEY_ENTRIES, []);
    state.entries = Array.isArray(e)
      ? e.map(function (x) { return C.normalizeEntry(x); })
         .filter(function (x) { return x && C.validateEntry(x).ok; })
      : [];
    var s = readJson(KEY_SETTINGS, {});
    state.settings = Object.assign({}, C.DEFAULT_SETTINGS, s || {});
    if (!Array.isArray(state.settings.factorList) || !state.settings.factorList.length) {
      state.settings.factorList = C.defaultCatalog();
    } else {
      state.settings.factorList = C.sanitizeCatalog(state.settings.factorList);
    }
    C.setFactorCatalog(state.settings.factorList);

    if (!Array.isArray(state.settings.factors) || !state.settings.factors.length) {
      state.settings.factors = C.DEFAULT_FACTORS.slice();
    }
    // Nur aktive Faktoren behalten, die es auch im Katalog gibt
    var ids = state.settings.factorList.map(function (f) { return f.id; });
    state.settings.factors = state.settings.factors.filter(function (id) { return ids.indexOf(id) >= 0; });
    if (!state.settings.factors.length) state.settings.factors = ids.slice(0, 1);
    if (!isFinite(state.settings.minMin)) state.settings.minMin = C.DEFAULT_SETTINGS.minMin;
    if (state.settings.minMin > state.settings.goalMin) state.settings.minMin = state.settings.goalMin;

    // Vormerkung für eine kommende Nacht. Nur gültig, solange die Nacht
    // nicht schon als richtiger Eintrag existiert und nicht zu alt ist.
    var pl = readJson(KEY_PLANNED, null);
    state.planned = (pl && C.isValidKey(pl.date) && pl.date >= C.addDays(refDate(), -2)) ? pl : null;
  }

  function savePlanned(p) {
    state.planned = p;
    if (!p) { try { localStorage.removeItem(KEY_PLANNED); } catch (e) {} return true; }
    return writeJson(KEY_PLANNED, p);
  }

  function saveEntries() { return writeJson(KEY_ENTRIES, C.sortEntries(state.entries)); }
  function saveSettings() {
    C.setFactorCatalog(state.settings.factorList);
    return writeJson(KEY_SETTINGS, state.settings);
  }

  function getEntry(date) {
    for (var i = 0; i < state.entries.length; i++) if (state.entries[i].date === date) return state.entries[i];
    return null;
  }

  function upsertEntry(entry) {
    var i = state.entries.findIndex(function (e) { return e.date === entry.date; });
    if (i >= 0) state.entries[i] = entry; else state.entries.push(entry);
    return saveEntries();
  }

  function deleteEntry(date) {
    state.entries = state.entries.filter(function (e) { return e.date !== date; });
    return saveEntries();
  }

  /* -------------------------------------------------------------- Helfer */

  function el(tag, attrs, children) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') n.className = attrs[k];
      else if (k === 'html') n.innerHTML = attrs[k];
      else if (k === 'text') n.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== null && attrs[k] !== undefined) n.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { if (c) n.appendChild(c); });
    return n;
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var toastTimer = null;
  function toast(msg, isError) {
    var t = $('#toast');
    t.textContent = msg;
    t.classList.toggle('is-error', !!isError);
    t.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('is-visible'); }, isError ? 5200 : 2200);
  }

  function confirmDialog(title, text, okLabel) {
    return new Promise(function (resolve) {
      var dlg = $('#dlgConfirm');
      $('#dlgTitle').textContent = title;
      $('#dlgText').textContent = text;
      $('#dlgOk').textContent = okLabel || 'Ja, löschen';
      var settled = false;
      function done(v) {
        if (settled) return;
        settled = true;
        $('#dlgOk').removeEventListener('click', onOk);
        $('#dlgCancel').removeEventListener('click', onCancel);
        dlg.removeEventListener('close', onClose);
        if (dlg.open) dlg.close();
        resolve(v);
      }
      function onOk() { done(true); }
      function onCancel() { done(false); }
      function onClose() { done(false); }
      $('#dlgOk').addEventListener('click', onOk);
      $('#dlgCancel').addEventListener('click', onCancel);
      dlg.addEventListener('close', onClose);
      dlg.showModal();
    });
  }

  function todayKey() { return C.dateKey(new Date()); }

  // Der Tageswechsel der App liegt um 03:00, nicht um Mitternacht. Wer um
  // halb zwei nachts noch wach ist, steckt gefühlt noch im Vortag – und die
  // laufende Nacht ist noch nicht vorbei.
  var DAY_CUTOFF_HOURS = 3;
  function refDate() { return C.dateKey(new Date(Date.now() - DAY_CUTOFF_HOURS * 3600 * 1000)); }

  // Letzte vollständige Nacht = der Vorabend. Die laufende Nacht lässt sich
  // nur vormerken, deshalb reicht die Navigation einen Tag weiter.
  function lastNight() { return C.addDays(refDate(), -1); }
  function maxDate() { return lastNight(); }
  function navMax() { return refDate(); }
  function isPlannedDate(d) { return d === refDate(); }

  function qualityWord(q) {
    if (q <= 2) return 'wie gerädert';
    if (q <= 4) return 'schlecht';
    if (q <= 6) return 'geht so';
    if (q <= 8) return 'gut';
    return 'top erholt';
  }

  // Temperaturen werden mit Komma angezeigt, aber mit Punkt gerechnet
  function tempText(v) {
    if (v === null || v === undefined) return '';
    return (Math.round(v * 10) / 10).toFixed(1).replace('.', ',');
  }

  function lastKnownTemp(field) {
    var list = C.sortEntries(state.entries);
    for (var i = list.length - 1; i >= 0; i--) {
      var v = list[i][field];
      if (v !== null && v !== undefined) return v;
    }
    return null;
  }

  function statusClass(sleepMin) {
    var st = C.sleepStatus(sleepMin, state.settings);
    return st === 'good' ? 'ok' : (st === 'bad' ? 'bad' : 'mid');
  }
  function statusColor(sleepMin) { return 'var(--' + statusClass(sleepMin) + ')'; }

  /* ------------------------------------------------------------ Vorgaben */

  function suggestDraft(date) {
    var existing = getEntry(date);
    if (existing) {
      return Object.assign({ tempBed: null, tempWake: null }, existing,
        { factors: (existing.factors || []).slice() });
    }
    var d = {
      date: date,
      bed: state.settings.defaultBed || '22:30',
      wake: state.settings.defaultWake || '06:05',
      latency: C.LATENCY_OPTIONS[0].value,
      awake: C.AWAKE_OPTIONS[0].value,
      quality: 7,
      tempBed: lastKnownTemp('tempBed'),
      tempWake: lastKnownTemp('tempWake'),
      factors: [],
      note: ''
    };
    // Was am Vorabend vorgemerkt wurde, steht am nächsten Morgen schon da
    var p = state.planned;
    if (p && p.date === date) {
      if (C.toMin(p.bed) !== null) d.bed = p.bed;
      if (Array.isArray(p.factors)) d.factors = p.factors.slice();
      if (p.tempBed !== null && p.tempBed !== undefined) d.tempBed = p.tempBed;
      if (typeof p.note === 'string') d.note = p.note;
    }
    return d;
  }

  /* ------------------------------------------------------- Ansicht Nacht */

  // Segmentierte Auswahl mit drei Vorgaben plus freier Minuteneingabe
  function buildChoice(container, boxSel, inputSel, options, freeFlag, getValue, setValue) {
    container.innerHTML = '';
    var cur = getValue();
    var isPreset = options.some(function (o) { return o.value === cur; });
    var freeOn = state[freeFlag] || !isPreset;

    options.forEach(function (opt) {
      container.appendChild(el('button', {
        type: 'button', text: opt.label,
        'aria-pressed': String(!freeOn && cur === opt.value),
        onclick: function () {
          setValue(opt.value);
          state[freeFlag] = false;
          touch();
          renderNight();
        }
      }));
    });

    container.appendChild(el('button', {
      type: 'button',
      text: isPreset ? 'freie Eingabe' : cur + ' min',
      'aria-pressed': String(freeOn),
      onclick: function () {
        state[freeFlag] = true;
        renderNight();
        var inp = $(inputSel);
        if (inp) { inp.focus(); inp.select && inp.select(); }
      }
    }));

    var box = $(boxSel), input = $(inputSel);
    if (freeOn) {
      box.hidden = false;
      if (document.activeElement !== input) input.value = cur;
    } else {
      box.hidden = true;
    }
  }

  function buildChips() {
    var wrap = $('#chipsFactors');
    wrap.innerHTML = '';
    var active = state.settings.factors || C.DEFAULT_FACTORS;
    (state.settings.factorList || C.defaultCatalog())
      .filter(function (f) { return active.indexOf(f.id) >= 0; }).forEach(function (f) {
      var on = state.draft.factors.indexOf(f.id) >= 0;
      wrap.appendChild(el('button', {
        type: 'button', class: 'chip', text: f.label, title: f.hint,
        'aria-pressed': String(on),
        onclick: function () {
          var i = state.draft.factors.indexOf(f.id);
          if (i >= 0) state.draft.factors.splice(i, 1); else state.draft.factors.push(f.id);
          touch();
          buildChips();
        }
      }));
    });
    if (!wrap.children.length) {
      wrap.appendChild(el('p', { class: 'note-small', text: 'Keine Faktoren aktiv. Unter „Einstellungen“ auswählen.' }));
    }
  }

  function renderNight() {
    var d = state.draft;
    var planned = isPlannedDate(state.date);
    var isLast = state.date === lastNight();
    var isBefore = state.date === C.addDays(lastNight(), -1);
    $('#dayDow').textContent = C.formatDate(state.date, 'dow');
    $('#dayTitle').textContent = planned ? 'Kommende Nacht'
      : (isLast ? 'Letzte Nacht' : (isBefore ? 'Vorletzte Nacht' : 'Nacht auf ' + C.formatDate(C.addDays(state.date, 1), 'short')));
    $('#daySub').textContent = C.formatDate(state.date, 'plain') +
      ' → ' + C.formatDate(C.addDays(state.date, 1), 'short');
    $('#dayNext').disabled = state.date >= navMax();
    $('#dayPrev').disabled = false;
    var picker = $('#datePicker');
    picker.max = navMax();
    if (picker.value !== state.date) picker.value = state.date;

    // Im Vormerkmodus gibt es nur, was am Abend schon feststeht
    $('#plannedNote').hidden = !planned;
    $('#hero').hidden = planned;
    ['#cellWake', '#cellTempWake', '#fieldLatency', '#fieldAwake', '#fieldQuality'].forEach(function (sel) {
      $(sel).hidden = planned;
    });

    $('#inBed').value = d.bed;
    $('#inWake').value = d.wake;
    $('#inQuality').value = d.quality;
    $('#qualVal').textContent = d.quality;
    $('#qualWord').textContent = ' · ' + qualityWord(d.quality);
    if (document.activeElement !== $('#inNote')) $('#inNote').value = d.note || '';
    renderTemps();

    buildChoice($('#segLatency'), '#freeLatency', '#inLatency', C.LATENCY_OPTIONS, 'freeLatency',
      function () { return d.latency; }, function (v) { d.latency = v; });
    buildChoice($('#segAwake'), '#freeAwake', '#inAwake', C.AWAKE_OPTIONS, 'freeAwake',
      function () { return d.awake; }, function (v) { d.awake = v; });
    buildChips();

    // Hero – erst zeigen, wenn für diese Nacht wirklich etwas vorliegt
    var der = C.derive(d);
    var goal = state.settings.goalMin, minimum = state.settings.minMin;
    var bar = $('#nightBar');
    bar.innerHTML = '';
    var hasData = !!getEntry(state.date) || state.dirty;
    $('#emptyNight').hidden = planned || hasData;
    $('#hero').hidden = planned || !hasData;
    if (hasData && der && der.timeInBed > 0 && der.timeInBed <= 16 * 60) {
      var h = Math.floor(der.sleep / 60), m = der.sleep % 60;
      $('#heroNum').textContent = h + ':' + String(m).padStart(2, '0');
      $('#heroNum').className = 'hero-num v-' + statusClass(der.sleep);
      $('#heroUnit').textContent = 'h';

      // Der Balken zeigt ausschließlich die geschlafene Zeit. Einschlafzeit
      // und nächtliches Wachliegen bleiben draußen – sonst wäre die Skala
      // eine Mischung aus Uhrzeit und Dauer und stimmte nirgends.
      var sleep = der.sleep;
      var axisMax = Math.ceil(Math.max(sleep, goal + 30) / 30) * 30;
      bar.appendChild(el('div', {
        class: 'seg seg-sleep is-' + statusClass(sleep),
        style: 'width:' + (sleep / axisMax * 100) + '%'
      }));
      [minimum, goal].forEach(function (v) {
        if (v > 0 && v <= axisMax) bar.appendChild(el('div', { class: 'mark', style: 'left:' + (v / axisMax * 100) + '%' }));
      });

      // Stundenskala unter dem Balken, damit die Striche einzuordnen sind
      var scale = $('#barScale');
      scale.innerHTML = '';
      var stepH = axisMax > 11 * 60 ? 2 : 1;
      for (var hh = stepH; hh * 60 <= axisMax - 15; hh += stepH) {
        scale.appendChild(el('i', { style: 'left:' + (hh * 60 / axisMax * 100) + '%', text: hh + 'h' }));
      }
      $('#barHint').innerHTML =
        'Balken = geschlafene Zeit. Striche: ' +
        '<b>Minimum ' + C.formatDuration(minimum, { short: true }) + '</b> und ' +
        '<b>Ziel ' + C.formatDuration(goal, { short: true }) + '</b>.';
    } else {
      $('#heroNum').textContent = '–';
      $('#heroNum').className = 'hero-num';
      $('#heroUnit').textContent = '';
      $('#barScale').innerHTML = '';
      $('#barHint').textContent = hasData ? 'Bitte die Zeiten prüfen.' : '';
    }

    // Warnungen und Fehler
    var v = planned ? { ok: true, errors: [], warnings: [] } : C.validateEntry(d);
    var box = $('#entryWarnings');
    box.innerHTML = '';
    var msgs = v.errors.concat(v.warnings);
    if (msgs.length) {
      box.appendChild(el('div', { class: 'banner', html: (v.errors.length ? 'So lässt sich die Nacht nicht speichern:' : 'Sieht ungewöhnlich aus:') +
        '<ul>' + msgs.map(function (m) { return '<li>' + esc(m) + '</li>'; }).join('') + '</ul>' }));
    }

    var exists = !!getEntry(state.date);
    var hasPlan = !!(state.planned && state.planned.date === state.date);
    if (planned) {
      $('#btnSave').textContent = hasPlan ? 'Vormerkung aktualisieren' : 'Für heute Nacht vormerken';
      $('#btnDeleteEntry').textContent = 'Vormerkung löschen';
      $('#btnDeleteEntry').style.display = hasPlan ? '' : 'none';
      $('#entryWarnings').innerHTML = '';
    } else {
      $('#btnSave').textContent = exists ? 'Änderungen speichern' : 'Daten speichern';
      $('#btnDeleteEntry').textContent = 'Diesen Eintrag löschen';
      $('#btnDeleteEntry').style.display = exists ? '' : 'none';
    }
    updateSaveBar();
  }

  // Der Speicherknopf erscheint nur, wenn es etwas zu speichern gibt:
  // bei einer noch nicht erfassten Nacht oder nach einer Änderung.
  function shouldShowSave() {
    return state.view === 'night' && state.dirty;
  }

  function updateSaveBar() {
    var on = shouldShowSave();
    $('#saveBar').classList.toggle('is-visible', on);
    // Zusätzlicher Abstand am Seitenende, damit die Leiste nichts verdeckt
    document.body.classList.toggle('has-savebar', on);
  }

  // „nicht bekannt“ gilt für beide Felder gemeinsam
  function tempsUnknown() {
    var d = state.draft;
    var bedEmpty = d.tempBed === null || d.tempBed === undefined;
    var wakeEmpty = d.tempWake === null || d.tempWake === undefined;
    return isPlannedDate(state.date) ? bedEmpty : (bedEmpty && wakeEmpty);
  }

  function renderTemps() {
    var d = state.draft;
    var unknown = tempsUnknown();
    var box = $('#tempUnknown');
    if (document.activeElement !== box) box.checked = unknown;
    [['#inTempBed', 'tempBed'], ['#inTempWake', 'tempWake']].forEach(function (pair) {
      var input = $(pair[0]);
      input.disabled = unknown;
      input.parentNode.classList.toggle('is-off', unknown);
      if (document.activeElement !== input) input.value = unknown ? '' : tempText(d[pair[1]]);
    });
  }

  function setTempsUnknown(unknown) {
    var d = state.draft;
    if (unknown) {
      d.tempBed = null;
      d.tempWake = null;
    } else {
      // Beim Aufklappen mit dem zuletzt gemessenen Wert starten
      if (d.tempBed === null || d.tempBed === undefined) {
        d.tempBed = lastKnownTemp('tempBed');
        if (d.tempBed === null) d.tempBed = 20;
      }
      if (!isPlannedDate(state.date) && (d.tempWake === null || d.tempWake === undefined)) {
        d.tempWake = lastKnownTemp('tempWake');
        if (d.tempWake === null) d.tempWake = d.tempBed;
      }
    }
    touch();
    renderTemps();
  }

  function saveDraft() {
    if (isPlannedDate(state.date)) {
      savePlanned({
        date: state.date,
        bed: state.draft.bed,
        tempBed: state.draft.tempBed === undefined ? null : state.draft.tempBed,
        factors: (state.draft.factors || []).slice(),
        note: state.draft.note || ''
      });
      state.dirty = false;
      renderNight();
      toast('Für heute Nacht vorgemerkt');
      return;
    }
    var d = Object.assign({}, state.draft, { updatedAt: new Date().toISOString() });
    var v = C.validateEntry(d);
    if (!v.ok) { toast(v.errors[0], true); renderNight(); return; }
    if (!upsertEntry(C.normalizeEntry(d))) return;
    // Eine eingetragene Nacht braucht ihre Vormerkung nicht mehr
    if (state.planned && state.planned.date === d.date) savePlanned(null);
    state.dirty = false;
    var der = C.derive(d);
    toast('Gespeichert · ' + C.formatDuration(der.sleep) + ' Schlaf');
    renderNight();
  }

  /* -------------------------------------------------------- Diagramme */

  var SVGNS = 'http://www.w3.org/2000/svg';
  function s(tag, attrs) {
    var n = document.createElementNS(SVGNS, tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'text') n.textContent = attrs[k]; else n.setAttribute(k, attrs[k]);
    });
    return n;
  }

  // Reihe für den sichtbaren Zeitraum plus Vorlauf für den gleitenden Schnitt
  function buildSeries(days, lead) {
    var end = maxDate();
    var from = C.addDays(end, -(days - 1 + lead));
    var dates = C.dateRange(from, end);
    var byDate = {};
    state.entries.forEach(function (e) { byDate[e.date] = e; });
    return dates.map(function (dt) {
      var e = byDate[dt];
      var der = e ? C.derive(e) : null;
      return { date: dt, value: der ? der.sleep : null, quality: e ? e.quality : null, entry: e };
    });
  }

  var AVG_WINDOW = 5;

  function durationChart(days) {
    var lead = AVG_WINDOW - 1;
    var full = buildSeries(days, lead);
    var rollFull = C.rollingAverage(full, AVG_WINDOW);
    var series = full.slice(lead);
    var roll = rollFull.slice(lead);

    var goal = state.settings.goalMin, minimum = state.settings.minMin;
    var W = 360, H = 210, padL = 26, padR = 10, padT = 10, padB = 20;
    var innerW = W - padL - padR, innerH = H - padT - padB;
    var maxVal = Math.max(goal, 60);
    series.forEach(function (p) { if (p.value !== null) maxVal = Math.max(maxVal, p.value); });
    roll.forEach(function (p) { if (p.value !== null) maxVal = Math.max(maxVal, p.value); });
    var yMax = Math.ceil((maxVal + 15) / 60) * 60;
    var y = function (v) { return padT + innerH - (v / yMax) * innerH; };
    var slot = innerW / series.length;
    var bw = Math.max(2, Math.min(slot * 0.62, 22));
    var x = function (i) { return padL + slot * i + slot / 2; };

    var svg = s('svg', { class: 'chart', viewBox: '0 0 ' + W + ' ' + H, role: 'img',
      'aria-label': 'Schlafdauer der letzten ' + days + ' Nächte' });

    // Stundenraster in 1-h-Schritten
    for (var hv = 0; hv <= yMax; hv += 60) {
      svg.appendChild(s('line', { x1: padL, x2: W - padR, y1: y(hv), y2: y(hv),
        stroke: 'var(--line-soft)', 'stroke-width': 1 }));
      if (hv > 0) {
        svg.appendChild(s('text', { x: padL - 4, y: y(hv) + 3.5, 'text-anchor': 'end',
          'font-size': 9, fill: 'var(--text-faint)', text: (hv / 60) + 'h' }));
      }
    }

    series.forEach(function (p, i) {
      if (p.value === null) return;
      svg.appendChild(s('rect', {
        x: x(i) - bw / 2, y: y(p.value), width: bw, height: Math.max(1.5, (p.value / yMax) * innerH),
        rx: Math.min(3, bw / 2), fill: statusColor(p.value),
        opacity: state.selectedDay && state.selectedDay !== p.date ? 0.4 : 1
      }));
    });

    // Ziel- und Minimum-Linie
    svg.appendChild(s('line', { x1: padL, x2: W - padR, y1: y(goal), y2: y(goal),
      stroke: 'var(--ok)', 'stroke-width': 1.3, 'stroke-dasharray': '5 4', opacity: 0.9 }));
    svg.appendChild(s('line', { x1: padL, x2: W - padR, y1: y(minimum), y2: y(minimum),
      stroke: 'var(--bad)', 'stroke-width': 1.3, 'stroke-dasharray': '2 4', opacity: 0.85 }));

    // Gleitender Schnitt
    var path = '', started = false;
    roll.forEach(function (p, i) {
      if (p.value === null) { started = false; return; }
      path += (started ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(p.value).toFixed(1) + ' ';
      started = true;
    });
    if (path) svg.appendChild(s('path', { d: path, fill: 'none', stroke: 'var(--text)', 'stroke-width': 1.8, opacity: 0.7 }));

    addXLabels(svg, series, x, H, days);
    addHitAreas(svg, series, padL, slot, padT, innerH);
    return svg;
  }

  function qualityChart(days) {
    var lead = AVG_WINDOW - 1;
    var full = buildSeries(days, lead);
    var qFull = C.rollingAverage(full.map(function (p) { return { date: p.date, value: p.quality }; }), AVG_WINDOW);
    var series = full.slice(lead);
    var roll = qFull.slice(lead);

    var W = 360, H = 150, padL = 26, padR = 10, padT = 10, padB = 20;
    var innerW = W - padL - padR, innerH = H - padT - padB;
    var y = function (q) { return padT + innerH - ((q - 0.5) / 10) * innerH; };
    var slot = innerW / series.length;
    var x = function (i) { return padL + slot * i + slot / 2; };

    var svg = s('svg', { class: 'chart', viewBox: '0 0 ' + W + ' ' + H, role: 'img',
      'aria-label': 'Schlafqualität der letzten ' + days + ' Nächte' });

    [2, 4, 6, 8, 10].forEach(function (q) {
      svg.appendChild(s('line', { x1: padL, x2: W - padR, y1: y(q), y2: y(q), stroke: 'var(--line-soft)', 'stroke-width': 1 }));
      svg.appendChild(s('text', { x: padL - 4, y: y(q) + 3.5, 'text-anchor': 'end', 'font-size': 9,
        fill: 'var(--text-faint)', text: String(q) }));
    });

    var qpath = '', qs = false;
    series.forEach(function (p, i) {
      if (p.quality === null) { qs = false; return; }
      qpath += (qs ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(p.quality).toFixed(1) + ' ';
      qs = true;
    });
    if (qpath) svg.appendChild(s('path', { d: qpath, fill: 'none', stroke: 'var(--data)', 'stroke-width': 1.5, opacity: 0.85 }));
    if (days <= 31) {
      series.forEach(function (p, i) {
        if (p.quality === null) return;
        svg.appendChild(s('circle', { cx: x(i), cy: y(p.quality), r: 2.6, fill: 'var(--data)',
          opacity: state.selectedDay && state.selectedDay !== p.date ? 0.4 : 1 }));
      });
    }
    var rpath = '', rs = false;
    roll.forEach(function (p, i) {
      if (p.value === null) { rs = false; return; }
      rpath += (rs ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(p.value).toFixed(1) + ' ';
      rs = true;
    });
    if (rpath) svg.appendChild(s('path', { d: rpath, fill: 'none', stroke: 'var(--text)', 'stroke-width': 1.6, opacity: 0.55 }));

    addXLabels(svg, series, x, H, days);
    addHitAreas(svg, series, padL, slot, padT, innerH);
    return svg;
  }

  function addXLabels(svg, series, x, H, days) {
    var step = days <= 10 ? 1 : (days <= 31 ? 5 : 15);
    var last = series.length - 1;
    var idx = [];
    for (var i = last; i >= 0; i -= step) idx.push(i);
    idx.reverse();

    // Ganz links soll immer ein Datum stehen. Steht die nächste reguläre
    // Beschriftung zu dicht daneben, weicht sie – sonst kleben die Zahlen.
    if (idx[0] !== 0) {
      if (x(idx[0]) - x(0) < 50) idx.shift();
      idx.unshift(0);
    }

    idx.forEach(function (i) {
      svg.appendChild(s('text', { x: x(i), y: H - 6,
        'text-anchor': i === 0 ? 'start' : (i === last ? 'end' : 'middle'), 'font-size': 9,
        fill: 'var(--text-faint)', text: C.formatDate(series[i].date, 'short') }));
    });
  }

  function addHitAreas(svg, series, padL, slot, padT, innerH) {
    series.forEach(function (p, i) {
      var r = s('rect', { x: padL + slot * i, y: padT, width: slot, height: innerH, fill: 'transparent' });
      r.style.cursor = 'pointer';
      r.addEventListener('click', function () {
        state.selectedDay = state.selectedDay === p.date ? null : p.date;
        renderStats();
      });
      svg.appendChild(r);
    });
  }

  function scatterChart(entries) {
    var items = C.summarize(entries, state.settings.goalMin).items || [];
    if (items.length < C.MIN_FOR_CORRELATION) return null;
    var useSleep = state.scatterX === 'sleep';
    var xs = items.map(function (it) { return useSleep ? it.d.sleep : C.toNightAxis(C.toMin(it.bed)); });
    var ys = items.map(function (it) { return it.quality; });

    var W = 360, H = 180, padL = 26, padR = 12, padT = 10, padB = 24;
    var innerW = W - padL - padR, innerH = H - padT - padB;
    var xMin = Math.min.apply(null, xs), xMax = Math.max.apply(null, xs);
    if (xMax - xMin < 30) { xMin -= 30; xMax += 30; }
    var px = function (v) { return padL + ((v - xMin) / (xMax - xMin)) * innerW; };
    var py = function (q) { return padT + innerH - ((q - 0.5) / 10) * innerH; };

    var svg = s('svg', { class: 'chart', viewBox: '0 0 ' + W + ' ' + H, role: 'img',
      'aria-label': 'Zusammenhang zwischen ' + (useSleep ? 'Schlafdauer' : 'Schlafenszeit') + ' und Qualität' });

    [2, 4, 6, 8, 10].forEach(function (q) {
      svg.appendChild(s('line', { x1: padL, x2: W - padR, y1: py(q), y2: py(q), stroke: 'var(--line-soft)', 'stroke-width': 1 }));
      svg.appendChild(s('text', { x: padL - 4, y: py(q) + 3.5, 'text-anchor': 'end', 'font-size': 9, fill: 'var(--text-faint)', text: String(q) }));
    });

    xs.forEach(function (v, i) {
      svg.appendChild(s('circle', { cx: px(v), cy: py(ys[i]), r: 3.2, fill: 'var(--data)', opacity: 0.72 }));
    });

    var r = C.pearson(xs, ys);
    if (r !== null && Math.abs(r) >= 0.2) {
      var mx = C.mean(xs), my = C.mean(ys);
      var slope = r * (C.sd(ys) / C.sd(xs));
      var y1 = my + slope * (xMin - mx), y2 = my + slope * (xMax - mx);
      svg.appendChild(s('line', { x1: px(xMin), y1: py(y1), x2: px(xMax), y2: py(y2),
        stroke: 'var(--accent)', 'stroke-width': 1.4, 'stroke-dasharray': '4 3', opacity: 0.8 }));
    }

    [xMin, (xMin + xMax) / 2, xMax].forEach(function (v, i) {
      var label = useSleep ? C.formatDuration(v, { short: true }) : C.fromMin(C.fromNightAxis(v));
      svg.appendChild(s('text', { x: px(v), y: H - 8, 'font-size': 9, fill: 'var(--text-faint)',
        'text-anchor': i === 0 ? 'start' : (i === 2 ? 'end' : 'middle'), text: label }));
    });

    return { svg: svg, r: r, n: items.length };
  }

  function factorChart(entries) {
    var active = state.settings.factors || C.DEFAULT_FACTORS;
    var rows = active.map(function (f) { return C.factorComparison(entries, f); })
      .filter(function (c) { return c.enough && c.quality; });
    if (!rows.length) return null;

    var rowH = 46, W = 360, padL = 92, padR = 12;
    var H = rows.length * rowH + 18;
    var innerW = W - padL - padR;
    var svg = s('svg', { class: 'chart', viewBox: '0 0 ' + W + ' ' + H, role: 'img',
      'aria-label': 'Durchschnittliche Schlafqualität mit und ohne Faktor' });

    var scale = function (q) { return (q / 10) * innerW; };
    [0, 5, 10].forEach(function (q) {
      svg.appendChild(s('line', { x1: padL + scale(q), x2: padL + scale(q), y1: 4, y2: H - 14,
        stroke: 'var(--line-soft)', 'stroke-width': 1 }));
      svg.appendChild(s('text', { x: padL + scale(q), y: H - 3, 'text-anchor': 'middle',
        'font-size': 9, fill: 'var(--text-faint)', text: String(q) }));
    });

    rows.forEach(function (c, i) {
      var top = i * rowH + 6;
      svg.appendChild(s('text', { x: 0, y: top + 13, 'font-size': 11.5, fill: 'var(--text)', text: c.label }));
      svg.appendChild(s('text', { x: 0, y: top + 27, 'font-size': 9.5, fill: 'var(--text-faint)',
        text: c.nWith + ' mit / ' + c.nWithout + ' ohne' }));
      var sig = c.quality.p < 0.05 && Math.abs(c.quality.diff) >= 0.8;
      [[c.quality.meanA, 'var(--accent)', top + 4], [c.quality.meanB, 'var(--bar)', top + 20]].forEach(function (pair) {
        svg.appendChild(s('rect', { x: padL, y: pair[2], width: Math.max(1, scale(pair[0])), height: 12,
          rx: 3, fill: pair[1], opacity: sig ? 1 : 0.45 }));
        svg.appendChild(s('text', { x: padL + scale(pair[0]) + 5, y: pair[2] + 9.5, 'font-size': 9.5,
          fill: 'var(--text-faint)', text: pair[0].toFixed(1) }));
      });
    });
    return svg;
  }

  /* --------------------------------------------------- Ansicht Auswertung */

  function statBlock(k, v, d, cls) {
    return el('div', { class: 'stat' }, [
      el('div', { class: 'k', text: k }),
      el('div', { class: 'v' + (cls ? ' ' + cls : ''), html: v }),
      d ? el('div', { class: 'd', text: d }) : null
    ]);
  }

  function rangeTabs() {
    var tabs = el('div', { class: 'tabs tabs-wrap' });
    [5, 10, 20, 30, 60, 90].forEach(function (r) {
      tabs.appendChild(el('button', { type: 'button', text: r + ' Tage', 'aria-pressed': String(state.range === r),
        onclick: function () { state.range = r; state.selectedDay = null; renderStats(); } }));
    });
    return tabs;
  }

  function renderStats() {
    var body = $('#statsBody');
    body.innerHTML = '';
    var goal = state.settings.goalMin, minimum = state.settings.minMin;
    var n = state.entries.length;
    $('#statsSub').textContent = n === 0 ? 'Noch keine Nächte erfasst'
      : n + (n === 1 ? ' Nacht erfasst' : ' Nächte erfasst') + ' · Ziel ' + C.formatDuration(goal, { short: true });

    if (n === 0) {
      body.appendChild(el('div', { class: 'empty' }, [
        el('h2', { text: 'Hier entsteht dein Bild' }),
        el('p', { text: 'Trag deine erste Nacht ein. Ab drei Nächten zeigt die App Durchschnitte, ab vierzehn mögliche Zusammenhänge.' }),
        el('button', { class: 'btn btn-primary', style: 'margin-top:20px', text: 'Nacht eintragen',
          onclick: function () { show('night'); } })
      ]));
      return;
    }

    // --- 1. Schlafdauer ---------------------------------------------------
    var durCard = el('div', { class: 'card' }, [el('h2', { text: 'Schlafdauer' })]);
    durCard.appendChild(rangeTabs());
    durCard.appendChild(el('div', { class: 'chart-wrap' }, [durationChart(state.range)]));
    durCard.appendChild(el('div', { class: 'legend', html:
      '<span><i class="swatch" style="background:var(--ok)"></i>Ziel erreicht</span>' +
      '<span><i class="swatch" style="background:var(--bad)"></i>unter Minimum</span>' +
      '<span><i class="swatch" style="background:var(--mid)"></i>dazwischen</span>' +
      '<span><i class="swatch swatch-line" style="background:var(--text);opacity:.7"></i>5-Tages-Schnitt</span>' }));

    var readout = el('div', { class: 'readout' });
    if (state.selectedDay) {
      var e = getEntry(state.selectedDay);
      if (e) {
        var de = C.derive(e);
        readout.innerHTML = '<strong>' + C.formatDate(state.selectedDay, 'long') + '</strong><br>' +
          C.formatDuration(de.sleep) + ' Schlaf · Qualität ' + e.quality + '/10 · ' + e.bed + '–' + e.wake +
          ' · ' + C.formatDuration(de.latency) + ' Einschlafen, ' + C.formatDuration(de.awake) + ' wach' +
          (e.tempBed !== null && e.tempBed !== undefined ? ' · ' + e.tempBed + ' °C' +
            (e.tempWake !== null && e.tempWake !== undefined ? ' → ' + e.tempWake + ' °C' : '') : '') +
          ((e.factors || []).length ? '<br>' + e.factors.map(C.factorLabel).join(' · ') : '');
      } else {
        readout.innerHTML = '<strong>' + C.formatDate(state.selectedDay, 'long') + '</strong><br>Kein Eintrag für diese Nacht.';
      }
    } else {
      readout.textContent = 'Tippe auf einen Balken im Diagramm, um die Details der Nacht zu sehen';
    }
    durCard.appendChild(readout);
    body.appendChild(durCard);

    // --- 2. Schlafqualität ------------------------------------------------
    var qCard = el('div', { class: 'card' }, [el('h2', { text: 'Schlafqualität' })]);
    qCard.appendChild(el('div', { class: 'chart-wrap' }, [qualityChart(state.range)]));
    qCard.appendChild(el('div', { class: 'legend', html:
      '<span><i class="swatch swatch-line" style="background:var(--data)"></i>Bewertung pro Nacht</span>' +
      '<span><i class="swatch swatch-line" style="background:var(--text);opacity:.55"></i>5-Tages-Schnitt</span>' }));
    body.appendChild(qCard);

    // --- 3. Kennzahlen zum gewählten Zeitraum -----------------------------
    var win = C.lastNDays(state.entries, state.range, maxDate());
    var st = C.summarize(win, goal);
    var kCard = el('div', { class: 'card' }, [el('h2', { text: 'Überblick · letzte ' + state.range + ' Tage' })]);
    if (st.count) {
      kCard.appendChild(el('div', { class: 'statgrid' }, [
        statBlock('Ø Schlafdauer', C.formatDuration(st.avgSleep),
          (st.avgSleep >= goal ? '+' : '−') + C.formatDuration(Math.abs(st.avgSleep - goal)) + ' zum Ziel',
          'v-' + statusClass(st.avgSleep)),
        statBlock('Ø Schlafqualität', st.avgQuality.toFixed(1) + ' <small>/ 10</small>', qualityWord(st.avgQuality)),
        statBlock('Ø Einschlafzeit', C.formatDuration(st.avgLatency), 'bis zum Einschlafen'),
        statBlock('Ø Wachzeit', C.formatDuration(st.avgAwake), 'nachts wach gelegen'),
        statBlock('Ziel erreicht', Math.round(st.goalRate * 100) + ' <small>%</small>',
          st.goalHit + ' von ' + st.count + ' Nächten',
          st.goalRate >= 0.6 ? 'v-ok' : 'v-mid'),
        statBlock('Nächte erfasst', Math.round(st.count / state.range * 100) + ' <small>%</small>',
          st.count + ' von ' + state.range + ' Tagen')
      ]));
      var underMin = st.items.filter(function (x) { return x.d.sleep < minimum; }).length;
      var debt = st.debt;
      kCard.appendChild(el('p', { class: 'note-small',
        text: (underMin ? underMin + (underMin === 1 ? ' Nacht lag' : ' Nächte lagen') + ' unter deinem Minimum von ' +
                C.formatDuration(minimum, { short: true }) + '. ' : 'Keine Nacht lag unter deinem Minimum. ') +
              (debt > 0
                ? 'Über den Zeitraum fehlen gegenüber dem Ziel rechnerisch ' + C.formatDuration(debt) + '. ' +
                  'Das ist eine einfache Summe der Differenzen, kein medizinischer Wert – Schlaf lässt sich nicht eins zu eins nachholen.'
                : 'Über den Zeitraum liegst du in Summe ' + C.formatDuration(-debt) + ' über deinem Ziel.') }));
    } else {
      kCard.appendChild(el('p', { class: 'note-small', text: 'In diesem Zeitraum liegen keine Einträge vor.' }));
    }
    body.appendChild(kCard);

    // --- 6. Erkenntnisse --------------------------------------------------
    var insights = C.buildInsights(win, state.settings, maxDate(), state.range);
    if (insights.length) {
      var ic = el('div', { class: 'card' }, [el('h2', { text: 'Was in deinen Daten steht · letzte ' + state.range + ' Tage' })]);
      insights.forEach(function (i) {
        ic.appendChild(el('div', { class: 'insight ' + i.tone }, [
          el('h3', { text: i.title }),
          el('p', { text: i.text })
        ]));
      });
      body.appendChild(ic);
    }

    // --- 7. Empfehlungen --------------------------------------------------
    var recs = C.buildRecommendations(win, state.settings, maxDate(), state.range);
    if (recs.length) {
      var rc = el('div', { class: 'card' }, [el('h2', { text: 'Wo du ansetzen könntest' })]);
      recs.forEach(function (r) {
        rc.appendChild(el('div', { class: 'rec' }, [el('h3', { text: r.title }), el('p', { text: r.text })]));
      });
      rc.appendChild(el('p', { class: 'note-small',
        text: 'Diese Hinweise stammen ausschließlich aus deinen eigenen Einträgen. Sie sind keine medizinische Beratung. Bei anhaltenden Schlafproblemen ist ärztlicher Rat der bessere Weg.' }));
      body.appendChild(rc);
    }

    // --- 8. Faktorvergleich ------------------------------------------------
    var fc = factorChart(win);
    if (fc) {
      var fcard = el('div', { class: 'card' }, [el('h2', { text: 'Qualität mit und ohne Faktor · letzte ' + state.range + ' Tage' })]);
      fcard.appendChild(el('div', { class: 'chart-wrap' }, [fc]));
      fcard.appendChild(el('div', { class: 'legend', html:
        '<span><i class="swatch" style="background:var(--accent)"></i>Nächte mit dem Faktor</span>' +
        '<span><i class="swatch" style="background:var(--bar)"></i>Nächte ohne</span>' }));
      fcard.appendChild(el('p', { class: 'note-small',
        text: 'Blasse Balken bedeuten: der Unterschied ist so klein, dass er gut Zufall sein kann. Auch ein deutlicher Unterschied beweist keine Ursache.' }));
      body.appendChild(fcard);
    }

    // --- 9. Streudiagramm --------------------------------------------------
    var sc = scatterChart(win);
    if (sc) {
      var scard = el('div', { class: 'card' }, [el('h2', { text: 'Was hängt mit deiner Bewertung zusammen?' })]);
      var stabs = el('div', { class: 'tabs' });
      [['sleep', 'Schlafdauer'], ['bed', 'Schlafenszeit']].forEach(function (p) {
        stabs.appendChild(el('button', { type: 'button', text: p[1], 'aria-pressed': String(state.scatterX === p[0]),
          onclick: function () { state.scatterX = p[0]; renderStats(); } }));
      });
      scard.appendChild(stabs);
      scard.appendChild(el('div', { class: 'chart-wrap' }, [sc.svg]));
      var strength = Math.abs(sc.r) < 0.2 ? 'praktisch keinen erkennbaren' : (Math.abs(sc.r) < 0.4 ? 'einen schwachen' : (Math.abs(sc.r) < 0.6 ? 'einen mittleren' : 'einen deutlichen'));
      scard.appendChild(el('p', { class: 'note-small',
        text: 'Jeder Punkt ist eine Nacht (' + sc.n + ' insgesamt). Über alle Nächte hinweg zeigt sich ' + strength +
          ' Zusammenhang' + (Math.abs(sc.r) >= 0.2 ? ' (r = ' + sc.r.toFixed(2) + ')' : '') +
          '. Ein Zusammenhang ist keine Ursache – beides kann auch von einem dritten Faktor kommen.' }));
      body.appendChild(scard);
    }
  }

  /* --------------------------------------------------------- Ansicht Mehr */

  function stepperRow(label, hint, getValue, setValue, id) {
    return el('div', { class: 'row' }, [
      el('div', {}, [el('div', { class: 'rk', text: label }), el('div', { class: 'rd', text: hint })]),
      el('div', { style: 'display:flex;align-items:center;gap:8px' }, [
        el('button', { class: 'iconbtn', text: '−', 'aria-label': label + ' 15 Minuten kürzer',
          onclick: function () { setValue(getValue() - 15); } }),
        el('span', { class: 'goal-display', id: id, text: C.formatDuration(getValue(), { short: true }) }),
        el('button', { class: 'iconbtn', text: '+', 'aria-label': label + ' 15 Minuten länger',
          onclick: function () { setValue(getValue() + 15); } })
      ])
    ]);
  }

  function renderMore() {
    var body = $('#moreBody');
    body.innerHTML = '';

    // Schlafziel und Minimum
    var goalCard = el('div', { class: 'card' }, [el('h2', { text: 'Schlafziel' })]);
    goalCard.appendChild(stepperRow('Zielschlafdauer', 'Ab hier zählt eine Nacht als grün',
      function () { return state.settings.goalMin; }, setGoal, 'goalOut'));
    goalCard.appendChild(stepperRow('Minimum', 'Darunter zählt eine Nacht als rot',
      function () { return state.settings.minMin; }, setMinimum, 'minOut'));
    goalCard.appendChild(el('p', { class: 'note-small',
      text: 'Zwischen Minimum und Ziel wird eine Nacht gelb dargestellt. Für Erwachsene werden meist sieben bis neun Stunden genannt. Der beste Wert ist der, nach dem du dich tagsüber wach fühlst.' }));
    body.appendChild(goalCard);

    // Vorauswahl der Uhrzeiten
    var preCard = el('div', { class: 'card' }, [el('h2', { text: 'Vorauswahl für neue Nächte' })]);
    var preRow = el('div', { class: 'timerow' }, [
      el('div', { class: 'timecell' }, [
        el('div', { class: 'lbl', text: 'Ins Bett' }),
        el('div', { class: 'timeinput' }, [
          el('input', { type: 'time', step: '300', value: state.settings.defaultBed, 'aria-label': 'Vorauswahl ins Bett',
            oninput: function () {
              if (C.toMin(this.value) !== null) { state.settings.defaultBed = this.value; saveSettings(); }
            } })
        ])
      ]),
      el('div', { class: 'timecell' }, [
        el('div', { class: 'lbl', text: 'Aufgestanden' }),
        el('div', { class: 'timeinput' }, [
          el('input', { type: 'time', step: '300', value: state.settings.defaultWake, 'aria-label': 'Vorauswahl aufgestanden',
            oninput: function () {
              if (C.toMin(this.value) !== null) { state.settings.defaultWake = this.value; saveSettings(); }
            } })
        ])
      ])
    ]);
    preCard.appendChild(preRow);
    preCard.appendChild(el('p', { class: 'note-small',
      text: 'Mit diesen Zeiten startet jede neue Nacht. Je näher sie an deinem Alltag liegen, desto weniger musst du morgens tippen.' }));
    body.appendChild(preCard);

    // Besondere Faktoren
    var facCard = el('div', { class: 'card' }, [el('h2', { text: 'Besondere Faktoren' })]);
    var list = state.settings.factorList;
    var active = state.settings.factors;

    var listBox = el('div', { class: 'factor-list' });
    list.forEach(function (f, index) {
      var used = state.entries.some(function (e) { return (e.factors || []).indexOf(f.id) >= 0; });
      var row = el('div', { class: 'factor-row' });
      row.dataset.index = index;

      row.appendChild(el('button', {
        class: 'grip', type: 'button', text: '⠿',
        'aria-label': 'Faktor „' + f.label + '“ verschieben. Mit den Pfeiltasten oder durch Ziehen.',
        onkeydown: function (ev) {
          if (ev.key === 'ArrowUp') { ev.preventDefault(); moveFactor(index, index - 1); }
          if (ev.key === 'ArrowDown') { ev.preventDefault(); moveFactor(index, index + 1); }
        },
        onpointerdown: function (ev) { startFactorDrag(ev, listBox, index); }
      }));

      row.appendChild(el('input', {
        type: 'checkbox', checked: active.indexOf(f.id) >= 0 ? 'checked' : null,
        'aria-label': f.label + ' im Eintrag anzeigen',
        onchange: function () {
          var arr = state.settings.factors.slice();
          var k = arr.indexOf(f.id);
          if (this.checked && k < 0) arr.push(f.id);
          if (!this.checked && k >= 0) arr.splice(k, 1);
          if (!arr.length) {
            this.checked = true;
            toast('Mindestens ein Faktor muss aktiv bleiben.', true);
            return;
          }
          state.settings.factors = arr;
          saveSettings();
          renderNight();
        }
      }));

      row.appendChild(el('input', {
        type: 'text', value: f.label, maxlength: '40', 'aria-label': 'Name des Faktors',
        onchange: function () {
          var name = this.value.trim().slice(0, 40);
          if (!name) { this.value = f.label; return; }
          f.label = name;
          state.settings.factorList = C.sanitizeCatalog(state.settings.factorList);
          saveSettings();
          renderNight();
          renderMore();
        }
      }));

      row.appendChild(el('button', {
        class: 'del', type: 'button', text: '×',
        disabled: used ? 'disabled' : null,
        title: used ? 'Wird in gespeicherten Nächten verwendet und kann nur ausgeblendet werden' : 'Faktor löschen',
        'aria-label': 'Faktor „' + f.label + '“ löschen',
        onclick: function () {
          if (state.settings.factorList.length <= 1) { toast('Der letzte Faktor lässt sich nicht löschen.', true); return; }
          state.settings.factorList = state.settings.factorList.filter(function (x) { return x.id !== f.id; });
          state.settings.factors = state.settings.factors.filter(function (id) { return id !== f.id; });
          if (!state.settings.factors.length) state.settings.factors = [state.settings.factorList[0].id];
          saveSettings();
          renderNight();
          renderMore();
          toast('„' + f.label + '“ gelöscht');
        }
      }));

      listBox.appendChild(row);
    });
    facCard.appendChild(listBox);

    var full = list.length >= C.MAX_FACTORS;
    var addField = el('input', {
      type: 'text', maxlength: '40', placeholder: 'Neuer Faktor, z. B. Sauna',
      'aria-label': 'Neuen Faktor benennen', disabled: full ? 'disabled' : null
    });
    function addFactor() {
      var name = addField.value.trim().slice(0, 40);
      if (!name) return;
      if (state.settings.factorList.length >= C.MAX_FACTORS) {
        toast('Mehr als ' + C.MAX_FACTORS + ' Faktoren sind nicht möglich.', true);
        return;
      }
      var id = C.makeFactorId(name, state.settings.factorList);
      state.settings.factorList = C.sanitizeCatalog(state.settings.factorList.concat([{ id: id, label: name, hint: '' }]));
      if (state.settings.factors.indexOf(id) < 0) state.settings.factors.push(id);
      saveSettings();
      renderNight();
      renderMore();
      toast('„' + name + '“ hinzugefügt');
    }
    addField.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') addFactor(); });
    facCard.appendChild(el('div', { class: 'factor-add' }, [
      addField,
      el('button', { type: 'button', text: 'Hinzufügen', disabled: full ? 'disabled' : null, onclick: addFactor })
    ]));

    facCard.appendChild(el('p', { class: 'note-small',
      text: 'Die Reihenfolge lässt sich am Griff links ziehen; damit ändert sich auch die Reihenfolge im Eintrag. ' +
        'Angehakte Faktoren erscheinen beim Eintrag. Namen lassen sich jederzeit ändern – gespeicherte Nächte bleiben dabei richtig zugeordnet. ' +
        'Ein Faktor, der schon in einer Nacht vorkommt, lässt sich nicht löschen, sondern nur ausblenden. ' +
        'Möglich sind bis zu ' + C.MAX_FACTORS + ' Faktoren (aktuell ' + list.length + '). ' +
        'Bedenke: Jeder Faktor braucht mindestens fünf Nächte mit und fünf ohne, bevor die Auswertung etwas dazu sagen kann.' }));
    body.appendChild(facCard);

    // Darstellung
    var themeCard = el('div', { class: 'card' }, [el('h2', { text: 'Darstellung' })]);
    var seg = el('div', { class: 'segmented' });
    [['auto', 'Automatisch'], ['dark', 'Dunkel'], ['light', 'Hell']].forEach(function (p) {
      seg.appendChild(el('button', { type: 'button', text: p[1], 'aria-pressed': String(state.settings.theme === p[0]),
        onclick: function () { state.settings.theme = p[0]; saveSettings(); applyTheme(); renderMore(); } }));
    });
    themeCard.appendChild(seg);
    body.appendChild(themeCard);

    // Sicherung
    var backupCard = el('div', { class: 'card' }, [
      el('h2', { text: 'Sicherung und Umzug' }),
      el('button', { class: 'btn', text: 'Daten als JSON sichern', onclick: exportJson }),
      el('button', { class: 'btn', text: 'Daten als CSV exportieren', onclick: exportCsv }),
      el('button', { class: 'btn', text: 'Sicherung einlesen', onclick: function () { $('#fileImport').click(); } }),
      el('p', { class: 'note-small',
        text: 'Die JSON-Datei enthält alles: Nächte, Ziel und Faktoren. Sie ist der Weg auf ein neues Handy. CSV ist nur zum Ansehen in einer Tabelle gedacht und lässt sich nicht zurücklesen.' })
    ]);
    if (readJson(KEY_BACKUP, null)) {
      backupCard.appendChild(el('button', { class: 'btn btn-quiet', text: 'Letzten Import rückgängig machen',
        onclick: undoImport }));
    }
    body.appendChild(backupCard);

    // Daten
    var dataCard = el('div', { class: 'card' }, [el('h2', { text: 'Daten auf diesem Gerät' })]);
    dataCard.appendChild(el('div', { class: 'row' }, [
      el('div', {}, [
        el('div', { class: 'rk', text: state.entries.length + ' Nächte gespeichert' }),
        el('div', { class: 'rd', text: state.entries.length
          ? C.formatDate(C.sortEntries(state.entries)[0].date) + ' bis ' + C.formatDate(C.sortEntries(state.entries)[state.entries.length - 1].date)
          : 'Noch nichts erfasst' })
      ])
    ]));
    if (!state.entries.length) {
      dataCard.appendChild(el('button', { class: 'btn', text: 'Beispieldaten zum Ausprobieren laden', onclick: loadDemo }));
    }
    dataCard.appendChild(el('button', { class: 'btn btn-danger', text: 'Alle Daten löschen', onclick: wipeAll }));
    body.appendChild(dataCard);

    // Info
    body.appendChild(el('div', { class: 'card' }, [
      el('h2', { text: 'Über diese App' }),
      el('p', { class: 'note-small', html:
        'Fassung <strong>' + APP_VERSION + '</strong>. Wenn hier eine ältere Nummer steht als erwartet, ' +
        'hat das Handy noch alte Dateien im Zwischenspeicher.<br><br>' +
        'Eine Nacht trägt immer das Datum des Abends, an dem du ins Bett gehst. Die letzte eintragbare Nacht ist deshalb die von gestern.<br><br>' +
        'Alle Einträge liegen ausschließlich im Speicher dieses Browsers auf diesem Gerät. ' +
        'Es gibt kein Konto, keinen Server, keine Werbung und keine Analyse durch Dritte. ' +
        'Die App funktioniert vollständig offline.<br><br>' +
        '<strong>Wichtig:</strong> Wenn du die Browserdaten für diese Seite löschst oder die App deinstallierst, sind auch die Einträge weg. ' +
        'Sichere deshalb regelmäßig die JSON-Datei.<br><br>' +
        'Die Hinweise in der Auswertung beschreiben Muster in deinen eigenen Zahlen. Sie sind keine Diagnose und ersetzen keine ärztliche Beratung.' })
    ]));
  }

  // Faktoren umsortieren -------------------------------------------------

  function moveFactor(from, to) {
    var list = state.settings.factorList;
    if (to < 0 || to >= list.length || from === to) return;
    var item = list.splice(from, 1)[0];
    list.splice(to, 0, item);
    saveSettings();
    renderNight();
    renderMore();
    var grips = $$('#moreBody .grip');
    if (grips[to]) grips[to].focus();
  }

  // Ziehen per Zeigereignis – funktioniert mit Finger und Maus gleichermaßen
  function startFactorDrag(ev, listBox, index) {
    var rows = Array.prototype.slice.call(listBox.children);
    var row = rows[index];
    if (!row || rows.length < 2) return;
    ev.preventDefault();
    var rowH = row.getBoundingClientRect().height || 54;
    var startY = ev.clientY;
    var target = index;

    row.classList.add('is-dragging');
    listBox.classList.add('is-sorting');
    if (ev.target.setPointerCapture) {
      try { ev.target.setPointerCapture(ev.pointerId); } catch (e) {}
    }

    function onMove(e) {
      var delta = e.clientY - startY;
      target = Math.max(0, Math.min(rows.length - 1, index + Math.round(delta / rowH)));
      row.style.transform = 'translateY(' + delta + 'px)';
      // Die übersprungenen Zeilen weichen sichtbar aus
      rows.forEach(function (other, i) {
        if (i === index) return;
        var shift = 0;
        if (index < target && i > index && i <= target) shift = -rowH;
        if (index > target && i < index && i >= target) shift = rowH;
        other.style.transform = shift ? 'translateY(' + shift + 'px)' : '';
      });
    }

    function onUp() {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onUp);
      rows.forEach(function (r) { r.style.transform = ''; });
      row.classList.remove('is-dragging');
      listBox.classList.remove('is-sorting');
      if (target !== index) moveFactor(index, target);
    }

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onUp);
  }

  function setGoal(min) {
    state.settings.goalMin = Math.max(240, Math.min(660, min));
    if (state.settings.minMin > state.settings.goalMin) state.settings.minMin = state.settings.goalMin;
    saveSettings();
    refreshGoalOut();
    renderNight();
  }

  function setMinimum(min) {
    state.settings.minMin = Math.max(120, Math.min(state.settings.goalMin, min));
    saveSettings();
    refreshGoalOut();
    renderNight();
  }

  function refreshGoalOut() {
    var g = $('#goalOut'), m = $('#minOut');
    if (g) g.textContent = C.formatDuration(state.settings.goalMin, { short: true });
    if (m) m.textContent = C.formatDuration(state.settings.minMin, { short: true });
  }

  /* ------------------------------------------------------- Export/Import */

  function download(filename, content, type) {
    try {
      var blob = new Blob([content], { type: type });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1000);
      return true;
    } catch (e) {
      console.error(e);
      toast('Datei konnte nicht erstellt werden.', true);
      return false;
    }
  }

  function stamp() { return todayKey().replace(/-/g, ''); }

  function exportJson() {
    if (!state.entries.length) { toast('Noch keine Daten zum Sichern.', true); return; }
    var data = C.buildExport(state.entries, state.settings);
    if (download('schlaftagebuch-' + stamp() + '.json', JSON.stringify(data, null, 2), 'application/json')) {
      toast(state.entries.length + ' Nächte gesichert');
    }
  }

  function exportCsv() {
    if (!state.entries.length) { toast('Noch keine Daten zum Sichern.', true); return; }
    if (download('schlaftagebuch-' + stamp() + '.csv', '\uFEFF' + C.toCsv(state.entries), 'text/csv;charset=utf-8')) {
      toast('CSV erstellt');
    }
  }

  function handleImportFile(file) {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { toast('Die Datei ist zu groß für ein Schlaftagebuch.', true); return; }
    var reader = new FileReader();
    reader.onerror = function () { toast('Die Datei konnte nicht gelesen werden.', true); };
    reader.onload = function () {
      var text = String(reader.result || '');
      var preview = C.parseImport(text, state.entries, 'keep');
      if (!preview.ok) { toast(preview.error, true); return; }
      var dlg = $('#dlgImport');
      $('#impText').innerHTML =
        'Die Datei enthält <strong>' + (preview.added + preview.skipped + preview.updated) + '</strong> gültige Nächte.<br>' +
        '<strong>' + preview.added + '</strong> davon fehlen dir noch, <strong>' + preview.skipped + '</strong> sind bereits vorhanden.' +
        (preview.invalid ? '<br>' + preview.invalid + ' Einträge sind fehlerhaft und werden übersprungen.' : '');

      function run(mode) {
        var res = C.parseImport(text, state.entries, mode);
        if (!res.ok) { toast(res.error, true); dlg.close(); return; }
        writeJson(KEY_BACKUP, { entries: state.entries, settings: state.settings, at: new Date().toISOString() });
        state.entries = res.entries;
        if (res.settings) state.settings = Object.assign({}, state.settings, res.settings);
        if (!saveEntries()) { dlg.close(); return; }
        saveSettings();
        applyTheme();
        dlg.close();
        toast(res.added + ' neu, ' + res.updated + ' aktualisiert, ' + res.skipped + ' übersprungen');
        renderAll();
      }
      var keep = function () { cleanup(); run('keep'); };
      var over = function () { cleanup(); run('overwrite'); };
      var cancelFn = function () { cleanup(); dlg.close(); };
      function cleanup() {
        $('#impKeep').removeEventListener('click', keep);
        $('#impOverwrite').removeEventListener('click', over);
        $('#impCancel').removeEventListener('click', cancelFn);
        dlg.removeEventListener('close', cleanup);
      }
      $('#impKeep').addEventListener('click', keep);
      $('#impOverwrite').addEventListener('click', over);
      $('#impCancel').addEventListener('click', cancelFn);
      dlg.addEventListener('close', cleanup);
      dlg.showModal();
    };
    reader.readAsText(file);
  }

  function undoImport() {
    var b = readJson(KEY_BACKUP, null);
    if (!b) { toast('Keine Sicherung vorhanden.', true); return; }
    confirmDialog('Import zurücknehmen?',
      'Der Stand von vor dem letzten Import wird wiederhergestellt (' + (b.entries || []).length + ' Nächte).',
      'Ja, zurücknehmen').then(function (yes) {
      if (!yes) return;
      state.entries = (b.entries || []).map(function (e) { return C.normalizeEntry(e); })
        .filter(function (e) { return e && C.validateEntry(e).ok; });
      if (b.settings) state.settings = Object.assign({}, C.DEFAULT_SETTINGS, b.settings);
      saveEntries(); saveSettings();
      try { localStorage.removeItem(KEY_BACKUP); } catch (e) {}
      applyTheme(); renderAll();
      toast('Stand wiederhergestellt');
    });
  }

  function wipeAll() {
    confirmDialog('Wirklich alles löschen?',
      'Alle ' + state.entries.length + ' Nächte werden von diesem Gerät entfernt. Das lässt sich nur mit einer vorher gesicherten JSON-Datei rückgängig machen.',
      'Ja, alles löschen').then(function (yes) {
      if (!yes) return;
      state.entries = [];
      saveEntries();
      try { localStorage.removeItem(KEY_BACKUP); } catch (e) {}
      renderAll();
      toast('Alle Daten gelöscht');
    });
  }

  function loadDemo() {
    var out = [];
    var seed = Date.now() % 100000;
    function rnd() { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }
    for (var i = 44; i >= 0; i--) {
      var date = C.addDays(maxDate(), -i);
      var weekend = C.isWeekendNight(date);
      var alcohol = rnd() > 0.78, sport = rnd() > 0.6, stress = rnd() > 0.7;
      var q = 6 + (sport ? 1 : 0) - (alcohol ? 2 : 0) - (stress ? 1 : 0) + Math.round(rnd() * 2 - 1);
      var factors = [];
      if (alcohol) factors.push('alkohol');
      if (sport) factors.push('sport');
      if (stress) factors.push('stress');
      if (rnd() > 0.5) factors.push('bildschirm');
      out.push({
        date: date,
        bed: C.fromMin(1350 + Math.round(rnd() * 70) + (weekend ? 55 : 0) + (alcohol ? 35 : 0)),
        wake: C.fromMin(375 + Math.round(rnd() * 25) + (weekend ? 70 : 0)),
        latency: alcohol ? 5 : [5, 15, 30][Math.floor(rnd() * 3)],
        awake: alcohol ? 30 : [0, 0, 15, 30][Math.floor(rnd() * 4)],
        quality: Math.max(1, Math.min(10, q)),
        factors: factors.filter(function (f) { return (state.settings.factors || []).indexOf(f) >= 0; }),
        note: '', updatedAt: new Date().toISOString()
      });
    }
    state.entries = out.filter(function (e) { return C.validateEntry(e).ok; });
    saveEntries();
    renderAll();
    show('stats');
    toast('45 Beispielnächte geladen');
  }

  /* -------------------------------------------------------------- Router */

  function show(view, fromHistory) {
    if (!fromHistory && state.view !== view && window.history && window.history.pushState) {
      try { window.history.pushState({ view: view }, ''); } catch (e) {}
    }
    state.view = view;
    $$('.view').forEach(function (v) { v.classList.toggle('is-active', v.id === 'view-' + view); });
    $$('.nav button').forEach(function (b) {
      if (b.dataset.view === view) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
    updateSaveBar();
    if (view === 'stats') renderStats();
    if (view === 'more') renderMore();
    if (view === 'night') renderNight();
    window.scrollTo(0, 0);
  }

  function openDate(date) {
    if (date > navMax()) date = navMax();
    state.date = date;
    state.draft = suggestDraft(date);
    state.dirty = false;
    state.freeLatency = false;
    state.freeAwake = false;
    show('night');
  }

  function touch() {
    var wasClean = !state.dirty;
    state.dirty = true;
    updateSaveBar();
    // Bei der allerersten Änderung tritt der Hauptbildschirm aus dem
    // Leerzustand heraus – danach genügt das reine Aktualisieren.
    if (wasClean && state.view === 'night') renderNight();
  }

  function renderAll() {
    if (state.date > navMax()) state.date = navMax();
    state.draft = suggestDraft(state.date);
    renderNight();
    if (state.view === 'stats') renderStats();
    if (state.view === 'more') renderMore();
  }

  function applyTheme() {
    var t = state.settings.theme;
    if (t === 'auto') {
      t = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    }
    document.documentElement.setAttribute('data-theme', t);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', t === 'light' ? '#eef0f3' : '#12151c');
  }

  /* ---------------------------------------------------------- Ereignisse */

  function bind() {
    $$('.nav button').forEach(function (b) {
      b.addEventListener('click', function () {
        if (b.dataset.view === 'night' && state.date !== lastNight() && !state.dirty) {
          openDate(lastNight());
          return;
        }
        show(b.dataset.view);
      });
    });

    $('#dayPrev').addEventListener('click', function () { openDate(C.addDays(state.date, -1)); });
    $('#dayNext').addEventListener('click', function () {
      if (state.date >= navMax()) return;
      openDate(C.addDays(state.date, 1));
    });

    var picker = $('#datePicker');
    picker.addEventListener('change', function () {
      if (!C.isValidKey(this.value)) return;
      openDate(this.value > navMax() ? navMax() : this.value);
    });
    $('#dayPick').addEventListener('click', function () {
      if (picker.showPicker) { try { picker.showPicker(); return; } catch (e) {} }
      picker.focus();
      picker.click();
    });

    $('#inBed').addEventListener('input', function () {
      if (C.toMin(this.value) !== null) { state.draft.bed = this.value; touch(); renderNight(); }
    });
    $('#inWake').addEventListener('input', function () {
      if (C.toMin(this.value) !== null) { state.draft.wake = this.value; touch(); renderNight(); }
    });

    $$('.stepbtn[data-step]').forEach(function (b) {
      b.addEventListener('click', function () {
        var parts = b.dataset.step.split(':');
        var field = parts[0], delta = parseInt(parts[1], 10);
        var cur = C.toMin(state.draft[field]);
        if (cur === null) return;
        state.draft[field] = C.fromMin(cur + delta);
        touch();
        renderNight();
      });
    });

    $('#inLatency').addEventListener('input', function () {
      var v = parseInt(this.value, 10);
      if (!isFinite(v)) return;
      state.draft.latency = Math.max(0, Math.min(600, v));
      touch();
      renderNight();
    });
    $('#inAwake').addEventListener('input', function () {
      var v = parseInt(this.value, 10);
      if (!isFinite(v)) return;
      state.draft.awake = Math.max(0, Math.min(600, v));
      touch();
      renderNight();
    });

    [['#inTempBed', 'tempBed'], ['#inTempWake', 'tempWake']].forEach(function (pair) {
      var input = $(pair[0]);
      input.addEventListener('input', function () {
        state.draft[pair[1]] = this.value.trim() === '' ? null : C.cleanTemp(this.value);
        touch();
      });
      // Beim Verlassen aufräumen: gerundet, mit Komma, Unsinn zurücksetzen
      input.addEventListener('blur', function () { renderTemps(); });
    });

    $$('.stepbtn[data-temp]').forEach(function (b) {
      b.addEventListener('click', function () {
        var parts = b.dataset.temp.split(':');
        var field = parts[0], delta = parseFloat(parts[1]);
        var cur = state.draft[field];
        if (cur === null || cur === undefined) cur = lastKnownTemp(field);
        if (cur === null || cur === undefined) cur = 20;
        state.draft[field] = Math.max(-20, Math.min(50, Math.round((cur + delta) * 10) / 10));
        touch();
        renderTemps();
      });
    });

    $('#tempUnknown').addEventListener('change', function () { setTempsUnknown(this.checked); });

    $('#inQuality').addEventListener('input', function () {
      state.draft.quality = parseInt(this.value, 10);
      touch();
      $('#qualVal').textContent = state.draft.quality;
      $('#qualWord').textContent = ' · ' + qualityWord(state.draft.quality);
    });

    $('#inNote').addEventListener('input', function () { state.draft.note = this.value; touch(); });

    $('#btnSave').addEventListener('click', saveDraft);

    $('#btnDeleteEntry').addEventListener('click', function () {
      if (isPlannedDate(state.date)) {
        savePlanned(null);
        state.draft = suggestDraft(state.date);
        state.dirty = false;
        renderNight();
        toast('Vormerkung gelöscht');
        return;
      }
      confirmDialog('Eintrag löschen?', C.formatDate(state.date, 'long') + ' wird entfernt.', 'Ja, löschen')
        .then(function (yes) {
          if (!yes) return;
          deleteEntry(state.date);
          state.draft = suggestDraft(state.date);
          state.dirty = false;
          renderNight();
          toast('Eintrag gelöscht');
        });
    });

    $('#fileImport').addEventListener('change', function () {
      handleImportFile(this.files && this.files[0]);
      this.value = '';
    });

    if (window.matchMedia) {
      var mq = window.matchMedia('(prefers-color-scheme: light)');
      var onChange = function () { if (state.settings.theme === 'auto') applyTheme(); };
      if (mq.addEventListener) mq.addEventListener('change', onChange);
      else if (mq.addListener) mq.addListener(onChange);
    }

    window.addEventListener('popstate', function (ev) {
      var v = ev.state && ev.state.view ? ev.state.view : 'night';
      if (v !== state.view) show(v, true);
    });

    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState !== 'visible') return;
      if (state.view === 'night' && state.date !== lastNight() && !state.dirty) openDate(lastNight());
    });
  }

  /* ---------------------------------------------------------------- Start */

  function init() {
    try {
      localStorage.setItem('__test__', '1');
      localStorage.removeItem('__test__');
    } catch (e) {
      storageOk = false;
    }

    loadAll();
    applyTheme();
    state.date = lastNight();
    state.draft = suggestDraft(state.date);
    bind();
    if (window.history && window.history.replaceState) {
      try { window.history.replaceState({ view: 'night' }, ''); } catch (e) {}
    }
    show('night', true);

    if (!storageOk) {
      $('#entryWarnings').appendChild(el('div', { class: 'banner',
        text: 'Dieser Browser erlaubt kein lokales Speichern (z. B. im privaten Modus). Einträge gehen beim Schließen verloren.' }));
    }

    if ('serviceWorker' in navigator) {
      window.addEventListener('load', function () {
        // updateViaCache: 'none' – der Service Worker selbst darf nie aus dem
        // Browser-Cache kommen, sonst bemerkt das Handy neue Versionen nicht.
        navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' })
          .then(function (reg) {
            reg.update();
            document.addEventListener('visibilitychange', function () {
              if (document.visibilityState === 'visible') reg.update();
            });
          })
          .catch(function (e) { console.warn('SW', e); });
      });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.__app = { state: state, show: show, openDate: openDate, saveDraft: saveDraft,
    renderStats: renderStats, renderMore: renderMore, maxDate: maxDate, moveFactor: moveFactor,
    lastNight: lastNight, navMax: navMax, KEY_PLANNED: KEY_PLANNED,
    handleImportFile: handleImportFile, loadDemo: loadDemo,
    KEY_ENTRIES: KEY_ENTRIES, KEY_SETTINGS: KEY_SETTINGS };
})();
