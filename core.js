/*
 * Schlaftagebuch – Kernlogik
 * Reine Funktionen ohne DOM-Zugriff, damit sie in Node getestet werden können.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SleepCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var DAY = 1440;

  /* ---------------------------------------------------------------- Zeit */

  // "23:15" -> 1395 ; ungültig -> null
  function toMin(hhmm) {
    if (typeof hhmm !== 'string') return null;
    var m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
    if (!m) return null;
    var h = +m[1], mi = +m[2];
    if (h > 23 || mi > 59) return null;
    return h * 60 + mi;
  }

  // 1395 -> "23:15" (immer innerhalb eines Tages)
  function fromMin(min) {
    min = Math.round(min);
    min = ((min % DAY) + DAY) % DAY;
    return String(Math.floor(min / 60)).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0');
  }

  // Dauer von Bett bis Aufstehen, korrekt über Mitternacht.
  // 23:45 -> 07:15 = 450 min. Gleiche Uhrzeit = 24 h (wird von der Validierung abgefangen).
  function durationBetween(bed, wake) {
    var b = toMin(bed), w = toMin(wake);
    if (b === null || w === null) return null;
    var d = w - b;
    if (d <= 0) d += DAY;
    return d;
  }

  // Nachtachse: 12:00 mittags = 0. Dadurch liegen Zubettgeh- und Aufstehzeiten
  // auf einer durchgehenden Skala, auch wenn sie über Mitternacht gehen.
  function toNightAxis(min) { return ((min - 720) % DAY + DAY) % DAY; }
  function fromNightAxis(v) { return ((Math.round(v) + 720) % DAY + DAY) % DAY; }

  function meanClockTime(hhmmList) {
    var vals = hhmmList.map(toMin).filter(function (v) { return v !== null; }).map(toNightAxis);
    if (!vals.length) return null;
    return fromMin(fromNightAxis(mean(vals)));
  }

  function sdClockTime(hhmmList) {
    var vals = hhmmList.map(toMin).filter(function (v) { return v !== null; }).map(toNightAxis);
    if (vals.length < 2) return null;
    return sd(vals);
  }

  // 452 -> "7 h 32 min"
  function formatDuration(min, opts) {
    if (min === null || min === undefined || isNaN(min)) return '–';
    var neg = min < 0;
    var v = Math.round(Math.abs(min));
    var h = Math.floor(v / 60), m = v % 60;
    var s;
    if (opts && opts.short) s = h + ':' + String(m).padStart(2, '0') + ' h';
    else if (h === 0) s = m + ' min';
    else if (m === 0) s = h + ' h';
    else s = h + ' h ' + m + ' min';
    return (neg ? '−' : '') + s;
  }

  /* -------------------------------------------------------------- Datum */

  function pad2(n) { return String(n).padStart(2, '0'); }

  // Lokales Datum als YYYY-MM-DD (nie UTC benutzen – sonst Tagesverschiebung)
  function dateKey(d) {
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function parseKey(key) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key || ''));
    if (!m) return null;
    var d = new Date(+m[1], +m[2] - 1, +m[3]);
    if (d.getFullYear() !== +m[1] || d.getMonth() !== +m[2] - 1 || d.getDate() !== +m[3]) return null;
    return d;
  }

  function isValidKey(key) { return parseKey(key) !== null; }

  function addDays(key, n) {
    var d = parseKey(key);
    if (!d) return null;
    d.setDate(d.getDate() + n);
    return dateKey(d);
  }

  function daysBetween(a, b) {
    var da = parseKey(a), db = parseKey(b);
    if (!da || !db) return null;
    // Auf Mittag setzen, damit Sommerzeitwechsel keine ±1 Fehler erzeugen
    da.setHours(12, 0, 0, 0); db.setHours(12, 0, 0, 0);
    return Math.round((db - da) / 86400000);
  }

  function dateRange(fromKey, toKey) {
    var out = [], cur = fromKey, guard = 0;
    while (guard++ < 4000) {
      out.push(cur);
      if (cur === toKey) break;
      cur = addDays(cur, 1);
      if (!cur) break;
    }
    return out;
  }

  var WEEKDAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
  var MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli',
    'August', 'September', 'Oktober', 'November', 'Dezember'];

  function weekdayIndex(key) { var d = parseKey(key); return d ? d.getDay() : null; }
  function isWeekendMorning(key) { var w = weekdayIndex(key); return w === 0 || w === 6; }

  function formatDate(key, style) {
    var d = parseKey(key);
    if (!d) return key;
    if (style === 'long') return WEEKDAYS[d.getDay()] + ', ' + d.getDate() + '. ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear();
    if (style === 'month') return MONTHS[d.getMonth()] + ' ' + d.getFullYear();
    if (style === 'short') return pad2(d.getDate()) + '.' + pad2(d.getMonth() + 1) + '.';
    return pad2(d.getDate()) + '.' + pad2(d.getMonth() + 1) + '.' + d.getFullYear();
  }

  /* ---------------------------------------------------------- Statistik */

  function mean(a) { return a.length ? a.reduce(function (x, y) { return x + y; }, 0) / a.length : null; }

  function median(a) {
    if (!a.length) return null;
    var s = a.slice().sort(function (x, y) { return x - y; });
    var mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  }

  function sd(a) {
    if (a.length < 2) return null;
    var m = mean(a);
    return Math.sqrt(a.reduce(function (acc, v) { return acc + (v - m) * (v - m); }, 0) / (a.length - 1));
  }

  function pearson(xs, ys) {
    var n = xs.length;
    if (n < 3 || n !== ys.length) return null;
    var mx = mean(xs), my = mean(ys), sxy = 0, sxx = 0, syy = 0;
    for (var i = 0; i < n; i++) {
      var dx = xs[i] - mx, dy = ys[i] - my;
      sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
    }
    if (sxx === 0 || syy === 0) return null;
    return sxy / Math.sqrt(sxx * syy);
  }

  // Normalverteilungs-CDF (Abramowitz & Stegun 7.1.26)
  function normCdf(z) {
    var s = z < 0 ? -1 : 1;
    var x = Math.abs(z) / Math.SQRT2;
    var t = 1 / (1 + 0.3275911 * x);
    var y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
    return 0.5 * (1 + s * y);
  }

  // Welch-t-Test, p-Wert über Normalapproximation (bewusst konservativ interpretiert).
  // minVar setzt eine Untergrenze für die Varianz. Ohne sie würden Gruppen mit
  // immer identischen Werten (z. B. immer Note 7) eine Scheingenauigkeit erzeugen.
  function welch(a, b, minVar) {
    if (a.length < 2 || b.length < 2) return null;
    var floor = minVar || 0;
    var ma = mean(a), mb = mean(b);
    var va = Math.max(Math.pow(sd(a), 2), floor), vb = Math.max(Math.pow(sd(b), 2), floor);
    var se = Math.sqrt(va / a.length + vb / b.length);
    if (!isFinite(se) || se === 0) return null;
    var t = (ma - mb) / se;
    return { t: t, diff: ma - mb, meanA: ma, meanB: mb, p: 2 * (1 - normCdf(Math.abs(t))) };
  }

  /* ------------------------------------------------------ Eintragslogik */

  // Die Voreinstellungen sind exakte Minutenwerte – sie werden 1:1 von der
  // Zeit im Bett abgezogen. Über „freie Eingabe“ ist jeder Wert möglich.
  var LATENCY_OPTIONS = [
    { value: 5, label: '~5 min' },
    { value: 15, label: '~15 min' },
    { value: 30, label: '~30 min' }
  ];

  var AWAKE_OPTIONS = [
    { value: 0, label: 'gar nicht' },
    { value: 15, label: '~15 min' },
    { value: 30, label: '~30 min' }
  ];

  var FACTORS = [
    { id: 'alkohol', label: 'Alkohol', hint: 'Abends Alkohol getrunken' },
    { id: 'sport', label: 'Sport', hint: 'Am Tag davor Sport gemacht' },
    { id: 'stress', label: 'Stress', hint: 'Anstrengender oder belastender Tag' },
    { id: 'bildschirm', label: 'Bildschirm', hint: 'Handy oder TV bis kurz vor dem Einschlafen' },
    { id: 'spaetessen', label: 'Spät gegessen', hint: 'Größere Mahlzeit in den letzten 3 Stunden' },
    { id: 'mittagsschlaf', label: 'Mittagsschlaf', hint: 'Am Tag davor tagsüber geschlafen' },
    { id: 'koffein', label: 'Koffein spät', hint: 'Kaffee, Cola oder Energydrink nach 15 Uhr' },
    { id: 'sauna', label: 'Sauna', hint: 'Sauna oder heißes Bad am Abend' },
    { id: 'warm', label: 'Zimmer warm', hint: 'Schlafzimmer war zu warm oder stickig' },
    { id: 'besonderes', label: 'Besonderes', hint: 'Ungewöhnliches Ereignis, Reise, Krankheit' }
  ];

  var DEFAULT_FACTORS = ['alkohol', 'sport', 'stress', 'bildschirm', 'spaetessen', 'mittagsschlaf'];

  var DEFAULT_SETTINGS = {
    goalMin: 450,          // Ziel: 7 h 30 min
    minMin: 390,           // Minimum: 6 h 30 min – darunter gilt eine Nacht als zu kurz
    defaultBed: '22:30',
    defaultWake: '06:05',
    theme: 'auto',
    factors: DEFAULT_FACTORS.slice(),
    schemaVersion: 2
  };

  // Ampelbewertung einer Nacht
  function sleepStatus(sleepMin, settings) {
    if (sleepMin === null || sleepMin === undefined) return 'none';
    if (sleepMin >= settings.goalMin) return 'good';
    if (sleepMin < settings.minMin) return 'bad';
    return 'mid';
  }

  // Nächte werden nach dem Abend benannt, an dem man ins Bett geht.
  // Die letzte vollständige Nacht ist deshalb immer „gestern“.
  function lastNightKey(today) { return addDays(today, -1); }

  function isWeekendNight(key) { var w = weekdayIndex(key); return w === 5 || w === 6; }

  function factorLabel(id) {
    for (var i = 0; i < FACTORS.length; i++) if (FACTORS[i].id === id) return FACTORS[i].label;
    return id;
  }

  function nearestOption(options, minutes) {
    var best = options[0];
    for (var i = 1; i < options.length; i++) {
      if (Math.abs(options[i].value - minutes) < Math.abs(best.value - minutes)) best = options[i];
    }
    return best.value;
  }

  // Ergänzt einen Eintrag um alle abgeleiteten Werte
  function derive(entry) {
    var tib = durationBetween(entry.bed, entry.wake);
    if (tib === null) return null;
    var lat = Math.max(0, Number(entry.latency) || 0);
    var awk = Math.max(0, Number(entry.awake) || 0);
    var sleep = Math.max(0, tib - lat - awk);
    return {
      timeInBed: tib,
      latency: lat,
      awake: awk,
      sleep: sleep,
      efficiency: tib > 0 ? sleep / tib : 0
    };
  }

  /* Validierung: gibt { ok, errors[], warnings[] } zurück */
  function validateEntry(entry) {
    var errors = [], warnings = [];
    if (!entry || typeof entry !== 'object') return { ok: false, errors: ['Eintrag fehlt.'], warnings: [] };
    if (!isValidKey(entry.date)) errors.push('Datum ist ungültig.');
    if (toMin(entry.bed) === null) errors.push('Zeit „ins Bett“ fehlt oder ist ungültig.');
    if (toMin(entry.wake) === null) errors.push('Zeit „aufgestanden“ fehlt oder ist ungültig.');
    var q = Number(entry.quality);
    if (!isFinite(q) || q < 1 || q > 10) errors.push('Schlafqualität muss zwischen 1 und 10 liegen.');
    if (entry.factors && !Array.isArray(entry.factors)) errors.push('Faktoren müssen eine Liste sein.');

    if (!errors.length) {
      var d = derive(entry);
      if (d.timeInBed > 16 * 60) errors.push('Mehr als 16 Stunden im Bett – bitte Zeiten prüfen.');
      else if (d.timeInBed < 60) errors.push('Weniger als 1 Stunde im Bett – bitte Zeiten prüfen.');
      else {
        if (d.latency + d.awake >= d.timeInBed) errors.push('Einschlafzeit und Wachzeit sind zusammen länger als die Zeit im Bett.');
        if (d.timeInBed > 12 * 60) warnings.push('Ungewöhnlich lange im Bett (' + formatDuration(d.timeInBed) + ').');
        if (d.sleep < 3 * 60) warnings.push('Sehr kurze Schlafdauer (' + formatDuration(d.sleep) + ').');
      }
    }
    return { ok: errors.length === 0, errors: errors, warnings: warnings };
  }

  // Temperatur in Grad Celsius, optional. Alles außerhalb eines plausiblen
  // Zimmerbereichs gilt als Tippfehler und wird verworfen.
  function cleanTemp(v) {
    if (v === null || v === undefined || v === '') return null;
    var n = Number(typeof v === 'string' ? v.replace(',', '.').trim() : v);
    if (!isFinite(n) || n < -20 || n > 50) return null;
    return Math.round(n * 10) / 10;
  }

  // Bereinigt einen Eintrag auf das Schema (für Import und Speichern)
  function normalizeEntry(raw, activeFactors) {
    if (!raw || typeof raw !== 'object') return null;
    var date = String(raw.date || raw.id || '').slice(0, 10);
    var known = FACTORS.map(function (f) { return f.id; });
    var factors = Array.isArray(raw.factors)
      ? raw.factors.filter(function (f) { return known.indexOf(f) >= 0; })
      : [];
    var e = {
      date: date,
      bed: typeof raw.bed === 'string' ? raw.bed.trim() : '',
      wake: typeof raw.wake === 'string' ? raw.wake.trim() : '',
      latency: Math.max(0, Math.min(600, Math.round(Number(raw.latency) || 0))),
      awake: Math.max(0, Math.min(600, Math.round(Number(raw.awake) || 0))),
      quality: Math.max(1, Math.min(10, Math.round(Number(raw.quality) || 0))),
      tempBed: cleanTemp(raw.tempBed),
      tempWake: cleanTemp(raw.tempWake),
      factors: factors.filter(function (v, i, a) { return a.indexOf(v) === i; }),
      note: typeof raw.note === 'string' ? raw.note.slice(0, 500) : '',
      updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString()
    };
    if (!isFinite(Number(raw.quality))) e.quality = 0; // führt zu Validierungsfehler statt stiller 1
    return e;
  }

  function sortEntries(entries) {
    return entries.slice().sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
  }

  // Nur Einträge ab Startdatum (inklusive), aufsteigend
  function lastNDays(entries, n, todayKey) {
    var from = addDays(todayKey, -(n - 1));
    return sortEntries(entries).filter(function (e) { return e.date >= from && e.date <= todayKey; });
  }

  /* --------------------------------------------------------- Auswertung */

  var MIN_FOR_AVERAGES = 3;
  var MIN_FOR_TREND = 14;
  var MIN_FOR_CORRELATION = 14;
  var MIN_PER_GROUP = 5;

  function summarize(entries, goalMin) {
    var list = sortEntries(entries).map(function (e) {
      var d = derive(e);
      return { date: e.date, quality: e.quality, factors: e.factors || [], bed: e.bed, wake: e.wake, d: d };
    }).filter(function (x) { return x.d; });

    if (!list.length) return { count: 0 };

    var sleeps = list.map(function (x) { return x.d.sleep; });
    var quals = list.map(function (x) { return x.quality; });
    return {
      count: list.length,
      avgSleep: mean(sleeps),
      avgQuality: mean(quals),
      avgEfficiency: mean(list.map(function (x) { return x.d.efficiency; })),
      medianSleep: median(sleeps),
      goalHit: list.filter(function (x) { return x.d.sleep >= goalMin; }).length,
      goalRate: list.filter(function (x) { return x.d.sleep >= goalMin; }).length / list.length,
      debt: list.reduce(function (acc, x) { return acc + (goalMin - x.d.sleep); }, 0),
      bedSd: sdClockTime(list.map(function (x) { return x.bed; })),
      wakeSd: sdClockTime(list.map(function (x) { return x.wake; })),
      meanBed: meanClockTime(list.map(function (x) { return x.bed; })),
      meanWake: meanClockTime(list.map(function (x) { return x.wake; })),
      items: list
    };
  }

  // Vergleicht Nächte mit und ohne einen Faktor
  function factorComparison(entries, factorId) {
    var withF = [], withoutF = [];
    sortEntries(entries).forEach(function (e) {
      var d = derive(e);
      if (!d) return;
      var rec = { sleep: d.sleep, quality: e.quality };
      ((e.factors || []).indexOf(factorId) >= 0 ? withF : withoutF).push(rec);
    });
    var res = {
      id: factorId,
      label: factorLabel(factorId),
      nWith: withF.length,
      nWithout: withoutF.length,
      enough: withF.length >= MIN_PER_GROUP && withoutF.length >= MIN_PER_GROUP
    };
    if (!res.enough) return res;
    // Untergrenzen: Qualität wird in ganzen Punkten erfasst (SD mind. 0,5),
    // Zeiten werden geschätzt (SD mind. 10 Minuten).
    res.quality = welch(withF.map(function (r) { return r.quality; }), withoutF.map(function (r) { return r.quality; }), 0.25);
    res.sleep = welch(withF.map(function (r) { return r.sleep; }), withoutF.map(function (r) { return r.sleep; }), 100);
    return res;
  }

  function rollingAverage(series, window) {
    // series: [{date, value|null}] -> [{date, value|null}] Mittel über die letzten `window` vorhandenen Tage
    var out = [];
    for (var i = 0; i < series.length; i++) {
      var vals = [];
      for (var j = Math.max(0, i - window + 1); j <= i; j++) {
        if (series[j].value !== null && series[j].value !== undefined) vals.push(series[j].value);
      }
      out.push({ date: series[i].date, value: vals.length >= Math.ceil(window / 2) ? mean(vals) : null });
    }
    return out;
  }

  /* -------------------------------------------------------- Erkenntnisse */

  /**
   * Erzeugt Erkenntnisse aus den Daten.
   * Jede Erkenntnis: { kind, tone: 'info'|'good'|'watch', title, text }
   * Grundsatz: lieber nichts sagen als etwas Unbelegtes behaupten.
   */
  function buildInsights(entries, settings, todayKey) {
    var goal = settings.goalMin;
    var out = [];
    var all = sortEntries(entries);
    if (all.length < MIN_FOR_AVERAGES) {
      out.push({
        kind: 'onboarding', tone: 'info',
        title: 'Noch zu wenig Daten',
        text: 'Nach ungefähr 7 Nächten zeigt die App erste Durchschnittswerte, nach 14 Nächten mögliche Zusammenhänge mit deinen Tagesfaktoren. Bisher: ' +
          all.length + ' von 7 Nächten.'
      });
      return out;
    }

    var win = lastNDays(all, 14, todayKey);
    if (win.length < MIN_FOR_AVERAGES) win = all.slice(-14);
    var s = summarize(win, goal);

    // 1. Durchschnitt gegen Ziel
    var diff = s.avgSleep - goal;
    out.push({
      kind: 'average', tone: Math.abs(diff) <= 15 ? 'good' : (diff < 0 ? 'watch' : 'info'),
      title: 'Durchschnitt: ' + formatDuration(s.avgSleep),
      text: 'In ' + s.count + ' erfassten Nächten der letzten 14 Tage hast du im Schnitt ' + formatDuration(s.avgSleep) +
        ' geschlafen. Das sind ' + formatDuration(Math.abs(diff)) + (diff < 0 ? ' weniger' : ' mehr') +
        ' als dein Ziel von ' + formatDuration(goal) + '.'
    });

    // 2. Zielerreichung
    out.push({
      kind: 'goal', tone: s.goalRate >= 0.6 ? 'good' : 'watch',
      title: 'Ziel erreicht an ' + s.goalHit + ' von ' + s.count + ' Nächten',
      text: s.goalRate >= 0.6
        ? 'Du liegst häufiger über als unter deinem Ziel.'
        : 'An ' + (s.count - s.goalHit) + ' Nächten lagst du unter deinem Ziel. Das summiert sich: ' +
          formatDuration(Math.abs(s.debt)) + (s.debt > 0 ? ' Rückstand' : ' Überschuss') + ' in diesem Zeitraum.'
    });

    // 3. Regelmäßigkeit der Schlafenszeit
    if (s.count >= 7 && s.bedSd !== null) {
      if (s.bedSd > 60) {
        out.push({
          kind: 'rhythm', tone: 'watch',
          title: 'Schlafenszeit schwankt stark',
          text: 'Deine Zubettgehzeit liegt im Schnitt bei ' + s.meanBed + ' Uhr, schwankt aber um rund ' +
            Math.round(s.bedSd) + ' Minuten. Ein gleichmäßigerer Rhythmus ist einer der wenigen Punkte, bei denen die Schlafforschung ziemlich einig ist.'
        });
      } else if (s.bedSd <= 30) {
        out.push({
          kind: 'rhythm', tone: 'good',
          title: 'Sehr regelmäßiger Rhythmus',
          text: 'Deine Zubettgehzeit liegt stabil um ' + s.meanBed + ' Uhr (Schwankung rund ' + Math.round(s.bedSd) + ' Minuten).'
        });
      }
    }

    // 4. Schlafeffizienz
    if (s.count >= 7 && s.avgEfficiency < 0.85) {
      out.push({
        kind: 'efficiency', tone: 'watch',
        title: 'Viel Zeit im Bett, weniger Schlaf',
        text: 'Im Schnitt schläfst du ' + Math.round(s.avgEfficiency * 100) + ' % der Zeit, die du im Bett verbringst. ' +
          'Ab etwa 85 % gilt das üblicherweise als unauffällig. Der Rest verteilt sich bei dir auf Einschlafen und nächtliches Wachliegen.'
      });
    }

    // 5. Dauer <-> Qualität
    if (all.length >= MIN_FOR_CORRELATION) {
      var items = summarize(all, goal).items;
      var r = pearson(items.map(function (x) { return x.d.sleep; }), items.map(function (x) { return x.quality; }));
      if (r !== null && Math.abs(r) >= 0.35) {
        out.push({
          kind: 'corr-duration', tone: 'info',
          title: r > 0 ? 'Längere Nächte fühlen sich besser an' : 'Längere Nächte fühlen sich nicht besser an',
          text: (r > 0
            ? 'Über ' + items.length + ' Nächte hinweg bewertest du längere Nächte tendenziell besser. '
            : 'Über ' + items.length + ' Nächte hinweg hängt deine Bewertung kaum an der Dauer – eher an etwas anderem. ') +
            'Das ist ein Muster in deinen Daten, keine bewiesene Ursache.'
        });
      }
    }

    // 6. Faktoren
    var factorInsights = [];
    (settings.factors || DEFAULT_FACTORS).forEach(function (fid) {
      var c = factorComparison(all, fid);
      if (!c.enough || !c.quality) return;
      var qSig = c.quality.p < 0.05 && Math.abs(c.quality.diff) >= 0.8;
      var sSig = c.sleep && c.sleep.p < 0.05 && Math.abs(c.sleep.diff) >= 20;
      if (!qSig && !sSig) return;
      var parts = [];
      if (qSig) parts.push('deine Bewertung im Schnitt ' + Math.abs(c.quality.diff).toFixed(1) +
        ' Punkte ' + (c.quality.diff < 0 ? 'niedriger' : 'höher'));
      if (sSig) parts.push('deine Schlafdauer im Schnitt ' + formatDuration(Math.abs(c.sleep.diff)) +
        ' ' + (c.sleep.diff < 0 ? 'kürzer' : 'länger'));
      var worse = (qSig && c.quality.diff < 0) || (!qSig && sSig && c.sleep.diff < 0);
      factorInsights.push({
        kind: 'factor', tone: worse ? 'watch' : 'good',
        title: worse ? 'Nächte mit „' + c.label + '“ fallen ab' : 'Nächte mit „' + c.label + '“ fallen besser aus',
        text: 'An ' + c.nWith + ' Nächten mit „' + c.label + '“ war ' + parts.join(' und ') +
          ' als an den ' + c.nWithout + ' Nächten ohne. Das kann Zufall sein oder an etwas anderem liegen, ' +
          'das oft gleichzeitig passiert. Beobachte es weiter, bevor du daraus eine Regel machst.',
        strength: Math.abs(qSig ? c.quality.diff : 0)
      });
    });
    factorInsights.sort(function (a, b) { return b.strength - a.strength; });
    out = out.concat(factorInsights.slice(0, 3));

    // 7. Was fehlt noch für weitere Aussagen?
    var pending = [];
    (settings.factors || DEFAULT_FACTORS).forEach(function (fid) {
      var c = factorComparison(all, fid);
      if (!c.enough) pending.push(c.label + ' (' + Math.min(c.nWith, c.nWithout) + '/' + MIN_PER_GROUP + ')');
    });
    if (pending.length) {
      out.push({
        kind: 'pending', tone: 'info',
        title: 'Dafür reichen die Daten noch nicht',
        text: 'Für einen Vergleich braucht es mindestens ' + MIN_PER_GROUP + ' Nächte mit und ' + MIN_PER_GROUP +
          ' Nächte ohne den jeweiligen Faktor. Offen: ' + pending.join(', ') + '.'
      });
    }

    return out;
  }

  /**
   * Höchstens zwei Empfehlungen, nach geschätztem Hebel sortiert.
   */
  function buildRecommendations(entries, settings, todayKey) {
    var goal = settings.goalMin;
    var all = sortEntries(entries);
    if (all.length < 7) return [];
    var win = lastNDays(all, 14, todayKey);
    if (win.length < 5) win = all.slice(-14);
    var s = summarize(win, goal);
    var recs = [];

    var shortfall = goal - s.avgSleep;
    if (shortfall > 20) {
      var shortNights = s.items.filter(function (x) { return x.d.sleep < goal - 30; }).length;
      recs.push({
        kind: 'duration',
        weight: shortfall,
        title: 'Größter Hebel: die Schlafdauer selbst',
        text: 'An ' + shortNights + ' von ' + s.count + ' Nächten lagst du deutlich unter deinem Ziel, im Schnitt fehlen ' +
          formatDuration(shortfall) + '. Rechnerisch müsstest du dafür rund ' + formatDuration(shortfall) +
          ' früher ins Bett – deine Aufstehzeit liegt ziemlich fest bei ' + s.meanWake + ' Uhr. ' +
          'Nimm dir eher 15 Minuten pro Woche vor als alles auf einmal.'
      });
    }

    if (s.bedSd !== null && s.bedSd > 60) {
      recs.push({
        weight: s.bedSd,
        title: 'Feste Zubettgehzeit ausprobieren',
        text: 'Deine Schlafenszeit schwankt um rund ' + Math.round(s.bedSd) + ' Minuten. Such dir ein Fenster von ' +
          'etwa 30 Minuten um ' + s.meanBed + ' Uhr und halte es zwei Wochen durch. Danach zeigt dir die Auswertung, ob sich etwas geändert hat.'
      });
    }

    if (s.avgEfficiency < 0.82 && s.count >= 7) {
      var avgLat = mean(s.items.map(function (x) { return x.d.latency; }));
      var avgAwake = mean(s.items.map(function (x) { return x.d.awake; }));
      recs.push({
        weight: (0.9 - s.avgEfficiency) * 300,
        title: 'Du liegst länger wach, als du denkst',
        text: 'Pro Nacht gehen im Schnitt ' + formatDuration(avgLat) + ' fürs Einschlafen und ' + formatDuration(avgAwake) +
          ' fürs nächtliche Wachliegen weg. Mehr Zeit im Bett hilft dagegen erfahrungsgemäß wenig. ' +
          'Interessanter ist, welche deiner Faktoren an diesen Nächten aktiv waren.'
      });
    }

    (settings.factors || DEFAULT_FACTORS).forEach(function (fid) {
      var c = factorComparison(all, fid);
      if (!c.enough || !c.quality) return;
      if (c.quality.p < 0.05 && c.quality.diff <= -0.8) {
        recs.push({
          weight: Math.abs(c.quality.diff) * 25,
          title: '„' + c.label + '“ beobachten',
          text: 'An Nächten mit „' + c.label + '“ bewertest du deinen Schlaf im Schnitt ' +
            Math.abs(c.quality.diff).toFixed(1) + ' Punkte schlechter (' + c.nWith + ' gegen ' + c.nWithout + ' Nächte). ' +
            'Ein sauberer Test wäre, den Faktor eine oder zwei Wochen bewusst wegzulassen und danach hier wieder nachzusehen.'
        });
      }
    });

    // Die Schlafdauer ist das eigentliche Ziel und steht deshalb immer vorne,
    // falls sie überhaupt ein Thema ist. Danach der stärkste übrige Hebel.
    var primary = recs.filter(function (r) { return r.kind === 'duration'; });
    var rest = recs.filter(function (r) { return r.kind !== 'duration'; })
      .sort(function (a, b) { return b.weight - a.weight; });
    return primary.concat(rest).slice(0, 2);
  }

  /* ------------------------------------------------------ Export/Import */

  function buildExport(entries, settings) {
    return {
      app: 'schlaftagebuch',
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      settings: {
        goalMin: settings.goalMin,
        minMin: settings.minMin,
        defaultBed: settings.defaultBed,
        defaultWake: settings.defaultWake,
        theme: settings.theme,
        factors: settings.factors
      },
      entries: sortEntries(entries)
    };
  }

  function toCsv(entries) {
    var head = ['datum', 'ins_bett', 'aufgestanden', 'einschlafdauer_min', 'wachzeit_min',
      'zeit_im_bett_min', 'schlafdauer_min', 'effizienz_prozent', 'qualitaet',
      'temp_einschlafen_c', 'temp_aufwachen_c', 'faktoren', 'notiz'];
    var rows = sortEntries(entries).map(function (e) {
      var d = derive(e) || { timeInBed: '', sleep: '', efficiency: 0 };
      return [
        e.date, e.bed, e.wake, e.latency, e.awake,
        d.timeInBed, d.sleep, Math.round(d.efficiency * 100), e.quality,
        e.tempBed === null || e.tempBed === undefined ? '' : String(e.tempBed).replace('.', ','),
        e.tempWake === null || e.tempWake === undefined ? '' : String(e.tempWake).replace('.', ','),
        (e.factors || []).join('|'),
        String(e.note || '').replace(/[\r\n]+/g, ' ')
      ];
    });
    return [head].concat(rows).map(function (r) {
      return r.map(function (cell) {
        var s = String(cell === null || cell === undefined ? '' : cell);
        // Trennzeichen ist das Semikolon, deshalb muss ein Komma nicht
        // maskiert werden – wichtig für Dezimalzahlen wie 19,5.
        return /[";\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      }).join(';');
    }).join('\r\n');
  }

  /**
   * Prüft und mischt eine Importdatei.
   * mode: 'keep' (vorhandene behalten) | 'overwrite' (Importdatei gewinnt)
   * Gibt { ok, error, entries, added, updated, skipped, invalid, settings } zurück.
   */
  function parseImport(raw, existing, mode) {
    var data;
    try {
      data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch (err) {
      return { ok: false, error: 'Die Datei ist keine gültige JSON-Datei. Wähle eine Datei, die du vorher hier exportiert hast.' };
    }
    if (!data || typeof data !== 'object') return { ok: false, error: 'Die Datei hat kein erkennbares Format.' };
    var list = Array.isArray(data) ? data : data.entries;
    if (!Array.isArray(list)) return { ok: false, error: 'In der Datei sind keine Einträge enthalten (Feld „entries“ fehlt).' };
    if (data.app && data.app !== 'schlaftagebuch') {
      return { ok: false, error: 'Die Datei stammt aus einer anderen App.' };
    }

    var byDate = {};
    existing.forEach(function (e) { byDate[e.date] = e; });

    var added = 0, updated = 0, skipped = 0, invalid = 0, invalidDates = [];
    list.forEach(function (raw) {
      var e = normalizeEntry(raw);
      if (!e) { invalid++; return; }
      var v = validateEntry(e);
      if (!v.ok) { invalid++; if (invalidDates.length < 5) invalidDates.push(e.date || '?'); return; }
      if (byDate[e.date]) {
        if (mode === 'overwrite') { byDate[e.date] = e; updated++; }
        else skipped++;
      } else {
        byDate[e.date] = e; added++;
      }
    });

    if (added === 0 && updated === 0 && invalid > 0) {
      return { ok: false, error: 'Keiner der ' + invalid + ' Einträge in der Datei war gültig. Die vorhandenen Daten wurden nicht verändert.' };
    }

    var merged = sortEntries(Object.keys(byDate).map(function (k) { return byDate[k]; }));
    var settings = null;
    if (data.settings && typeof data.settings === 'object') {
      settings = {};
      if (isFinite(Number(data.settings.goalMin))) settings.goalMin = Math.max(180, Math.min(720, Math.round(Number(data.settings.goalMin))));
      if (isFinite(Number(data.settings.minMin))) settings.minMin = Math.max(120, Math.min(720, Math.round(Number(data.settings.minMin))));
      if (toMin(data.settings.defaultBed) !== null) settings.defaultBed = data.settings.defaultBed;
      if (toMin(data.settings.defaultWake) !== null) settings.defaultWake = data.settings.defaultWake;
      if (settings.minMin && settings.goalMin && settings.minMin > settings.goalMin) settings.minMin = settings.goalMin;
      if (['auto', 'light', 'dark'].indexOf(data.settings.theme) >= 0) settings.theme = data.settings.theme;
      if (Array.isArray(data.settings.factors)) {
        var known = FACTORS.map(function (f) { return f.id; });
        settings.factors = data.settings.factors.filter(function (f) { return known.indexOf(f) >= 0; });
        if (!settings.factors.length) delete settings.factors;
      }
    }

    return {
      ok: true, entries: merged, added: added, updated: updated,
      skipped: skipped, invalid: invalid, invalidDates: invalidDates, settings: settings
    };
  }

  return {
    DAY: DAY,
    LATENCY_OPTIONS: LATENCY_OPTIONS,
    AWAKE_OPTIONS: AWAKE_OPTIONS,
    FACTORS: FACTORS,
    DEFAULT_FACTORS: DEFAULT_FACTORS,
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    MIN_FOR_AVERAGES: MIN_FOR_AVERAGES,
    MIN_FOR_TREND: MIN_FOR_TREND,
    MIN_FOR_CORRELATION: MIN_FOR_CORRELATION,
    MIN_PER_GROUP: MIN_PER_GROUP,
    toMin: toMin, fromMin: fromMin, durationBetween: durationBetween,
    toNightAxis: toNightAxis, fromNightAxis: fromNightAxis,
    meanClockTime: meanClockTime, sdClockTime: sdClockTime,
    formatDuration: formatDuration,
    dateKey: dateKey, parseKey: parseKey, isValidKey: isValidKey, addDays: addDays,
    daysBetween: daysBetween, dateRange: dateRange, formatDate: formatDate,
    weekdayIndex: weekdayIndex, isWeekendMorning: isWeekendMorning,
    isWeekendNight: isWeekendNight, lastNightKey: lastNightKey, sleepStatus: sleepStatus,
    WEEKDAYS: WEEKDAYS,
    mean: mean, median: median, sd: sd, pearson: pearson, welch: welch, normCdf: normCdf,
    derive: derive, validateEntry: validateEntry, normalizeEntry: normalizeEntry,
    sortEntries: sortEntries, lastNDays: lastNDays, summarize: summarize,
    factorComparison: factorComparison, rollingAverage: rollingAverage,
    nearestOption: nearestOption, factorLabel: factorLabel, cleanTemp: cleanTemp,
    buildInsights: buildInsights, buildRecommendations: buildRecommendations,
    buildExport: buildExport, toCsv: toCsv, parseImport: parseImport
  };
});
