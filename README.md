# Schlaftagebuch

Ein persönliches Schlaftagebuch als installierbare Web-App (PWA). Alle Daten
bleiben auf deinem Handy. Kein Konto, kein Server, keine Werbung, offline nutzbar.

---

## Teil 1 – App aufs Handy bringen

Die App besteht aus ein paar Dateien, die einmal ins Netz gestellt werden müssen.
Das klingt nach mehr, als es ist: rund fünf Minuten, einmalig, kostenlos.
Danach hast du eine feste Adresse, die nur du kennst.

Warum überhaupt online? Android-Browser erlauben das Ablegen auf dem
Startbildschirm und den Offline-Modus nur für Seiten mit `https://`. Eine
Datei, die direkt auf dem Handy liegt, kann das nicht. **Nach der Installation
läuft die App trotzdem komplett offline** – die Adresse wird nur zum ersten
Laden und für spätere Updates gebraucht.

### Schritt 1 – GitHub-Konto anlegen

Am Computer (geht auch am Handy, ist aber fummeliger):

1. [github.com](https://github.com) öffnen, **Sign up**, E-Mail und Passwort eingeben.
2. Konto per E-Mail bestätigen.

### Schritt 2 – Ablage („Repository“) anlegen

1. Oben rechts auf **+** → **New repository**.
2. **Repository name:** `schlaftagebuch`
3. **Public** auswählen. (Wichtig: Bei einem kostenlosen Konto funktioniert die
   Veröffentlichung nur mit „Public“. Es sind nur die Programmdateien
   öffentlich, **niemals deine Schlafdaten** – die liegen ausschließlich auf
   deinem Handy und werden nie hochgeladen.)
4. **Create repository**.

### Schritt 3 – Dateien hochladen

1. Auf der Seite der neuen Ablage: **uploading an existing file** anklicken
   (oder **Add file** → **Upload files**).
2. Das ZIP auf dem Computer entpacken. Du siehst dann diese Dateien und den
   Ordner `icons`:

   ```
   index.html
   styles.css
   core.js
   app.js
   sw.js
   manifest.webmanifest
   icons/
   ```

3. **Alle davon** in das Browserfenster ziehen – auch den Ordner `icons`.
   Wichtig: Die Dateien müssen direkt oben liegen, nicht in einem Unterordner
   namens `schlaftagebuch`. Wenn du den ganzen entpackten Ordner ziehst,
   landen sie eine Ebene zu tief. Dann lieber den Ordner öffnen und den
   *Inhalt* markieren und ziehen.
4. Unten auf **Commit changes**.

### Schritt 4 – Veröffentlichen

1. Oben in der Ablage auf **Settings**.
2. Links in der Seitenleiste auf **Pages**.
3. Unter „Build and deployment“ → „Source“: **Deploy from a branch** auswählen.
4. Darunter bei „Branch“: **main** wählen, Ordner auf **/ (root)** lassen,
   **Save** drücken.
5. Ein bis zwei Minuten warten, dann die Seite neu laden. Oben erscheint die
   Adresse deiner App:

   ```
   https://DEIN-BENUTZERNAME.github.io/schlaftagebuch/
   ```

Diese Adresse ist ab jetzt deine App.

### Schritt 5 – Auf den Startbildschirm des Galaxy A55

1. **Chrome** auf dem Handy öffnen (nicht den Samsung Internet Browser – Chrome
   installiert PWAs sauberer).
2. Die Adresse von oben eingeben und die Seite laden.
3. Oben rechts auf die **drei Punkte**.
4. **App installieren** antippen. Falls dieser Punkt fehlt: **Zum
   Startbildschirm hinzufügen** → **Installieren**.
5. Bestätigen.

Auf dem Startbildschirm liegt jetzt ein Icon mit Mond und Balken. Beim Antippen
startet die App im Vollbild, ohne Browserleiste – wie eine normale App.

**Kurz danach einmal den Flugmodus einschalten und die App öffnen.** Wenn sie
normal startet, hat der Offline-Modus funktioniert und du bist fertig.

---

## Teil 2 – Tägliche Bedienung

### Wie eine Nacht datiert wird

Eine Nacht trägt immer das Datum des **Abends**, an dem du ins Bett gehst.
Die Nacht von Montag auf Dienstag heißt also „Montag, 7. September“.

Daraus folgt: Die letzte eintragbare Nacht ist immer **gestern**. Die Nacht von
heute Abend kommt erst noch – für sie gibt es die Vormerkung (siehe unten).

Der Tageswechsel der App liegt bei **03:00 Uhr**, nicht um Mitternacht. Wenn du
um halb zwei nachts noch am Handy bist, gilt der Vorabend weiter und die
laufende Nacht ist noch die kommende. Erst ab drei Uhr rückt alles einen Tag
weiter.

### Morgens (30–60 Sekunden)

Icon antippen. Oben steht die letzte Nacht, die Felder sind vorbelegt:

- **Ins Bett** und **Aufgestanden** stehen auf deiner Vorauswahl (ab Werk 22:30
  und 06:05, unter **Einstellungen** änderbar).
- **Einschlafzeit** und **Wachzeit** stehen auf dem ersten Knopf.
- Was du am Vorabend vorgemerkt hast, steht bereits da.

Also meistens: Zeiten mit **−/+** in 5-Minuten-Schritten korrigieren, die
Qualität am Schieber einstellen, antippen was war, **Nacht speichern**. Für
größere Sprünge auf die Uhrzeit tippen – dann öffnet der Time Picker von Android.

Der Kopf zeigt drei Zeilen: eine kleine Einordnung (**Kommende Nacht**,
**Letzte Nacht** oder **Frühere Nacht**), darunter Wochentag und Datum des
Abends, darunter die volle Zeitspanne der Nacht. Wochentag und Datum haben
feste Breiten, deshalb bleibt beim Blättern alles an seinem Platz.

Solange für eine Nacht nichts erfasst und nichts geändert ist, steht dort
**„Keine Daten vorhanden“** – ohne Zahl und ohne Balken. Sobald du das erste
Feld anfasst, erscheinen Schlafdauer und Balken, und unten kommt der Knopf
**Daten speichern**. Ohne Änderung gibt es keinen Knopf und nichts zu speichern.
Nach dem Speichern bleibst du auf der Seite.

Der Balken zeigt ausschließlich die **geschlafene Zeit** – Einschlafzeit und
nächtliches Wachliegen sind bewusst nicht darin. Sonst wäre die Achse eine
Mischung aus Uhrzeit und Dauer und stimmte an keiner Stelle. Darunter läuft
eine Stundenskala, damit die zwei senkrechten Striche einzuordnen sind: sie
markieren dein Minimum und dein Ziel. Die Skala reicht immer bis über das Ziel
hinaus, deshalb sind beide Striche auch nach einer kurzen Nacht sichtbar und
die Balken verschiedener Nächte sind vergleichbar. Der Balken wird **grün** ab
dem Ziel, **rot** unter dem Minimum und sonst **gelb**.

**Einschlafzeit** und **Wachzeit** haben drei Knöpfe und eine freie Eingabe.
Der eingestellte Wert wird exakt von der Zeit im Bett abgezogen – 42 Minuten
sind 42 Minuten.

**Zimmertemperatur** stellst du wie die Uhrzeiten mit **−/+** ein, hier in
Schritten von 0,1 °C. Direktes Eintippen geht auch. Wenn du keinen Wert hast,
setz das Häkchen bei **nicht bekannt** – dann bleiben beide Felder leer und
gesperrt. Hast du schon einmal eine Temperatur erfasst, schlägt die App beim
nächsten Mal den zuletzt gemessenen Wert vor.

### Abends vormerken

Tipp auf den Pfeil **›**. Dort steht „Kommende Nacht“. Du kannst schon
eintragen, wann du ins Bett gehst, wie warm es im Zimmer ist, was heute war und
eine Notiz. Morgen früh steht das alles fertig da und du ergänzt nur noch
Aufstehzeit, Einschlafzeit, Wachzeit und Bewertung.

Eine Vormerkung ist noch kein Eintrag – sie taucht in keiner Statistik auf und
verschwindet, sobald du die Nacht richtig speicherst.

### Zu einem bestimmten Datum springen

Das **Kalendersymbol** links oben öffnet die Datumsauswahl. Weiter als bis zur
kommenden Nacht geht es nicht. Mit **‹ ›** kommst du Nacht für Nacht durch.
Eine bereits gespeicherte Nacht lässt sich dort öffnen, ändern und löschen.

### Die drei Bereiche

| Bereich | Wofür |
|---|---|
| **Nacht** | Eintrag der letzten Nacht, Vormerkung für die kommende, Kalendersprung. |
| **Auswertung** | Zwei Diagramme, Kennzahlen zum gewählten Zeitraum, Erkenntnisse, Empfehlungen. |
| **Einstellungen** | Ziel und Minimum, Vorauswahl der Uhrzeiten, besondere Faktoren, Hell/Dunkel, Sicherung. |

Die Zurück-Taste des Handys springt zwischen den Bereichen zurück.

### Ziel und Minimum

Unter **Einstellungen → Schlafziel** stellst du zwei Werte ein:

- **Zielschlafdauer** – ab hier ist eine Nacht grün (Standard 7:30 h).
- **Minimum** – darunter ist eine Nacht rot (Standard 6:30 h).

Dazwischen ist gelb. Diese Ampel gilt im Balken auf der Startseite, in den
Kennzahlen und in den Balken des Diagramms.

### Die Diagramme

Ganz oben in der Auswertung stehen zwei Diagramme. Der gewählte Zeitraum –
**5, 10, 20, 30, 60 oder 90 Tage** – gilt für alles auf der Seite: für beide
Diagramme, für den Kennzahlenblock und für die Texte darunter. Wer die letzte
Woche betrachten will, stellt auf 5 oder 10 Tage; wer ein Muster sucht, auf 60
oder 90.

- **Schlafdauer** – ein Balken pro Nacht in der Ampelfarbe, gestrichelte Linie
  für das Ziel, gepunktete für das Minimum, dazu der 5-Tages-Schnitt. Für den
  Schnitt werden auch Nächte vor dem sichtbaren Bereich herangezogen, damit die
  Linie schon am linken Rand beginnt.
- **Schlafqualität** – Bewertung pro Nacht und 5-Tages-Schnitt.

Tippe auf einen Balken, dann erscheinen die Details dieser Nacht unter dem
Diagramm.

Darunter folgt **ein** Kennzahlenblock mit den Durchschnitten für Schlafdauer,
Schlafqualität, Einschlafzeit und Wachzeit sowie dem Anteil erreichter
Zielnächte und der Zahl erfasster Nächte. Danach die Texte: was in den Daten
steht, wo du ansetzen könntest, der Faktorvergleich und das Streudiagramm.

Kurze Zeiträume liefern zwangsläufig weniger Aussagen. Bei 5 Tagen sagt die App
zu einzelnen Faktoren nichts – dafür braucht sie mindestens fünf Nächte mit und
fünf ohne den jeweiligen Faktor.

### Besondere Faktoren

Unter **Einstellungen → Besondere Faktoren** bestimmst du, was beim Eintrag zur
Auswahl steht. Zehn Faktoren sind vorbereitet, sechs davon angehakt.

- **Anhaken** blendet einen Faktor im Eintrag ein, das Häkchen wegnehmen blendet
  ihn aus. Bereits erfasste Nächte behalten ihn trotzdem.
- **Umbenennen**: einfach in das Namensfeld tippen. Intern arbeitet die App mit
  einer unveränderlichen Kennung, deshalb bleiben alte Nächte richtig zugeordnet
  – aus „Alkohol“ kann jederzeit „Wein am Abend“ werden.
- **Neu anlegen**: Name unten eintippen, **Hinzufügen**. Möglich sind bis zu 20
  Faktoren, alle davon dürfen gleichzeitig aktiv sein.
- **Umsortieren**: am Griff links ziehen. Die Reihenfolge gilt auch für die
  Chips im Eintrag. Wer lieber tippt: Griff antippen und die Pfeiltasten
  benutzen.
- **Löschen** geht nur bei Faktoren, die in keiner gespeicherten Nacht
  vorkommen. Sonst würden dir Daten unter den Füßen weggezogen; solche Faktoren
  lassen sich stattdessen ausblenden.

### Ab wann sagt die App etwas?

- **3 Nächte** – Durchschnitte erscheinen.
- **7 Nächte** – Regelmäßigkeit der Schlafenszeit, Effizienz, erste Empfehlungen.
- **14 Nächte** – Zusammenhang zwischen Dauer und Qualität, Trendvergleich.
- **5 Nächte mit + 5 Nächte ohne einen Faktor** – erst dann wird dieser Faktor
  überhaupt bewertet.

Vorher steht dort ausdrücklich, was noch fehlt. Die App erfindet nichts.

---

## Teil 3 – Wo deine Daten liegen

Im lokalen Speicher von Chrome, ausschließlich auf diesem Handy. Nichts wird
hochgeladen, es gibt keinen Server, der sie kennt.

**Damit gehen sie verloren, wenn:**

- du in Chrome die Browserdaten oder die Website-Daten für diese Adresse löschst,
- du die App deinstallierst und dabei die Daten mit entfernst,
- das Handy verloren geht oder zurückgesetzt wird.

Deshalb der nächste Abschnitt.

---

## Teil 4 – Backup

**Einstellungen → Daten als JSON sichern.** Die Datei landet im Download-Ordner und heißt
zum Beispiel `schlaftagebuch-20260908.json`. Sie enthält alle Nächte, dein Ziel
und deine Faktoren.

Schieb sie irgendwohin, wo sie sicher liegt: Google Drive, E-Mail an dich
selbst, USB-Stick. Einmal im Monat reicht völlig.

**Daten als CSV exportieren** ist nur zum Anschauen in Excel oder Google
Tabellen gedacht. CSV lässt sich nicht zurücklesen – für Backups immer JSON.

### Sicherung zurückspielen

**Einstellungen → Sicherung einlesen** → Datei auswählen. Die App zeigt zuerst, was
passieren würde, und fragt dann:

- **Nur fehlende Nächte ergänzen** – vorhandene Einträge bleiben unangetastet.
  Das ist der sichere Normalfall, doppelte Nächte kann es dabei nicht geben.
- **Vorhandene Nächte überschreiben** – die Datei gewinnt bei Konflikten.

Falsch entschieden? **Einstellungen → Letzten Import rückgängig machen** stellt den Stand
davor wieder her. Kaputte oder fremde Dateien werden abgewiesen, ohne deine
Daten anzufassen.

---

## Teil 5 – Umzug auf ein neues Handy

1. Auf dem alten Handy: **Einstellungen → Daten als JSON sichern**.
2. Die Datei aufs neue Handy bringen (Drive, E-Mail, Kabel – egal wie).
3. Auf dem neuen Handy dieselbe Adresse in Chrome öffnen und wie in Schritt 5
   installieren.
4. **Einstellungen → Sicherung einlesen** → die Datei auswählen → **Nur fehlende Nächte
   ergänzen**.

Fertig. Ziel und Faktoren kommen mit.

---

## Teil 6 – Updates

Falls du später etwas an den Dateien änderst oder eine neue Fassung bekommst:

1. Die geänderten Dateien bei GitHub hochladen (**Add file → Upload files**,
   gleiche Dateinamen, **Commit changes**).
2. **Wichtig:** In `sw.js` die Versionsnummer erhöhen, also
   `schlaftagebuch-v5` zu `schlaftagebuch-v6`. Ohne das behält das Handy die
   alten Dateien aus dem Offline-Speicher.
3. App auf dem Handy schließen und zweimal öffnen. Beim ersten Start lädt die
   neue Fassung im Hintergrund, beim zweiten ist sie aktiv.

Deine Einträge bleiben dabei erhalten – sie liegen getrennt vom Programmcode.
Vor größeren Änderungen trotzdem kurz ein JSON-Backup ziehen.

---

## Teil 7 – Wenn etwas nicht klappt

**„App installieren“ fehlt im Chrome-Menü**
Die Seite muss über `https://…github.io/…` geladen sein, nicht über eine
Datei-Adresse. Seite einmal neu laden und ein paar Sekunden warten – Chrome
prüft erst das Manifest.

**404-Fehler beim Aufrufen der Adresse**
Meistens liegt `index.html` einen Ordner zu tief. In der GitHub-Ablage
nachsehen: `index.html` muss direkt in der obersten Ebene stehen, nicht in
einem Unterordner.

**Offline erscheint eine Fehlerseite**
Die App einmal online öffnen und ein paar Sekunden offen lassen, damit der
Offline-Speicher gefüllt wird. Danach erneut im Flugmodus testen.

**„Speichern fehlgeschlagen“**
Chrome läuft im Inkognito-Modus oder der Speicher ist gesperrt. Die App im
normalen Chrome-Fenster beziehungsweise über das Startbildschirm-Icon öffnen.

---

## Für den Fall, dass es dich interessiert: was drin ist

| Datei | Inhalt |
|---|---|
| `index.html` | Aufbau der vier Ansichten |
| `styles.css` | Gestaltung, Hell- und Dunkelmodus |
| `core.js` | Alle Berechnungen: Zeiten, Statistik, Erkenntnisse, Import/Export |
| `app.js` | Bedienung, Diagramme, Speicherung |
| `sw.js` | Offline-Betrieb |
| `manifest.webmanifest` | Name, Icon, Vollbild |
| `tools/` | Testprogramme, wird auf dem Handy nicht gebraucht |

Es gibt zwei Ablagen im Browserspeicher: `schlaftagebuch.entries.v1` mit allen
Nächten und `schlaftagebuch.planned.v1` mit der Vormerkung für die kommende
Nacht. Die Vormerkung ist bewusst getrennt, damit sie keine Statistik verfälscht.

Die Rechenlogik in `core.js` ist bewusst vom Rest getrennt und mit 167
automatischen Tests abgedeckt (`node tools/test-core.js`), die Oberfläche mit
weiteren 264 (`node tools/test-ui.js`, benötigt `npm install jsdom`).

Die Hinweise in der Auswertung beschreiben Muster in deinen eigenen Zahlen. Sie
sind keine Diagnose und ersetzen keine ärztliche Beratung. Bei anhaltenden
Schlafproblemen ist der Weg zum Arzt der bessere.
