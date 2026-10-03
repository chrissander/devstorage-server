# Fertigkriterien und manuelle Prüfung

## Ohne Installation und ohne API

Das ausführende LLM kann die folgenden ungefährlichen Prüfungen durchführen:

```bash
node scripts/check-syntax.js
node src/cli.js --help
node src/cli.js workspace init
node src/cli.js unknown command
```

Erwartung: Syntaxprüfung und Hilfe enden mit 0. Die beiden anderen Aufrufe
enden mit 1 und einer verständlichen Meldung. Keiner benötigt `.env`, S3,
Zugangsdaten oder einen laufenden Server. Syntaxprüfungen sind keine funktionale
Abnahme der API-Kommandos.

Zusätzlich durch Codeinspektion prüfen:

- Keine Imports außerhalb des neuen Pakets und keine Server-/SDK-Abhängigkeiten.
- Alle in `PLAN.md` aufgeführten Kommandos und Optionen sind vorhanden.
- `.env` wird aus dem Arbeitsverzeichnis geladen; gesetzte Variablen behalten
  Vorrang. Fehlende `.env` ist erlaubt, fehlende Pflichtvariablen bei API-Aufrufen
  führen zu einer klaren Fehlermeldung.
- Fehlerausgaben enthalten keine Authorization-Header oder Konfigurationsdumps.
- Bestehende Pfadprüfungen, ETag-Behandlung und Pull-Wiederherstellung bleiben erhalten.
- `bin` zeigt auf eine vorhandene Datei mit Shebang und ausführbarem Dateibit.
- Paketdateiliste schließt Referenzen und Geheimnisse aus.

## Paketprüfung durch den Betreiber

Vor Veröffentlichung den endgültigen Paketnamen und die Release-Metadaten
festlegen. Mit `npm pack --dry-run` die tatsächliche Dateiliste kontrollieren.
Anschließend mit `npm pack` ein lokales Tarball erzeugen und dieses in einem
separaten Consumer-Projekt installieren:

```bash
npm install --save-dev /absoluter/pfad/zum/erzeugten-paket.tgz
npx dev-storage --help
```

Diese Installation führt der Betreiber aus. Der Pfad ist ein Platzhalter.
Prüfen, dass die CLI ohne Serverquellen im Consumer-Projekt funktioniert und
relative Pfade dessen Arbeitsverzeichnis verwenden. WSL ist die primäre
Zielumgebung; native Windows-Unterstützung erst nach entsprechender Prüfung
als verifiziert bezeichnen.

## Manuelle API-Abnahme in einem separaten Testprojekt

Nur nach bewusster Bereitstellung einer Test-API und ihrer Zugangsdaten durch
den Betreiber durchführen. Die Schritte mutieren Daten und teilweise Tokens;
keine vorhandenen Produktivprojekte verwenden.

| Szenario | Erwartung |
| --- | --- |
| Projekte auflisten und neues Testprojekt anlegen | JSON-Antworten gemäß Vertrag |
| Textdatei und Binärdatei anlegen, lesen, ändern, löschen | Bytes bleiben unverändert; Mutationen verwenden die vorgesehenen ETags |
| Datei unter `pages/home.json` verwenden | Unterordner funktionieren durch kodierte Remote-Pfade |
| Passendes `pages/home.schema.json` anlegen | Schema-Routen und serverseitige Validierung greifen |
| Snapshot aus eigenem Datenordner pushen und in anderen Ordner pullen | Vollständiger Bestand einschließlich Schemas und Binärdateien |
| Leeren Bestand synchronisieren | Ziel wird gemäß bestehender Ersatzsemantik geleert |
| Ungültigen Pfad, Symlink oder übergroßes Paket verwenden | Verständlicher Fehler; kein unzulässiger Upload |
| Pull auf Arbeitsverzeichnis oder dessen Eltern anfordern | Lokaler Schutz lehnt den Austausch ab |
| Vorhandene Pull-Sperre vorfinden | Abbruch mit Hinweis zur Prüfung von laufendem Pull/Backup |
| Ungültigen Token oder nicht erreichbare API verwenden | Fehler ohne Credential-Ausgabe, Exit-Code 1 |
| Veraltete Revision bei Mutation verwenden | Konflikt bleibt sichtbar, kein automatisches Überschreiben |
| Projekt ohne passende Löschbestätigung löschen wollen | Abbruch; nicht interaktiv ist `--confirm` nötig |
| Projekt-Token beziehungsweise Admin-Token bewusst rotieren | Neuer Token wird ausgegeben und muss danach übernommen werden |

Admin-Rotation betrifft den gesamten Test-Workspace und erfolgt nur als
gesonderter, bewusster Schritt. Nach einem unklaren Request-Ergebnis zunächst
den Zustand prüfen; nicht automatisch wiederholen.

## Übergabebericht

Der Bericht nennt umgesetzte Dateien, tatsächlich durchgeführte Prüfungen,
ausstehende Consumer-/Live-Prüfungen und die noch offenen Release-Entscheidungen.
Ohne Registry-Release nicht behaupten, das Paket sei bereits per Paketname
installierbar. Ohne Live-Abnahme keine vollständige Serverkompatibilität zusagen.
