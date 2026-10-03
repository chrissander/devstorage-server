# Manuelle Abnahme

Es wird keine Testsuite angelegt. Echte S3-Prüfungen ausschließlich mit eigens
angelegten Projekten durchführen. Die folgenden Szenarien beschreiben die
Abnahme der API und CLI; [Vertrag](../doc.md), [Anleitung](../../README.md).

| Szenario | Erwartetes Ergebnis |
| --- | --- |
| Initialisierung | Erstaufruf erzeugt Admin-Token, Wiederholung meldet „bereits initialisiert“ ohne Token-Ausgabe. Ungültige Konfiguration wird nicht überschrieben. |
| Projektverwaltung | Anlage `201`, doppelte ID `409`, alphabetische Liste ohne Tokens. Rotation akzeptiert nur Admin, alter Token danach `401`. |
| Rechte | Fehlender/falscher Token `401`, gültiger Token für anderes Projekt oder Admin-Funktion `403`. Datei-CRUD und Snapshots sind mit passendem Projekt-Token möglich. |
| JSON-Werte | Objekt, Array, String, Zahl, Boolean und `null` bleiben gültige Inhalte. Legacy-Create mit `content` funktioniert; direkte Bytes und Base64 erhalten auch Formatierung exakt. |
| Binärdateien | Bytes einschließlich `0x00`, `0xff`, Zeilenumbrüchen und ungültigem UTF-8 werden bei Nicht-JSON-Dateien bytegetreu gespeichert und gelesen. Leere Dateien sind möglich. |
| Content-Type | JSON, Markdown, Bilder und PDF werden passend ausgeliefert; unbekannte Endungen als `application/octet-stream`. |
| Create-Varianten | Genau `content` oder `dataBase64` für Inhalte, genau `schema` oder `dataBase64` für Schemas. Beide Varianten zugleich, fehlerhaftes Base64 und explizite Schema-Zuordnung beim Inhaltsupload: `400`. |
| Pfade | Unterordner entstehen automatisch. Lesen/Schreiben funktioniert mit vollständig kodierten Pfaden und lesbaren Unterordner-URLs. Absolute Pfade, Backslashes, leere Segmente und `..` werden abgelehnt. |
| Namensraum | Derselbe Pfad und Datei-/Ordnerkonflikte ergeben `409`; gleichnamige Dateien in verschiedenen Ordnern sind unabhängig. Dateien ohne Endung funktionieren. |
| Schema-Paarung | `pages/home.schema.json` gehört ausschließlich zu `pages/home.json`. Dateien in anderen Ordnern sind nicht betroffen. Keine Zuordnung wird in Metadaten gespeichert. |
| Schema-Anlage | Passendes Schema lässt sich vor oder nach der Inhaltsdatei anlegen. Ein unpassendes neues Schema wird mit `422` abgelehnt. |
| Schema-Änderung | Änderung darf die zugehörige vorhandene JSON-Datei nicht ungültig machen. Fehler `422`, alte Bytes bleiben erhalten. Interne Referenzen funktionieren, externe und `$async` werden abgelehnt. |
| Schema löschen | DELETE mit aktueller Revision ergibt `204`; Inhaltsdatei bleibt bestehen und hat danach keine zusätzliche Validierung. |
| Datei löschen | DELETE benötigt Revision: fehlend `428`, veraltet `412`, aktuell `204`. Datei anschließend `404`, Schema bleibt bestehen. |
| Alte Zuordnungen | Gespeicherte alte Zuordnungsfelder werden ignoriert; nächste Metadatenänderung entfernt sie. Alte `.json`-Objektschlüssel bleiben lesbar. |
| Freigabe | Neue Inhalte privat, Public/Private wirken sofort; öffentliche Schema-Auslieferung bleibt gesperrt. |
| CLI CRUD | Create lehnt bestehende Datei ab. Update/Delete lesen Listen-ETag. Read liefert unveränderte Bytes ohne zusätzliche stdout-Zeichen oder schreibt nach `--output`. |
| CLI Schema-CRUD | Dieselben Dateibefehle verwenden für `.schema.json` die Schema-Routen. |
| Push | Gesamter Online-Dateibestand entspricht anschließend dem lokalen Ordner, einschließlich README und Binärdateien. Nur lokal fehlende Dateien verschwinden online. Projekt-Token, Freigaben und Titel bestehender Inhaltsdateipfade bleiben erhalten. |
| Snapshot-Validierung | Alle neuen Schemas werden gegen den neuen Gesamtbestand geprüft. Fehler vor Veröffentlichung lassen den alten Bestand bestehen. |
| Staging-Fehler | Storage-Ausfall beim Hochladen neuer Fassungen führt zu `503`; bisherige Metadaten bleiben unverändert. |
| Bereinigungsfehler | Nach erfolgreichem Commit führt fehlgeschlagene Bereinigung zu `503 CLEANUP_INCOMPLETE`; neuer Bestand bleibt lesbar. Wiederholter Push kann bereinigen. |
| Pull | Download wird vollständig vorbereitet, dann ersetzt er den gesamten Zielordner. Alte lokale Dateien aller Typen verschwinden. Keine internen Metadaten werden geschrieben. |
| Pull-Abbruch | Download-/Validierungsfehler verändern das Ziel nicht. Scheitert der Ordneraustausch, wird der alte Ordner wiederhergestellt oder seine Sicherung ausdrücklich erhalten. |
| Paralleler Pull | Zweiter Pull auf dasselbe Ziel wird durch die lokale Sperrdatei abgelehnt. Verwaiste Sperre nach Prozessabbruch verlangt Prüfung der Sicherung. |
| Leere Bestände | Leerer Push leert Online-Dateien und Schemas. Leerer Pull erzeugt leeren lokalen Zielordner. Fehlender lokaler Push-Ordner ist ein Fehler. |
| Lokale Pfade | Symbolische Links, spezielle Dateisystemobjekte und ungültige Namen werden vor Upload abgelehnt. Manipulierte Snapshot-Pfade dürfen nicht aus dem Pull-Ziel ausbrechen. |
| Größenlimit | Kodiertes Push-/Create-Paket über 16 MiB wird vor Upload abgelehnt. Hosting-Limits zusätzlich berücksichtigen. |
| CORS | OPTIONS ohne Token erlaubt pro Route auch DELETE und Snapshot-PUT; ETag ist exponiert. Fehlerantworten haben CORS und `no-store`. |
| Projektlöschung | Bestätigte Löschung entfernt alle Projektobjekte einschließlich alter Fassungen, Metadaten zuletzt. Unterbrochene Löschung bleibt `deleting` und ist wiederaufnehmbar. Auch über 1.000 Objekte prüfen. |

## Durchgeführte lokale Prüfungen

JavaScript-Syntax sowie lokale HTTP-Aufrufe über Fastify-Injection mit flüchtigem
In-Memory-Storage wurden geprüft. Dazu gehören binäre/JSON-Inhalte, leere Dateien,
Schema-Paarung, ETags, DELETE, Snapshot-Ersetzung, Erhalt von Freigaben/Titeln,
Staging- und Bereinigungsfehler sowie CORS. CLI CRUD und Push/Pull wurden über
denselben lokalen Adapter mit temporären Dateisystemordnern geprüft; stdout
wurde dabei auf unveränderte Binärdaten geprüft. Es wurden keine Testdateien
im Repository angelegt und keine echten Projektbestände synchronisiert.

Die anschließende Live-Abnahme gegen localhost und den konfigurierten Bucket
ist im [Live-Prüfbericht](live-acceptance.md) dokumentiert. Dort stehen auch der
gefundene und behobene Fehler sowie die noch offenen Prüfungen für Deployment
und große Bestände. Die ursprüngliche Sandbox-Netzwerksperre wurde für die
autorisierten Live-Aufrufe durch gezielte Freigaben überwunden.

## MCP und redaktionelle Beschreibungen

| Szenario | Erwartung |
| --- | --- |
| Bestehende Metadaten | Ohne description weiterhin gültig; hinterlegte Nicht-Strings als ungültig erkennen. |
| Beschreibung pflegen | Datei-/Schema-POST mit description; PATCH setzt/ersetzt Text einschließlich Zeilenumbrüchen und leerem String; null entfernt das Feld. |
| Nur Metadaten | PATCH schreibt keine Inhaltsobjekte, verändert keine Dateibytes und erneuert den Projekt-ETag. |
| PATCH-Fehler | Fehlendes If-Match 428, veraltet 412, fehlende Datei 404, falscher Typ oder zusätzliche Felder 400. |
| CLI | set-description und clear-description funktionieren mit verschachtelten Datei- und Schema-Pfaden; keine S3-Zugangsdaten erforderlich. |
| Push/Pull | Beschreibung für denselben Datei-/Schema-Pfad erhalten; neue/entfernte Pfade ohne Beschreibung. Snapshot/Pull enthält weiterhin nur Dateien. |
| MCP-Verbindung | Offiziellen Streamable-HTTP-Client mit Projekt-Token verbinden; initialize und tools/list anbieten, exakt drei Werkzeuge. |
| MCP-Lesen | Nur JSON-Inhalte auflisten; read liefert gleichzeitig Inhalt, Datei-/Schema-Description, vollständiges Schema und Revision. Fehlende Schema-Zuordnung liefert null. |
| MCP-Speichern | Vollständiges JSON einschließlich null/Primitiven speichern; Schemafehler lassen alten Inhalt bestehen. Beschreibung bleibt erhalten. |
| Redaktioneller Konflikt | read, Beschreibung per CLI/PATCH ändern, save mit alter Revision: REVISION_MISMATCH, erneut lesen. |
| Begrenzung | Keine Schema-/Binärdateien lesen oder bearbeiten, keine Dateien anlegen/löschen und keine Beschreibungen über MCP ändern. Admin hat dieselben drei Tools. |
| Rechte | Fehlender/falscher Token 401, fremder Projekt-Token 403, rotierter Token sofort ungültig. Löschzustand blockiert auch MCP. |
| Origin | Ohne Origin erlaubt; nicht erlaubte Origin 403 auch für OPTIONS; konfigurierte Origin mit Bearer verwendbar. REST-CORS bleibt unverändert. |
| Protokoll | JSON- und strukturierte Ergebnisse stimmen überein; fachliche Fehler mit isError; Antworten no-store. GET/DELETE 405, falscher Content-Type 415. |

Nach Installation der Pakete durch den Betreiber wurden am 03.10.2026 die
neuen Service-Funktionen, REST-PATCH und CLI-Beschreibungskommandos mit flüchtigem
Storage und Fastify-Injection geprüft. Der tatsächliche MCP-SDK-Transport wurde
über Fastify-Injection geprüft: initialize, tools/list, alle drei Tools,
Schemafehler, veraltete Revisionen nach Inhalts-/Beschreibungsänderungen,
primitive Werte/null, ausgeschlossene Dateitypen, fehlende Dateien und Token-
Rotation. Datei-/Schema-Beschreibungen blieben beim Snapshot-Ersetzen erhalten;
PATCH erzeugte keine Inhaltsobjekte. Origin-Ablehnung und erlaubte Preflights
sowie Verhalten bei zunächst fehlendem SDK wurden ebenfalls geprüft.

Es wurden keine Testdateien oder Testsuite im Repository angelegt. Keine
Installation oder Migration durch den Agenten. Deployment und große MCP-Antworten stehen noch aus.

Zusätzlich wurde der laufende localhost-Server mit dem offiziellen MCP-Client
gegen den echten Bucket geprüft: Verbindung, exakt drei Werkzeuge, Auflisten,
Lesen mit Schema/Revision, redaktionelle Beschreibungen per echter CLI für
Datei und Schema, MCP-Ausgabe beider Beschreibungen, gültiges Speichern,
Schema-Verstoß ohne Inhaltsänderung und Revisionskonflikte nach Inhalts- sowie
Beschreibungsänderung. Ausschließlich `test/profile.json` und seine Description
sowie die Description von `test/profile.schema.json` wurden verwendet. Der
ursprüngliche Dateiinhalt wurde bytegenau und beide Beschreibungen auf ihren
ursprünglichen Stand zurückgesetzt. Projekt-Revisionen haben sich dabei geändert.

## Vercel-Start: Import darf nicht auf listen warten

Am 03.10.2026 hingen sowohl `/` als auch `/v1/projects` des Deployments länger
als die 20 Sekunden des Diagnose-Timeouts. Die CLI hatte die korrekte URL geladen.
Der lokale Nachbau des Vercel-Listen-Interceptors reproduzierte einen blockierten
Modulimport durch `await app.listen(...)`. Nach Umstellung auf `listen().catch(...)`
wurde der Import abgeschlossen und der Server erfolgreich erfasst. Lokaler
Socket-Start mit HTTP-Antwort und Fehlerbehandlung bei belegtem Port geprüft.
Die Behebung im echten Deployment muss nach Veröffentlichung bestätigt werden.
Referenz: [Vercel Node-Runtime](https://github.com/vercel/vercel/blob/main/packages/node/src/serverless-functions/serverless-handler.mts).
