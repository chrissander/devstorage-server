# Live-Abnahme am 03.10.2026

## Testplan und Umgebung

Die laufende API unter `http://127.0.0.1:3000` und die tatsächliche CLI wurden
gegen den konfigurierten S3-Bucket geprüft. Reihenfolge: Anmeldung und Anlage,
Datei-/Schema-CRUD, Push/Pull, Fehlerfälle, öffentliche Auslieferung, Rotation,
Löschung und Wiederherstellung. Alle schreibenden Projektoperationen betrafen
ausschließlich `test`. Lokale Austauschdateien lagen in einem temporären Ordner;
die Beispiele unter `projects/test` wurden nicht bearbeitet.

CLI-Aufrufe liefen als echte Node-Unterprozesse, API-Aufrufe über HTTP. Keine
Installationen oder Migrationen. Die temporären Prüfroutinen sind keine neue
Testsuite im Repository. Tokens und Zugangsdaten sind nicht Teil dieses Berichts.

## Ergebnis: 21 von 21 regulären Prüffällen bestanden

| Prüfung | Beobachtung |
| --- | --- |
| Anmeldung | Fehlender oder ungültiger Token liefert `401`. |
| CLI Projektanlage | Neues Projekt lässt sich anlegen. |
| Doppelte Projektanlage | Nach Korrektur `409`; bestehender Token bleibt gültig. |
| Workspace init | Bestehender Workspace wird erkannt; keine erneute Token-Ausgabe. |
| Projektrechte | Projekt-Token liest eigene Dateien; Admin-Funktionen liefern `403`. |
| Push der Beispiele | Vier Inhaltsdateien und ein Schema einschließlich Unterordner übertragen. |
| Pull | Vorhandene lokale Altdatei entfernt; alle fünf Dateien bytegenau wiederhergestellt. |
| CLI Datei-CRUD | Verschachtelte Binärdatei anlegen, lesen, per stdout/`--output` ausgeben, auf null Bytes aktualisieren und löschen. |
| Schema-Verstöße | Ungültiger Inhalt und inkompatibles Schema liefern `422`; alter Inhalt bleibt erhalten. |
| ETags und Parallelität | Ohne Revision `428`, veraltet `412`; zwei parallele Saves derselben Revision ergeben einmal `200`, einmal `412`. |
| Freies JSON | `null`, Boolean, Zahl, String und Array werden unverändert gespeichert. |
| Öffentliche Freigabe | Verschachtelte Datei zunächst `404`, nach Freigabe lesbar, nach Widerruf wieder `404`. |
| CORS und Cache | Tokenfreier DELETE-Preflight, erlaubte Origin, exponierter ETag; API-Antworten mit `no-store`. |
| CLI Schema-CRUD | Anlegen, Lesen, Aktualisieren, Löschen; automatische Zuordnung über Dateinamen. |
| Eingabeprüfung | Ungültiger Pfad und Base64 liefern `400`; externe Schema-Referenz `422`. |
| Ungültiger Snapshot | Schemafehler verhindert Veröffentlichung; vorheriger Snapshot bleibt gleich. |
| Vollständiges Ersetzen | Push eines anderen Bestands entfernt frühere Dateien; leerer Push/Pull leert den jeweiligen Bestand. |
| Projekt-Token-Rotation | Neuer Token funktioniert, alter liefert `401`. |
| Löschschutz | CLI ohne/falsch bestätigten Namen scheitert; Projekt-Token darf nicht löschen. |
| Projektlöschung | Bestätigte CLI-Löschung, anschließendes `404`, Neuanlage und Push funktionieren. |
| Endbestand | Snapshot enthält wieder alle fünf Originaldateien, bytegenau mit lokalen Beispielen verglichen. |

Der erste Durchlauf fand einen Fehler bei doppelter Projektanlage. Ein späterer
kurzer Ausfall des lokalen Servers unterbrach die letzten Prüfungen. Nach der
Korrektur und Wiedererreichbarkeit wurde der gesamte Ablauf erneut erfolgreich
durchgeführt.

## Gefundener Fehler und Korrektur

Der Bucket akzeptierte eine zweite Projektanlage trotz `If-None-Match: *` und
überschrieb die Metadaten des Testprojekts. `Service.createProject` prüft jetzt
innerhalb der bestehenden Projektsperre zuerst, ob das Projekt vorhanden ist.
Bei vorhandenem Projekt erfolgt kein Write. Der bedingte S3-Write bleibt aktiv.
Die Wiederholungsprüfung bestätigte `409` und einen weiterhin gültigen Token.

Ein separater direkter Storage-Test mit einem temporären Objekt unter
`projects/test/_objects/` bestätigte: Sowohl ein erneutes `If-None-Match: *`
als auch ein absichtlich falsches `If-Match` wurden vom Bucket akzeptiert.
Das Probeobjekt wurde anschließend gelöscht. API-Revisionen und Sperren wirken
innerhalb eines Prozesses, aber der Bucket liefert hier keinen zusätzlichen
Schutz gegen konkurrierende Serverinstanzen oder direkte externe Änderungen.
Workspace-Initialisierung darf ebenfalls nicht parallel erfolgen.

## Unterbrochene Löschung und Wiederaufnahme

Eine zusätzliche temporäre HTTP-Serverinstanz mit echter S3-Speicherung warf
gezielt beim Löschen der Inhaltsobjekte einen simulierten Storage-Fehler.
Ergebnis: `503`, danach gesperrter Projektzugriff (`409`) und öffentliche
Auslieferung mit `404`. Nach Schließen und Neuerzeugen der App mit einer neuen
Storage-Instanz bestand die Sperre weiterhin. Ein erneut bestätigter Löschaufruf
schloss die Bereinigung ab. Eine direkte S3-Auflistung bestätigte den leeren
Projekt-Prefix; ein weiterer Löschversuch lieferte `404`.

Dies prüft das Wiederladen des gespeicherten Löschzustands; ein tatsächlicher
Betriebssystem-Prozessabsturz oder Netzausfall wurde nicht ausgelöst. Während
dieses sequenziellen Zusatztests gingen keine konkurrierenden Testzugriffe an
die reguläre API. Anschließend wurde `test` über die reguläre localhost-API neu
angelegt und mit den ursprünglichen fünf Beispieldateien befüllt.

## Noch nicht live geprüft

- Löschung über mehrere S3-Listenseiten mit mehr als 1.000 Objekten.
- Echte Netzwerkabbrüche, fehlende Bucket-Berechtigungen und verlorene Write-Antworten.
- Globale Admin-Token-Rotation und erstmalige Workspace-Initialisierung: Der
  vorhandene Workspace und seine Zugangsdaten sollten unverändert bleiben.
- Vercel-Deployment, mehrere Serverinstanzen und Hosting-Größenlimits.

JavaScript-Syntaxprüfung nach der Korrektur: erfolgreich. Der Online-Bestand
`test` bleibt für weitere manuelle Versuche verfügbar; seine Dateien sind privat.
