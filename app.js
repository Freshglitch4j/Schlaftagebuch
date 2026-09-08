/* =========================================================================
   Schlaftagebuch – Anwendungslogik
   Speichert ausschließlich lokal (localStorage). Keine Netzwerkzugriffe.
   ========================================================================= */
(function () {
  'use strict';

  var C = window.SleepCore;
  var KEY_ENTRIES = 'schlaftagebuch.entries.v1';
  var KEY_SETTINGS = 'schlaftagebuch.settings.v1';
  var KEY_BACKUP = 'schlaftagebuch.backup.v1';

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
    view: 'night',
    date: null,
    draft: null,
    dirty: false,
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
    if (!Array.isArray(state.settings.factors) || !state.settings.factors.length) {
      state.settings.factors = C.DEFAULT_FACTORS.slice();
    }
  }

  function saveEntries() { return writeJson(KEY_ENTRIES, C.sortEntries(state.entries)); }
  function saveSettings() { return writeJson(KEY_SETTINGS, state.settings); }

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

  function qualityWord(q) {
    if (q <= 2) return 'wie gerädert';
    if (q <= 4) return 'schlecht';
    if (q <= 6) return 'geht so';
    if (q <= 8) return 'gut';
    return 'top erholt';
  }

  /* ------------------------------------------------------------ Vorgaben */

  function suggestDraft(date) {
    var existing = getEntry(date);
    if (existing) return Object.assign({}, existing, { factors: (existing.factors || []).slice() });

    var recent = C.sortEntries(state.entries).slice(-14);
    var now = new Date();
    var nowMin = now.getHours() * 60 + now.getMinutes();
    var wake;
    if (date === todayKey() && nowMin >= 4 * 60 && nowMin <= 13 * 60) {
      // Morgens: fünf Minuten vor dem Öffnen der App, auf 5 Minuten gerundet.
      // Außerhalb dieses Fensters wäre „jetzt“ als Aufstehzeit meist falsch.
      wake = C.fromMin(Math.round((nowMin - 5) / 5) * 5);
    } else {
      wake = recent.length ? C.meanClockTime(recent.map(function (e) { return e.wake; })) : '07:00';
      wake = C.fromMin(Math.round(C.toMin(wake) / 5) * 5);
    }
    var bed = recent.length ? C.meanClockTime(recent.map(function (e) { return e.bed; })) : '23:00';
    bed = C.fromMin(Math.round(C.toMin(bed) / 5) * 5);

    var lat = recent.length ? C.nearestOption(C.LATENCY_OPTIONS, C.median(recent.map(function (e) { return e.latency; }))) : 10;
    var awk = recent.length ? C.nearestOption(C.AWAKE_OPTIONS, C.median(recent.map(function (e) { return e.awake; }))) : 0;
    var qual = recent.length ? Math.round(C.median(recent.map(function (e) { return e.quality; }))) : 6;

    return { date: date, bed: bed, wake: wake, latency: lat, awake: awk, quality: qual, factors: [], note: '' };
  }

  /* ------------------------------------------------------- Ansicht Nacht */

  function buildSegmented(container, options, getValue, setValue) {
    container.innerHTML = '';
    options.forEach(function (opt) {
      var b = el('button', {
        type: 'button', text: opt.label, 'aria-pressed': String(getValue() === opt.value),
        onclick: function () { setValue(opt.value); touch(); renderNight(); }
      });
      container.appendChild(b);
    });
  }

  function buildChips() {
    var wrap = $('#chipsFactors');
    wrap.innerHTML = '';
    var active = state.settings.factors || C.DEFAULT_FACTORS;
    C.FACTORS.filter(function (f) { return active.indexOf(f.id) >= 0; }).forEach(function (f) {
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
      wrap.appendChild(el('p', { class: 'note-small', text: 'Keine Faktoren aktiv. Unter „Mehr“ auswählen.' }));
    }
  }

  function renderNight() {
    var d = state.draft;
    var isToday = state.date === todayKey();
    var isYesterday = state.date === C.addDays(todayKey(), -1);
    $('#dayTitle').textContent = isToday ? 'Letzte Nacht' : (isYesterday ? 'Vorletzte Nacht' : C.formatDate(state.date, 'short').slice(0, -1));
    $('#daySub').textContent = C.formatDate(state.date, 'long');
    $('#dayNext').disabled = state.date >= todayKey();

    $('#inBed').value = d.bed;
    $('#inWake').value = d.wake;
    $('#inQuality').value = d.quality;
    $('#qualVal').textContent = d.quality;
    $('#qualWord').textContent = ' · ' + qualityWord(d.quality);
    $('#inNote').value = d.note || '';

    buildSegmented($('#segLatency'), C.LATENCY_OPTIONS,
      function () { return d.latency; }, function (v) { d.latency = v; });
    buildSegmented($('#segAwake'), C.AWAKE_OPTIONS,
      function () { return d.awake; }, function (v) { d.awake = v; });
    buildChips();

    // Hero
    var der = C.derive(d);
    var goal = state.settings.goalMin;
    if (der && der.timeInBed > 0 && der.timeInBed <= 16 * 60) {
      var h = Math.floor(der.sleep / 60), m = der.sleep % 60;
      $('#heroNum').textContent = h + ':' + String(m).padStart(2, '0');
      $('#heroUnit').textContent = 'h geschlafen';
      var diff = der.sleep - goal;
      $('#heroCaption').innerHTML = '<strong>' + C.formatDuration(der.timeInBed) + '</strong> im Bett · ' +
        Math.round(der.efficiency * 100) + ' % davon geschlafen · ' +
        (Math.abs(diff) < 5 ? 'genau am Ziel'
          : (diff > 0 ? C.formatDuration(diff) + ' über dem Ziel' : C.formatDuration(-diff) + ' unter dem Ziel'));

      // Nachtbalken
      var bar = $('#nightBar');
      bar.innerHTML = '';
      var total = der.timeInBed;
      function seg(cls, min, label) {
        if (min <= 0) return;
        bar.appendChild(el('div', { class: 'seg ' + cls, style: 'width:' + (min / total * 100) + '%', title: label }));
      }
      seg('seg-idle', der.latency, 'Einschlafen');
      seg('seg-sleep', der.sleep, 'Schlaf');
      seg('seg-idle', der.awake, 'wach gelegen');
      if (goal < total) {
        bar.appendChild(el('div', { class: 'goalmark', style: 'left:' + (goal / total * 100) + '%' }));
      }
      $('#legendBed').textContent = d.bed + ' Uhr';
      $('#legendWake').textContent = d.wake + ' Uhr';
    } else {
      $('#heroNum').textContent = '–';
      $('#heroUnit').textContent = '';
      $('#heroCaption').textContent = 'Bitte Zeiten prüfen.';
      $('#nightBar').innerHTML = '';
    }

    // Warnungen und Fehler
    var v = C.validateEntry(d);
    var box = $('#entryWarnings');
    box.innerHTML = '';
    var msgs = v.errors.concat(v.warnings);
    if (msgs.length) {
      box.appendChild(el('div', { class: 'banner', html: (v.errors.length ? 'So lässt sich die Nacht nicht speichern:' : 'Sieht ungewöhnlich aus:') +
        '<ul>' + msgs.map(function (m) { return '<li>' + esc(m) + '</li>'; }).join('') + '</ul>' }));
    }

    var exists = !!getEntry(state.date);
    $('#btnSave').textContent = exists ? 'Änderungen speichern' : 'Nacht speichern';
    $('#btnDeleteEntry').style.display = exists ? '' : 'none';
  }

  function saveDraft() {
    var d = Object.assign({}, state.draft, { updatedAt: new Date().toISOString() });
    var v = C.validateEntry(d);
    if (!v.ok) { toast(v.errors[0], true); renderNight(); return; }
    if (!upsertEntry(C.normalizeEntry(d))) return;
    state.dirty = false;
    var der = C.derive(d);
    toast('Gespeichert · ' + C.formatDuration(der.sleep) + ' Schlaf');
    renderNight();
    show('stats');
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

  /**
   * Hauptdiagramm: Schlafdauer als Balken, Ziel als Linie,
   * 7-Tage-Mittel als Linie, Schlafqualität als Punkte auf zweiter Achse.
   */
  function mainChart(days) {
    var today = todayKey();
    var from = C.addDays(today, -(days - 1));
    var dates = C.dateRange(from, today);
    var byDate = {};
    state.entries.forEach(function (e) { byDate[e.date] = e; });

    var series = dates.map(function (dt) {
      var e = byDate[dt];
      var der = e ? C.derive(e) : null;
      return { date: dt, value: der ? der.sleep : null, quality: e ? e.quality : null, entry: e };
    });
    var roll = C.rollingAverage(series, 7);
    var goal = state.settings.goalMin;

    var W = 360, H = 208, padL = 30, padR = 24, padT = 12, padB = 20;
    var innerW = W - padL - padR, innerH = H - padT - padB;
    var maxVal = Math.max(goal, 60);
    series.forEach(function (p) { if (p.value !== null) maxVal = Math.max(maxVal, p.value); });
    var yMax = Math.ceil((maxVal + 20) / 60) * 60;
    var y = function (v) { return padT + innerH - (v / yMax) * innerH; };
    var yQ = function (q) { return padT + innerH - ((q - 0.5) / 10) * innerH; };
    var slot = innerW / dates.length;
    var bw = Math.max(2, Math.min(slot * 0.62, 22));
    var x = function (i) { return padL + slot * i + slot / 2; };

    var svg = s('svg', { class: 'chart', viewBox: '0 0 ' + W + ' ' + H, role: 'img',
      'aria-label': 'Schlafdauer der letzten ' + days + ' Tage' });

    // Stundenraster
    for (var hv = 0; hv <= yMax; hv += 120) {
      svg.appendChild(s('line', { x1: padL, x2: W - padR, y1: y(hv), y2: y(hv),
        stroke: 'var(--line-soft)', 'stroke-width': 1 }));
      svg.appendChild(s('text', { x: padL - 5, y: y(hv) + 3.5, 'text-anchor': 'end',
        'font-size': 9.5, fill: 'var(--text-faint)', text: (hv / 60) + 'h' }));
    }

    // Balken
    series.forEach(function (p, i) {
      if (p.value === null) return;
      var hgt = Math.max(1.5, (p.value / yMax) * innerH);
      svg.appendChild(s('rect', {
        x: x(i) - bw / 2, y: y(p.value), width: bw, height: hgt, rx: Math.min(3, bw / 2),
        fill: p.value >= goal ? 'var(--accent)' : 'var(--bar)',
        opacity: state.selectedDay && state.selectedDay !== p.date ? 0.45 : 1
      }));
    });

    // Ziel-Linie
    svg.appendChild(s('line', { x1: padL, x2: W - padR, y1: y(goal), y2: y(goal),
      stroke: 'var(--text)', 'stroke-width': 1.2, 'stroke-dasharray': '5 4', opacity: 0.65 }));

    // 7-Tage-Mittel
    var path = '', started = false;
    roll.forEach(function (p, i) {
      if (p.value === null) { started = false; return; }
      path += (started ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(p.value).toFixed(1) + ' ';
      started = true;
    });
    if (path) svg.appendChild(s('path', { d: path, fill: 'none', stroke: 'var(--text)', 'stroke-width': 1.6, opacity: 0.55 }));

    // Qualität
    var qpath = '', qs = false;
    series.forEach(function (p, i) {
      if (p.quality === null) { qs = false; return; }
      qpath += (qs ? 'L' : 'M') + x(i).toFixed(1) + ' ' + yQ(p.quality).toFixed(1) + ' ';
      qs = true;
    });
    if (qpath) svg.appendChild(s('path', { d: qpath, fill: 'none', stroke: 'var(--data)', 'stroke-width': 1.4, opacity: 0.85 }));
    if (days <= 31) {
      series.forEach(function (p, i) {
        if (p.quality === null) return;
        svg.appendChild(s('circle', { cx: x(i), cy: yQ(p.quality), r: 2.4, fill: 'var(--data)' }));
      });
    }
    // Rechte Achse
    [2, 6, 10].forEach(function (q) {
      svg.appendChild(s('text', { x: W - padR + 4, y: yQ(q) + 3.5, 'font-size': 9.5,
        fill: 'var(--data)', text: String(q) }));
    });

    // Datumsbeschriftung
    var step = days <= 10 ? 1 : (days <= 31 ? 5 : 15);
    dates.forEach(function (dt, i) {
      if ((dates.length - 1 - i) % step !== 0) return;
      svg.appendChild(s('text', { x: x(i), y: H - 6, 'text-anchor': 'middle', 'font-size': 9,
        fill: 'var(--text-faint)', text: C.formatDate(dt, 'short') }));
    });

    // Tippflächen
    series.forEach(function (p, i) {
      var r = s('rect', { x: padL + slot * i, y: padT, width: slot, height: innerH, fill: 'transparent' });
      r.style.cursor = 'pointer';
      r.addEventListener('click', function () {
        state.selectedDay = state.selectedDay === p.date ? null : p.date;
        renderStats();
      });
      svg.appendChild(r);
    });

    return svg;
  }

  function scatterChart() {
    var items = C.summarize(state.entries, state.settings.goalMin).items || [];
    if (items.length < C.MIN_FOR_CORRELATION) return null;
    var useSleep = state.scatterX === 'sleep';
    var xs = items.map(function (it) { return useSleep ? it.d.sleep : C.toNightAxis(C.toMin(it.bed)); });
    var ys = items.map(function (it) { return it.quality; });

    var W = 360, H = 180, padL = 30, padR = 12, padT = 10, padB = 24;
    var innerW = W - padL - padR, innerH = H - padT - padB;
    var xMin = Math.min.apply(null, xs), xMax = Math.max.apply(null, xs);
    if (xMax - xMin < 30) { xMin -= 30; xMax += 30; }
    var px = function (v) { return padL + ((v - xMin) / (xMax - xMin)) * innerW; };
    var py = function (q) { return padT + innerH - ((q - 0.5) / 10) * innerH; };

    var svg = s('svg', { class: 'chart', viewBox: '0 0 ' + W + ' ' + H, role: 'img',
      'aria-label': 'Zusammenhang zwischen ' + (useSleep ? 'Schlafdauer' : 'Schlafenszeit') + ' und Qualität' });

    [2, 4, 6, 8, 10].forEach(function (q) {
      svg.appendChild(s('line', { x1: padL, x2: W - padR, y1: py(q), y2: py(q), stroke: 'var(--line-soft)', 'stroke-width': 1 }));
      svg.appendChild(s('text', { x: padL - 5, y: py(q) + 3.5, 'text-anchor': 'end', 'font-size': 9.5, fill: 'var(--text-faint)', text: String(q) }));
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

  function factorChart() {
    var active = state.settings.factors || C.DEFAULT_FACTORS;
    var rows = active.map(function (f) { return C.factorComparison(state.entries, f); })
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

  function renderStats() {
    var body = $('#statsBody');
    body.innerHTML = '';
    var goal = state.settings.goalMin;
    var n = state.entries.length;
    $('#statsSub').textContent = n === 0 ? 'Noch keine Nächte erfasst'
      : n + (n === 1 ? ' Nacht erfasst' : ' Nächte erfasst') + ' · Ziel ' + C.formatDuration(goal);

    if (n === 0) {
      body.appendChild(el('div', { class: 'empty' }, [
        el('h2', { text: 'Hier entsteht dein Bild' }),
        el('p', { text: 'Trag deine erste Nacht ein. Ab drei Nächten zeigt die App Durchschnitte, ab vierzehn mögliche Zusammenhänge.' }),
        el('button', { class: 'btn btn-primary', style: 'margin-top:20px', text: 'Nacht eintragen',
          onclick: function () { show('night'); } })
      ]));
      return;
    }

    // --- Letzte Nacht --------------------------------------------------
    var last = C.sortEntries(state.entries)[state.entries.length - 1];
    var lastD = C.derive(last);
    var lastCard = el('div', { class: 'card' }, [
      el('h2', { text: C.daysBetween(last.date, todayKey()) === 0 ? 'Letzte Nacht' : 'Zuletzt erfasst · ' + C.formatDate(last.date, 'short') })
    ]);
    lastCard.appendChild(el('div', { class: 'statgrid' }, [
      statBlock('Geschlafen', C.formatDuration(lastD.sleep),
        (lastD.sleep >= goal ? '+' : '−') + C.formatDuration(Math.abs(lastD.sleep - goal)) + ' zum Ziel',
        lastD.sleep >= goal ? 'v-good' : 'v-warn'),
      statBlock('Qualität', last.quality + ' <small>/ 10</small>', qualityWord(last.quality)),
      statBlock('Im Bett', last.bed + ' – ' + last.wake, C.formatDuration(lastD.timeInBed) + ' insgesamt'),
      statBlock('Effizienz', Math.round(lastD.efficiency * 100) + ' <small>%</small>',
        C.formatDuration(lastD.latency + lastD.awake) + ' wach im Bett')
    ]));
    body.appendChild(lastCard);

    // --- Zeitraum-Karten ----------------------------------------------
    [7, 30].forEach(function (win) {
      var sub = C.lastNDays(state.entries, win, todayKey());
      var st = C.summarize(sub, goal);
      var card = el('div', { class: 'card' }, [
        el('h2', { text: 'Letzte ' + win + ' Tage · ' + st.count + ' Nächte erfasst' })
      ]);
      if (!st.count) {
        card.appendChild(el('p', { class: 'note-small', text: 'In diesem Zeitraum liegen keine Einträge vor.' }));
        body.appendChild(card);
        return;
      }
      var grid = el('div', { class: 'statgrid' }, [
        statBlock('Ø Schlafdauer', C.formatDuration(st.avgSleep),
          (st.avgSleep >= goal ? '+' : '−') + C.formatDuration(Math.abs(st.avgSleep - goal)) + ' zum Ziel',
          st.avgSleep >= goal ? 'v-good' : 'v-warn'),
        statBlock('Ø Qualität', st.avgQuality.toFixed(1) + ' <small>/ 10</small>', qualityWord(st.avgQuality)),
        statBlock('Ziel erreicht', st.goalHit + ' <small>von ' + st.count + '</small>',
          Math.round(st.goalRate * 100) + ' % der Nächte'),
        statBlock('Ø ins Bett', st.meanBed,
          st.bedSd === null ? '' : 'schwankt ± ' + Math.round(st.bedSd) + ' min')
      ]);
      card.appendChild(grid);

      if (win === 30) {
        // Trend: zweite Hälfte gegen erste Hälfte
        var half = C.lastNDays(state.entries, 15, todayKey());
        var prevFrom = C.addDays(todayKey(), -29), prevTo = C.addDays(todayKey(), -15);
        var prev = state.entries.filter(function (e) { return e.date >= prevFrom && e.date <= prevTo; });
        if (half.length >= 5 && prev.length >= 5) {
          var a = C.summarize(half, goal).avgSleep, b = C.summarize(prev, goal).avgSleep;
          var delta = a - b;
          card.appendChild(el('div', { class: 'stat', style: 'margin-top:14px' }, [
            el('div', { class: 'k', text: 'Trend' }),
            el('div', { class: 'v', html: (delta >= 0 ? '+' : '−') + C.formatDuration(Math.abs(delta)),
              'data-x': '' }),
            el('div', { class: 'd', text: 'letzte 15 Tage gegenüber den 15 Tagen davor' })
          ]));
        }
        var debtDays = C.lastNDays(state.entries, 14, todayKey());
        var debt = C.summarize(debtDays, goal).debt;
        card.appendChild(el('p', { class: 'note-small',
          text: debt > 0
            ? 'Rechnerisch fehlen dir über die letzten 14 Tage ' + C.formatDuration(debt) + ' gegenüber deinem Ziel. ' +
              'Das ist eine einfache Summe der Differenzen, kein medizinischer Wert – Schlaf lässt sich nicht eins zu eins nachholen.'
            : 'Über die letzten 14 Tage liegst du in Summe ' + C.formatDuration(-debt) + ' über deinem Ziel.' }));
      }
      body.appendChild(card);
    });

    // --- Hauptdiagramm --------------------------------------------------
    var chartCard = el('div', { class: 'card' });
    chartCard.appendChild(el('h2', { text: 'Schlafdauer und Qualität' }));
    var tabs = el('div', { class: 'tabs' });
    [10, 30, 90].forEach(function (r) {
      tabs.appendChild(el('button', { type: 'button', text: r + ' Tage', 'aria-pressed': String(state.range === r),
        onclick: function () { state.range = r; state.selectedDay = null; renderStats(); } }));
    });
    chartCard.appendChild(tabs);
    var wrap = el('div', { class: 'chart-wrap' });
    wrap.appendChild(mainChart(state.range));
    chartCard.appendChild(wrap);
    chartCard.appendChild(el('div', { class: 'legend', html:
      '<span><i class="swatch" style="background:var(--accent)"></i>Ziel erreicht</span>' +
      '<span><i class="swatch" style="background:var(--bar)"></i>unter Ziel</span>' +
      '<span><i class="swatch swatch-line" style="background:var(--text);opacity:.55"></i>7-Tage-Mittel</span>' +
      '<span><i class="swatch swatch-line" style="background:var(--data)"></i>Qualität (rechte Achse)</span>' }));

    var readout = el('div', { class: 'readout' });
    if (state.selectedDay) {
      var e = getEntry(state.selectedDay);
      if (e) {
        var de = C.derive(e);
        readout.innerHTML = '<strong>' + C.formatDate(e.date, 'long') + '</strong><br>' +
          C.formatDuration(de.sleep) + ' Schlaf · Qualität ' + e.quality + '/10 · ' + e.bed + '–' + e.wake +
          ((e.factors || []).length ? '<br>' + e.factors.map(C.factorLabel).join(' · ') : '');
      } else {
        readout.innerHTML = '<strong>' + C.formatDate(state.selectedDay, 'long') + '</strong><br>Kein Eintrag für diese Nacht.';
      }
    } else {
      readout.textContent = 'Tippe auf einen Tag im Diagramm, um die Nacht zu sehen.';
    }
    chartCard.appendChild(readout);
    body.appendChild(chartCard);

    // --- Erkenntnisse ---------------------------------------------------
    var insights = C.buildInsights(state.entries, state.settings, todayKey());
    if (insights.length) {
      var ic = el('div', { class: 'card' }, [el('h2', { text: 'Was in deinen Daten steht' })]);
      insights.forEach(function (i) {
        ic.appendChild(el('div', { class: 'insight ' + i.tone }, [
          el('h3', { text: i.title }),
          el('p', { text: i.text })
        ]));
      });
      body.appendChild(ic);
    }

    // --- Empfehlungen ---------------------------------------------------
    var recs = C.buildRecommendations(state.entries, state.settings, todayKey());
    if (recs.length) {
      var rc = el('div', { class: 'card' }, [el('h2', { text: 'Wo du ansetzen könntest' })]);
      recs.forEach(function (r) {
        rc.appendChild(el('div', { class: 'rec' }, [el('h3', { text: r.title }), el('p', { text: r.text })]));
      });
      rc.appendChild(el('p', { class: 'note-small',
        text: 'Diese Hinweise stammen ausschließlich aus deinen eigenen Einträgen. Sie sind keine medizinische Beratung. Bei anhaltenden Schlafproblemen ist ärztlicher Rat der bessere Weg.' }));
      body.appendChild(rc);
    }

    // --- Faktorvergleich -------------------------------------------------
    var fc = factorChart();
    if (fc) {
      var fcard = el('div', { class: 'card' }, [el('h2', { text: 'Qualität mit und ohne Faktor' })]);
      fcard.appendChild(el('div', { class: 'chart-wrap' }, [fc]));
      fcard.appendChild(el('div', { class: 'legend', html:
        '<span><i class="swatch" style="background:var(--accent)"></i>Nächte mit dem Faktor</span>' +
        '<span><i class="swatch" style="background:var(--bar)"></i>Nächte ohne</span>' }));
      fcard.appendChild(el('p', { class: 'note-small',
        text: 'Blasse Balken bedeuten: der Unterschied ist so klein, dass er gut Zufall sein kann. Auch ein deutlicher Unterschied beweist keine Ursache.' }));
      body.appendChild(fcard);
    }

    // --- Streudiagramm ---------------------------------------------------
    var sc = scatterChart();
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

  /* ------------------------------------------------------ Ansicht Verlauf */

  function renderHistory() {
    var body = $('#histBody');
    body.innerHTML = '';
    var list = C.sortEntries(state.entries).reverse();
    $('#histSub').textContent = list.length ? list.length + ' Nächte · neueste zuerst' : 'Noch leer';

    if (!list.length) {
      body.appendChild(el('div', { class: 'empty' }, [
        el('h2', { text: 'Noch keine Nächte' }),
        el('p', { text: 'Sobald du Nächte einträgst, findest du sie hier – zum Nachsehen, Korrigieren oder Löschen.' })
      ]));
      return;
    }

    var currentMonth = null;
    list.forEach(function (e) {
      var m = e.date.slice(0, 7);
      if (m !== currentMonth) {
        currentMonth = m;
        body.appendChild(el('div', { class: 'hist-month', text: C.formatDate(e.date, 'month') }));
      }
      var d = C.derive(e);
      var dt = C.parseKey(e.date);
      body.appendChild(el('button', { class: 'hist-item', type: 'button',
        onclick: function () { openDate(e.date); } }, [
        el('div', { class: 'hist-day' }, [
          el('div', { class: 'dd', text: String(dt.getDate()) }),
          el('div', { class: 'ww', text: C.WEEKDAYS[dt.getDay()] })
        ]),
        el('div', { class: 'hist-main' }, [
          el('div', { class: 'dur', text: C.formatDuration(d.sleep) }),
          el('div', { class: 'meta', text: e.bed + '–' + e.wake +
            ((e.factors || []).length ? ' · ' + e.factors.map(C.factorLabel).join(', ') : '') })
        ]),
        el('div', { class: 'hist-q', text: String(e.quality),
          style: 'border-color:' + (e.quality >= 7 ? 'var(--good)' : e.quality <= 4 ? 'var(--danger)' : 'var(--line)') })
      ]));
    });
  }

  /* --------------------------------------------------------- Ansicht Mehr */

  function renderMore() {
    var body = $('#moreBody');
    body.innerHTML = '';

    // Schlafziel
    var goalCard = el('div', { class: 'card' }, [el('h2', { text: 'Schlafziel' })]);
    var goalRow = el('div', { class: 'row' }, [
      el('div', {}, [
        el('div', { class: 'rk', text: 'Zielschlafdauer' }),
        el('div', { class: 'rd', text: 'Gilt für Ziel-Linie, Statistik und Hinweise' })
      ]),
      el('div', { style: 'display:flex;align-items:center;gap:8px' }, [
        el('button', { class: 'iconbtn', text: '−', 'aria-label': 'Ziel 15 Minuten kürzer',
          onclick: function () { setGoal(state.settings.goalMin - 15); } }),
        el('span', { class: 'goal-display', id: 'goalOut', text: C.formatDuration(state.settings.goalMin, { short: true }) }),
        el('button', { class: 'iconbtn', text: '+', 'aria-label': 'Ziel 15 Minuten länger',
          onclick: function () { setGoal(state.settings.goalMin + 15); } })
      ])
    ]);
    goalCard.appendChild(goalRow);
    goalCard.appendChild(el('p', { class: 'note-small',
      text: 'Für Erwachsene werden meist sieben bis neun Stunden genannt. Der beste Wert ist der, nach dem du dich tagsüber wach fühlst.' }));
    body.appendChild(goalCard);

    // Faktoren
    var facCard = el('div', { class: 'card' }, [
      el('h2', { text: 'Faktoren im Eintrag' })
    ]);
    var chips = el('div', { class: 'chips' });
    C.FACTORS.forEach(function (f) {
      var on = (state.settings.factors || []).indexOf(f.id) >= 0;
      chips.appendChild(el('button', { class: 'chip', type: 'button', text: f.label, title: f.hint,
        'aria-pressed': String(on),
        onclick: function () {
          var arr = state.settings.factors.slice();
          var i = arr.indexOf(f.id);
          if (i >= 0) arr.splice(i, 1); else arr.push(f.id);
          if (!arr.length) { toast('Mindestens ein Faktor muss aktiv bleiben.', true); return; }
          if (arr.length > 8) { toast('Mehr als acht Faktoren machen die Eingabe morgens zu langsam.', true); return; }
          state.settings.factors = arr;
          saveSettings(); renderMore();
        } }));
    });
    facCard.appendChild(chips);
    facCard.appendChild(el('p', { class: 'note-small',
      text: 'Weniger ist hier mehr: Jeder Faktor braucht mindestens fünf Nächte mit und fünf ohne, bevor die App etwas dazu sagen kann. Bereits erfasste Faktoren bleiben in den Daten erhalten, auch wenn du sie hier ausblendest.' }));
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
      dataCard.appendChild(el('button', { class: 'btn', text: 'Beispieldaten zum Ausprobieren laden',
        onclick: loadDemo }));
    }
    dataCard.appendChild(el('button', { class: 'btn btn-danger', text: 'Alle Daten löschen', onclick: wipeAll }));
    body.appendChild(dataCard);

    // Info
    body.appendChild(el('div', { class: 'card' }, [
      el('h2', { text: 'Über diese App' }),
      el('p', { class: 'note-small', html:
        'Alle Einträge liegen ausschließlich im Speicher dieses Browsers auf diesem Gerät. ' +
        'Es gibt kein Konto, keinen Server, keine Werbung und keine Analyse durch Dritte. ' +
        'Die App funktioniert vollständig offline.<br><br>' +
        '<strong>Wichtig:</strong> Wenn du die Browserdaten für diese Seite löschst oder die App deinstallierst, sind auch die Einträge weg. ' +
        'Sichere deshalb regelmäßig die JSON-Datei.<br><br>' +
        'Die Hinweise in der Auswertung beschreiben Muster in deinen eigenen Zahlen. Sie sind keine Diagnose und ersetzen keine ärztliche Beratung.' })
    ]));
  }

  function setGoal(min) {
    state.settings.goalMin = Math.max(240, Math.min(660, min));
    saveSettings();
    var out = $('#goalOut');
    if (out) out.textContent = C.formatDuration(state.settings.goalMin, { short: true });
    renderNight();
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
      var date = C.addDays(todayKey(), -i);
      var weekend = C.isWeekendMorning(date);
      var alcohol = rnd() > 0.78;
      var sport = rnd() > 0.6;
      var stress = rnd() > 0.7;
      var bed = 1350 + Math.round(rnd() * 70) + (weekend ? 55 : 0) + (alcohol ? 35 : 0);
      var wake = 375 + Math.round(rnd() * 25) + (weekend ? 70 : 0);
      var q = 6 + (sport ? 1 : 0) - (alcohol ? 2 : 0) - (stress ? 1 : 0) + Math.round(rnd() * 2 - 1);
      var factors = [];
      if (alcohol) factors.push('alkohol');
      if (sport) factors.push('sport');
      if (stress) factors.push('stress');
      if (rnd() > 0.5) factors.push('bildschirm');
      out.push({
        date: date, bed: C.fromMin(bed), wake: C.fromMin(wake),
        latency: alcohol ? 3 : [3, 10, 22, 45][Math.floor(rnd() * 4)],
        awake: alcohol ? 25 : [0, 0, 10, 25][Math.floor(rnd() * 4)],
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
    $('#saveBar').classList.toggle('is-visible', view === 'night');
    if (view === 'stats') renderStats();
    if (view === 'history') renderHistory();
    if (view === 'more') renderMore();
    if (view === 'night') renderNight();
    window.scrollTo(0, 0);
  }

  function openDate(date) {
    state.date = date;
    state.draft = suggestDraft(date);
    state.dirty = false;
    show('night');
  }

  function renderAll() {
    state.draft = suggestDraft(state.date);
    renderNight();
    if (state.view === 'stats') renderStats();
    if (state.view === 'history') renderHistory();
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

  /* ------------------------------------------------------------- Ereignisse */

  function bind() {
    $$('.nav button').forEach(function (b) {
      b.addEventListener('click', function () {
        // Der Tab „Nacht“ meint immer die letzte Nacht – außer es gibt
        // ungespeicherte Änderungen an einem anderen Tag.
        if (b.dataset.view === 'night' && state.date !== todayKey() && !state.dirty) {
          openDate(todayKey());
          return;
        }
        show(b.dataset.view);
      });
    });

    $('#dayPrev').addEventListener('click', function () { openDate(C.addDays(state.date, -1)); });
    $('#dayNext').addEventListener('click', function () {
      if (state.date >= todayKey()) return;
      openDate(C.addDays(state.date, 1));
    });

    $('#inBed').addEventListener('input', function () {
      if (C.toMin(this.value) !== null) { state.draft.bed = this.value; touch(); renderNight(); }
    });
    $('#inWake').addEventListener('input', function () {
      if (C.toMin(this.value) !== null) { state.draft.wake = this.value; touch(); renderNight(); }
    });

    $$('.stepbtn').forEach(function (b) {
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

    $('#inQuality').addEventListener('input', function () {
      state.draft.quality = parseInt(this.value, 10);
      touch();
      $('#qualVal').textContent = state.draft.quality;
      $('#qualWord').textContent = ' · ' + qualityWord(state.draft.quality);
    });

    $('#inNote').addEventListener('input', function () { state.draft.note = this.value; touch(); });

    $('#btnSave').addEventListener('click', saveDraft);

    $('#btnDeleteEntry').addEventListener('click', function () {
      confirmDialog('Eintrag löschen?', C.formatDate(state.date, 'long') + ' wird entfernt.', 'Ja, löschen')
        .then(function (yes) {
          if (!yes) return;
          deleteEntry(state.date);
          state.draft = suggestDraft(state.date);
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

    // Beim Zurückkehren in die App auf den neuen Tag springen
    window.addEventListener('popstate', function (ev) {
      var v = ev.state && ev.state.view ? ev.state.view : 'night';
      if (v !== state.view) show(v, true);
    });

    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState !== 'visible') return;
      if (state.view === 'night' && state.date !== todayKey() && !state.dirty) {
        openDate(todayKey());
      }
    });
  }

  function touch() { state.dirty = true; }

  /* ------------------------------------------------------------------ Start */

  function init() {
    // Verfügbarkeit des Speichers prüfen
    try {
      localStorage.setItem('__test__', '1');
      localStorage.removeItem('__test__');
    } catch (e) {
      storageOk = false;
    }

    loadAll();
    applyTheme();
    state.date = todayKey();
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
        navigator.serviceWorker.register('sw.js').catch(function (e) { console.warn('SW', e); });
      });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  // Für Tests
  window.__app = { state: state, show: show, openDate: openDate, saveDraft: saveDraft,
    renderStats: renderStats, renderHistory: renderHistory, renderMore: renderMore,
    handleImportFile: handleImportFile, loadDemo: loadDemo, KEY_ENTRIES: KEY_ENTRIES, KEY_SETTINGS: KEY_SETTINGS };
})();
