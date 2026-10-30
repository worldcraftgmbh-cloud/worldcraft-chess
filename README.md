# ♚ Worldcraft Chess — Vollständige Browserbasierte Online-Schachplattform

Eine modulare, hochperformante Schachplattform von Grund auf implementiert mit **HTML5 Canvas**, modernem **JavaScript**, vollständigem **FIDE-Regelwerk ohne externe Bibliotheken**, eigenständigem **Reinforcement Learning KI-Worker** und einem **Echtzeit-Multiplayer-Server mit gestaffelter ELO-Rangliste**.

---

## 🎨 1. Visuelles Design & HTML5 Canvas

Das Brett repliziert die Vorlage detailgetreu:
- **Edler dunkelbrauner / schwarzer Holzaußenrahmen**: Matte Wenge-/Ebenholz-Textur mit abgerundeten Ecken, Tiefenschatten und feiner Holzmaserung.
- **Helle, gestrichelte Umrandungslinie (Intarsien-Marqueterie)**: Direkt um das 8×8-Spielfeld verläuft die charakteristische gestrichelte Kante aus hellem Ahornholz im Wechsel mit dunklen Fugen sowie massiven Eckblöcken.
- **8×8 Spielfelder mit subtiler Maserung**:
  - *Helle Felder*: Warmes, cremiges Riegel-Ahorn (*Tiger Maple / Fiddleback*) mit horizontaler Wellenstruktur und zarten Tonverläufen (`#F0E5D0` bis `#E7D6B9`).
  - *Dunkle Felder*: Tiefes geräuchertes Ebenholz / Wenge (`#221B18` bis `#120E0D`) mit feinen Holzporen.
- **Dezente Randkoordinaten**: A–H waagerecht und 1–8 senkrecht in cremefarbenem Goldton harmonisch im Holzrand integriert.
- **Responsives HiDPI Canvas**: Scharfe Darstellung auf allen Geräten via automatischer `devicePixelRatio`-Skalierung (Basisauflösung 800×800 px).
- **Vektorbasierte Staunton-Figuren**: Knackig scharfe SVG-Vektoren für alle 6 Figuren mit 3D-Lichtreflexen, Randlichtern und Schattenwurf.
- **Interaktion**: Volle Unterstützung für **Drag-and-Drop** (inkl. Schwebeschatten) sowie **Click-to-Move** auf Desktop und Touch-Geräten.
- **Visuelle Highlights**:
  - Ausgewähltes Feld: Gold-gelber Glührahmen.
  - Gültige Zielfelder: Grüne Zentrums-Punkte für Ruhezüge, rote Zielringe für Schlagzüge.
  - Letzter Zug: Warmer Bernsteinton auf Start- und Zielfeld.
  - König im Schach: Strahlender roter Puls-Effekt.

---

## ♟ 2. Spiellogik & FIDE-Regelwerk (`public/engine/chess.js`)

Eigenständige FIDE-Engine ohne Drittanbieter-Bibliotheken:
- **Zugvalidierung aller 6 Figuren**:
  - Bauer (1 Schritt, Doppelschritt vom Startfeld, Diagonalschlag, En-Passant, Umwandlung).
  - Springer (L-Sprünge).
  - Läufer, Turm, Dame (Strahlensuche in alle 8 Richtungen).
  - König (1 Feld in alle Richtungen + Rochaden).
- **Sonderregeln**:
  - *Rochade (kurz & lang)*: Prüft unbewegte Figuren, freie Zwischenfelder, aktuelles Schach sowie Überquerung/Ziel auf bedrohte Felder.
  - *En-Passant*: Schlagrecht im unmittelbaren Folgezug nach gegnerischem Bauern-Doppelschritt.
  - *Bauernumwandlung*: Pop-Up-Auswahl für Dame, Turm, Läufer oder Springer bei Erreichen der 8. bzw. 1. Reihe.
- **Partieende-Erkennung**:
  - Schachmatt & Schach-Status.
  - Patt (Stalemate): Keine legalen Züge und König nicht im Schach.
  - 50-Züge-Regel: 100 Halbzüge ohne Bauernzug oder Schlagen.
  - Dreifache Stellungswiederholung (Threefold Repetition) über Zustandshashes.
  - Unzureichendes Material (K vs. K, K+B vs. K, K+N vs. K, K+B vs. K+B gleichfarbige Läufer).
- **Notation**: Standard Algebraic Notation (SAN wie `Nf3`, `exd5`, `O-O`, `Qxf7#`), FEN-Generierung und PGN-Export.

---

## 🤖 3. Globales KI-Lernen & Firebase Firestore (`public/firebase/firebaseService.js`)

- **Globale Schwarm-Intelligenz über Firestore**:
  - **Startzustand**: Die Royale KI Engine beginnt komplett untrainiert („rotzedoof“) und wählt bei unbekannten Stellungen rein zufällige legale Züge.
  - **Echtzeit-Stellungsabfrage**: Vor jedem KI-Zug wird die aktuelle Stellung in Firestore abgefragt:
    - *Bekannte Stellung*: Die KI bevorzugt den Zug mit der höchsten positiven Wertung.
    - *Unbekannte Stellung*: Die KI zieht einen zufälligen legalen Zug.
  - **Automatisches Belohnungslernen nach Spielende**:
    - Alle Züge der Siegerseite erhalten einen Bonus (`+1.0`).
    - Alle Züge der Verliererseite erhalten einen Abzug (`-1.0`).
    - Die Werte werden atomar über `FieldValue.increment` in Firestore akkumuliert.
- **Firestore-Struktur**:
  - `ai_knowledge/global_stats`: `total_games`, `ai_wins`, `player_wins`, `draws`, `total_positions`.
  - `ai_knowledge/global_stats/positions/{fenKey}`: Dokumente mit FEN-ID und `moves` (Map aus UCI-Zügen und Scores).
- **Live UI-Synchronisation**:
  - Live-Anzeige im Header: *Globale Partien* und *Weltweit trainierte Stellungen* über reaktiven `onSnapshot`-Listener.
- **Firebase Hosting optimiert**:
  - Vollständiges statisches Bundle im `public/`-Verzeichnis mit konfigurierter `firebase.json` und `.firebaserc`.

---

## 🌐 4. Multiplayer & Regionales ELO-System (`server/`)

- **Echtzeit WebSocket-Server**:
  - Autoritative serverseitige FIDE-Zugverifikation.
  - Schachuhren (Blitz 3+2, Rapid 10+0, Klassisch) mit automatischer Zeitabnahme und Timeout-Erkennung.
  - Private Spielräume mit 6-stelligem Raum-Code sowie öffentliches schnelles Matchmaking.
- **FIDE ELO-Ratingsystem (`server/elo.js`)**:
  - Standardisierte logistische FIDE-Erwartungswert-Kurve:
    $$E_A = \frac{1}{1 + 10^{(R_B - R_A)/400}}$$
  - Gestaffelte $K$-Faktoren ($K=40$ für Neulinge, $K=20$ für Standard, $K=10$ für Meister).
  - **Regionale Ranglisten**: Filterbar nach *International / Global*, *Deutschland* und einzelnen *Bundesländern* (Bayern, NRW, Baden-Württemberg, Berlin, Hessen, Hamburg, Sachsen, etc.).
- **Prozedurale Holzakustik (`public/audio/soundManager.js`)**:
  - Web Audio API Synthesizer für haptische Holzklänge: Zug, Schlagen, Schach, Rochade, Spielende – ohne externe Sounddateien.

---

## 🚀 Installation & Start

### Voraussetzungen
- Node.js (v18+)

### 1. Server starten
```bash
npm start
```
Die Plattform ist nun erreichbar unter:
👉 **http://localhost:3000**

### 2. Tests ausführen
Automatisierte Unit-Tests für FIDE-Regeln, Schachmatt, Patt, 50-Züge-Regel, Wiederholung und KI:
```bash
npm test
```
