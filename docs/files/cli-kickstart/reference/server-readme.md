# Dev Storage

Eigenständige Datei-Storage-API mit Fastify, S3 und optionaler JSON-Schema-Validierung.
Der verbindliche API-Vertrag steht in [docs/doc.md](docs/doc.md).
Consumer, Editor und MCP-Server sind nicht Bestandteil dieses Projekts.

## Einrichten

Voraussetzungen: Node.js **22 oder neuer**, npm und ein privater S3-Bucket.
Node.js 24 LTS ist die empfohlene Laufzeit. Genau **einen API-Prozess** je
Workspace betreiben: kein Cluster-Modus, keine parallelen Replikate und keine
überlappenden Deployments. Projektobjekte ausschließlich über diese API ändern.

Die folgenden Schritte führt der Betreiber selbst unter WSL aus:

```bash
cd /home/cs/projects/devstorage-server
npm install
```

Für Supabase S3 die passende Vorlage kopieren:

```bash
cp .env.supabase.example .env
```

Für AWS S3 stattdessen:

```bash
cp .env.aws.example .env
```

Bucket, Region und Zugangsdaten durch die eigenen Werte ersetzen. Bei Supabase
den S3-Endpoint, die Region und die S3 Access Keys aus den Storage-Einstellungen
übernehmen. Die Vorlage verwendet beispielhaft `eu-central-1`.

Die Installation erzeugt `package-lock.json`; diese Datei anschließend für
reproduzierbare Installationen übernehmen. Es gibt keine Datenbankmigrationen.
Die `.env` mit Bucket, Region und gegebenenfalls AWS-Profil ergänzen.
Zugangsdaten werden über die reguläre AWS Credential Provider Chain geladen;
im Deployment bevorzugt eine Workload-Rolle verwenden.

```bash
npm run cli -- workspace init
```

Den ausgegebenen Admin-Token sicher aufbewahren und in
`DEV_STORAGE_ADMIN_TOKEN` übernehmen. Die API selbst bezieht ihn aus S3.
Wiederholte Initialisierung überschreibt nichts und zeigt keinen Token erneut.
Ein bestehender ungültiger Workspace führt zu einem Fehler.

```bash
npm start
```

Standardmäßig lauscht der Server auf `127.0.0.1:3000`. `HOST=0.0.0.0` erlaubt
beispielsweise die Verwendung hinter einem Container-/Reverse-Proxy-Netzwerk.
Für entfernte Zugriffe HTTPS am Reverse Proxy bereitstellen. Dessen Zeitlimits
müssen auch längere Projektlöschungen zulassen.

## Konfiguration

| Variable | Verwendung / Standard |
| --- | --- |
| `DEV_STORAGE_S3_BUCKET` | Pflicht für API und `workspace init`. |
| `DEV_STORAGE_S3_PREFIX` | Optional; leer oder nicht gesetzt bedeutet Bucket-Wurzel. Bei gesetztem relativem Prefix wird ein abschließender Slash ergänzt. |
| `AWS_REGION` | Bucket-Region; alternativ Region aus AWS-Konfiguration. |
| `AWS_PROFILE`, AWS-Zugangsdaten | Reguläre SDK-Konfiguration; keine eigenen Credential-Dateien. |
| `DEV_STORAGE_S3_ENDPOINT` | Optionaler S3-kompatibler HTTP(S)-Endpoint. |
| `DEV_STORAGE_S3_FORCE_PATH_STYLE` | `true` oder `false`, Standard `false`. |
| `PORT` / `HOST` | `3000` / `127.0.0.1`. |
| `DEV_STORAGE_API_URL` | Basis-URL ohne `/v1`, beispielsweise `http://127.0.0.1:3000`; für CLI-API-Kommandos erforderlich. |
| `DEV_STORAGE_ADMIN_TOKEN` | Aufrufer-Credential der CLI; nicht für die API-Konfiguration. |

Standardmäßig liegen `_workspace.json` und `projects/` direkt in der
Bucket-Wurzel. Die projektinterne Struktur bleibt erhalten. Ein ausdrücklich
gesetzter Prefix wie `dev-storage/` setzt einen zusätzlichen Ordner davor.
Eine Änderung des Prefix verschiebt keine bereits gespeicherten Objekte.

`npm start`, `npm run dev` und `npm run cli -- …` laden `.env`, sofern vorhanden.
Bereits gesetzte Umgebungsvariablen haben Vorrang. Beim direkten Aufruf
`node src/cli.js …` oder über `dev-storage` müssen die Variablen bereits gesetzt
sein; alternativ `node --env-file=.env src/cli.js …` verwenden.

Das Paket definiert `dev-storage` als Binärkommando. Für einen global verfügbaren
Aufruf kann der Betreiber bei Bedarf selbst `npm link` ausführen. Die
`npm run cli -- …`-Variante benötigt keine globale Verknüpfung.

## S3-Berechtigungen und Betriebsmodell

API und Initialisierung benötigen für den gewählten Bucket/Prefix:

- Bucket-Ebene: `s3:ListBucket`.
- Objekte unter dem Prefix: `s3:GetObject`, `s3:PutObject`,
  `s3:DeleteObject`.
- Bei eigener KMS-Verschlüsselung zusätzlich die zur Bucket-Konfiguration
  passenden KMS-Berechtigungen.

Der Bucket bleibt privat. `_workspace.json` und `_meta.json` enthalten Tokens
und dürfen nicht direkt öffentlich ausgeliefert werden. Verwendet wird ein
Bucket ohne S3-Versionierung. Die API fragt keine Bucket-Versionierung ab und
verwaltet weder S3-Objektversionen noch Delete-Marker. Bereits versionierte
oder lediglich auf „Suspended“ gesetzte Buckets gehören nicht zum Betriebsmodell.

Ein alternativer S3-Dienst muss `If-Match` und `If-None-Match: *` bei PutObject,
ETags, konsistente Lese-/Listenoperationen und die verwendeten Lösch-APIs
unterstützen, um dieselben Storage-Garantien wie AWS S3 zu liefern.
Die Live-Abnahme des konfigurierten Buckets am 03.10.2026 ergab, dass beide
Write-Bedingungen ignoriert werden. API-ETag-Prüfung, Projektsperre und die
Existenzprüfung bei Projektanlage schützen innerhalb eines API-Prozesses;
der zusätzliche Schutz auf Storage-Ebene fehlt bei diesem Bucket.
Workspace-Initialisierung deshalb ebenfalls nicht parallel ausführen.
Fehlende Löschrechte können eine vollständige Projektlöschung verhindern; die
API meldet dann `503` und lässt das Projekt gesperrt. Keine Lifecycle-Regeln
einsetzen, die registrierte Fassungen oder Metadaten entfernen.

Projektzugriffe werden in einem API-Prozess pro Projekt serialisiert; dadurch
kann eine Löschung nicht mit einer noch laufenden API-Schreiboperation
überlappen. Nach dem Wechsel auf `deleting` werden Zugriffe abgelehnt. Ein
erneuter bestätigter Löschaufruf setzt eine unterbrochene Bereinigung fort.
Alle Objekte im Projekt-Prefix werden entfernt, die
`deleting`-Metadaten zuletzt. Für Deployments den bisherigen Prozess
beenden lassen, bevor ein neuer Prozess startet. `SIGINT`/`SIGTERM` schließen
Fastify geordnet und warten auf laufende Requests.

Inhaltsfassungen sind unveränderlich. Ein interner `revision`-Nonce in den
Projektmetadaten verhindert, dass das Zurücksetzen einer Änderung eine alte
ETag-Revision wieder gültig macht. Er wird ebenso wie Tokens und Objektschlüssel
nicht in Listen ausgegeben. Nicht mehr aktuelle Fassungen sind keine abrufbare
Versionshistorie und werden spätestens bei Projektlöschung entfernt.

Bei einem sicher erkannten Metadatenkonflikt wird die neue, unveröffentlichte
Objektfassung bestmöglich entfernt. Nach einem unklaren Storage-Ergebnis
(beispielsweise einer verlorenen PUT-Antwort) bleibt sie vorsorglich erhalten:
Der Write könnte bereits erfolgreich sein. Solche Fassungen und nach einem
Absturz verbliebene Objekte werden bei der Projektlöschung mitbereinigt.
Nach `503` deshalb zunächst den aktuellen Zustand lesen. Insbesondere
Token-Rotation kann bei einer verlorenen Antwort bereits erfolgt sein; es
gibt keinen automatischen Token-Reset. Administrative Wiederherstellung
erfordert dann kontrollierten direkten Zugriff auf die aktuelle S3-Konfiguration.

## CLI

```bash
npm run cli -- projects list
npm run cli -- projects create example
npm run cli -- projects rotate-token example
npm run cli -- admin rotate-token
npm run cli -- projects delete example --confirm example
```

Ohne `--confirm` fragt das Löschkommando im Terminal den exakten Projektnamen
ab. Nicht interaktiv wird ohne diese Option kein Löschaufruf ausgeführt.
Erfolg endet mit Exit-Code `0`, Fehler oder Abbruch mit `1`. Token-Antworten
erscheinen nur bei erfolgreicher Anlage/Rotation. Nach Rotation den neuen
Token in CLI beziehungsweise Consumer übernehmen. API-Kommandos laden keine
S3-Konfiguration. Push/Pull und Datei-CRUD verwenden ausschließlich die API;
nur `workspace init` greift direkt auf den Bucket zu.

## Datei-CRUD und Push/Pull

```bash
npm run cli -- files create test pages/home.json projects/test/pages/home.json
npm run cli -- files read test pages/home.json
npm run cli -- files read test images/logo.png --output ./logo.png
npm run cli -- files update test pages/home.json projects/test/pages/home.json
npm run cli -- files delete test pages/home.json
npm run cli -- projects push test
npm run cli -- projects pull test
npm run cli -- projects push test --dir ./data
npm run cli -- projects pull test --dir ./data
```

Das Online-Projekt muss bereits existieren. Ohne `--dir` ist der lokale Ordner
`projects/<projectId>`, relativ zum Arbeitsverzeichnis. `files read` schreibt
unveränderte Bytes nach stdout oder in `--output`; Statusmeldungen für
Dateioperationen und Synchronisation gehen nach stderr. Create lehnt bestehende
Dateien ab, Update und Delete benötigen eine vorhandene Datei. Die CLI liest
vor Update/Delete den Listen-ETag und sendet ihn als `If-Match`.

Push ersetzt **alle** Online-Dateien und Schemas durch den lokalen Bestand.
Pull ersetzt **den gesamten** lokalen Projektordner durch den Online-Bestand,
auch Markdown, Bilder und PDFs. Es gibt keine zusätzliche Bestätigungsabfrage
und keine Filter anhand von `.gitignore`. Ein leerer Bestand leert das Ziel;
ein fehlender lokaler Push-Ordner ist ein Fehler. Leere Ordner werden nicht
übertragen. Unterordner und Dateibytes bleiben erhalten.

Projektname und Token bleiben beim Push erhalten. Bestehende Titel und
Freigaben werden für weiterhin vorhandene Inhaltsdateipfade übernommen; neue
Dateien starten privat. Es werden keine internen Projektmetadaten heruntergeladen
und keine lokale Zuordnungsdatei angelegt.

Schemas heißen `*.schema.json`: `pages/home.schema.json` validiert automatisch
`pages/home.json`. Es gibt keine manuelle Schema-Zuordnung mehr. Das Hinzufügen
oder Ändern eines Schemas prüft die bereits vorhandene zugehörige JSON-Datei;
eine unpassende Änderung wird abgelehnt. Schema-Dateien werden mit denselben
CLI-Dateibefehlen bearbeitet; die CLI wählt die Schema-API anhand der Endung.
Das Löschen des Schemas entfernt die Validierung, nicht die Inhaltsdatei.

Push prüft zunächst das komplette lokale Paket; die API validiert anschließend
den gewünschten Gesamtbestand, lädt neue Fassungen hoch und veröffentlicht sie
mit einem gemeinsamen Metadaten-Write. Danach werden alte Objekte bereinigt.
Bei `CLEANUP_INCOMPLETE` ist der neue Bestand bereits sichtbar; ein erneuter
Push setzt die Bereinigung fort. Bei einem unklaren Storage-Schreibergebnis
zuerst den Online-Bestand erneut lesen.

Pull lädt alles vorab und schreibt in ein temporäres Nachbarverzeichnis. Erst
danach tauscht es den Zielordner aus. Bei einem Austauschfehler wird der alte
Bestand wiederhergestellt. Ein Prozessabbruch kann neben dem Projektordner
`.test-backup-…`, `.test-pull-…` und `.test.dev-storage-pull.lock` hinterlassen.
Dann zuerst prüfen, ob noch ein Pull läuft und wo der vollständige Bestand
liegt; eine vorhandene Sicherung bleibt erhalten. Nach Wiederherstellung kann
die verwaiste Sperrdatei entfernt werden. Parallele Pulls auf dasselbe Ziel
werden durch die Sperrdatei abgewiesen.

Symbolische Links und spezielle Dateisystemobjekte werden nicht übertragen.
Pfadsegmente beginnen mit einem ASCII-Buchstaben oder einer Ziffer und enthalten
nur ASCII-Buchstaben, Ziffern, `_`, `-` und `.`. Absolute Pfade, Backslashes,
leere Segmente und `..` sind unzulässig. Nicht unterstützte lokale Namen führen
zum Abbruch, nicht zum stillen Überspringen. Dateien ohne Endung sind erlaubt.
Pull benötigt einen eigenen Zielordner und darf nicht das Arbeitsverzeichnis,
dessen Eltern, das Home-Verzeichnis oder die Dateisystemwurzel ersetzen.

## API verwenden

Alle geschützten Aufrufe senden `Authorization: Bearer <token>`. Der vollständige
Vertrag steht in [docs/doc.md](docs/doc.md). Datei- und Schema-Listen enthalten
einen `ETag`. Save, Delete und Snapshot-PUT benötigen `If-Match`; bei `412` den
aktuellen Stand laden und bewusst erneut entscheiden.

Create verwendet `POST /v1/projects/:projectId/files` mit
`{filename, dataBase64, title?, public?}`. Für JSON-Inhalte bleibt alternativ
`{filename, content, title?, public?}` möglich. Schema-Uploads gehen an `/schemas`
mit `{filename, dataBase64}` oder `{filename, schema}`. Die Datenvarianten dürfen
nicht kombiniert werden. Das bisherige Schema-Zuordnungsfeld beim Inhaltsupload
wird nicht mehr akzeptiert.

GET liefert Dateibytes mit passendem Content-Type; PUT überträgt die Bytes direkt
als Body. Die CLI verwendet dafür `application/octet-stream`. JSON wird anhand
der Dateiendung validiert und bei binärer Übertragung nicht neu formatiert.
Unbekannte Dateitypen werden als `application/octet-stream` ausgeliefert.
Dateien unter `/files/:filename` beziehungsweise `/schemas/:schemaName` können
mit DELETE entfernt werden. `:filename` ist am zuverlässigsten mit
`encodeURIComponent` zu kodieren, einschließlich enthaltenen Slashes.

Snapshots verwenden `GET` und `PUT /v1/projects/:projectId/snapshot` mit
`{files: [{filename, dataBase64}]}`. Schemas sind im Array enthalten. Das Paket
enthält keine Tokens, Freigaben, Titel, Objektschlüssel oder Schema-Zuordnungen.

Das Requestlimit beträgt **16 MiB**, bei Push für das gesamte JSON-Paket
**einschließlich Base64-Aufschlag**. Die CLI prüft dies vor dem Upload.
Hosting-Anbieter können kleinere Request-/Response-Limits setzen; diese werden
nicht durch Streaming oder eine verteilte Upload-Architektur umgangen.

Öffentliche Leseroute: `GET /v1/public/:projectId/:filename`. Nur ausdrücklich
freigegebene Inhalte sind erreichbar; Schemas bleiben privat. Alle Antworten
sind `no-store`, CORS erlaubt jede Origin ohne Cookie-Authentifizierung.
Preflights benötigen keinen Token und exponieren `ETag`. Fehler haben die Form
`{error: {code, message, details?}}`. Logs enthalten keine Request-Bodies oder
Authorization-Header.

Dateifassungen liegen unter `projects/<projectId>/_objects/<Ordner>/<UUID>`.
Alte Schlüssel mit `.json` bleiben lesbar. Alte gespeicherte Schema-Zuordnungen
werden nicht mehr ausgewertet und bei der nächsten Metadatenänderung entfernt.
Alte Schemas ohne `.schema.json` bleiben abrufbar, erzeugen aber keine automatische
Zuordnung; sie müssen bewusst unter dem passenden Namen neu angelegt werden.
Schema-Validierung verwendet weiterhin Draft-07 und verändert keine Inhalte.

Es gibt keine Datenbank und keine S3-Versionierung. Die vorhandenen lokalen
Sperren koordinieren nur einen API-Prozess. Mehrere Vercel-Instanzen sowie die
fehlende Durchsetzung bedingter S3-Writes beim geprüften Bucket bleiben bekannte Einschränkungen.

## Prüfung

```bash
npm run check
```

Dieser Befehl prüft nur die JavaScript-Syntax und benötigt keine installierten
Projektpakete. Es wird keine Testsuite angelegt.
[Manuelle Abnahmeszenarien](docs/files/manual-acceptance.md) beschreiben die
Prüfung mit installierten Paketen und einem separaten S3-Workspace.

Die gewählten Hauptversionen folgen der
[Fastify-5-Laufzeitvorgabe](https://fastify.dev/docs/latest/Guides/Migration-Guide-V5/),
der [CORS-Kompatibilitätstabelle](https://github.com/fastify/fastify-cors#compatibility)
und der [AJV-Draft-07-Unterstützung](https://ajv.js.org/json-schema.html).
Die Storage-Implementierung verwendet
[bedingte S3-Schreiboperationen](https://docs.aws.amazon.com/AmazonS3/latest/API/API_PutObject.html).
