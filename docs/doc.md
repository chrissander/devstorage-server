# Dev Storage

## Ziel und Scope

Dev Storage ist eine eigenständige API für projektbezogene Dateien in einem
privaten S3-kompatiblen Bucket. JSON, Text und Binärdateien werden unterstützt.
JSON-Inhalte können optional mit JSON Schema Draft-07 validiert werden.

Zum Lieferumfang gehören Datei- und Schema-CRUD, Projektverwaltung,
Admin-/Projekt-Tokens, Rotation, Freigaben, Konfliktschutz, CORS sowie eine CLI
mit vollständigem Push/Pull. Es gibt keine Datenbank und keine S3-Versionierung.
Ein projektgebundener MCP-Zugriff erlaubt die Bearbeitung vorhandener JSON-Dateien.
Ein Editor bleibt ein separates Vorhaben.

Ein Workspace bezeichnet die konfigurierte API-Instanz samt Bucket und
Projekten. Ein Consumer ist ein separates Projekt, das die API oder CLI nutzt;
seine Ladefunktionen bleiben außerhalb dieses Lieferumfangs. Siehe
[Consumer-Integration](files/consumer-integration.md).

## Technik und Konfiguration

Node.js mit JavaScript/ES-Modulen, Fastify, AWS SDK, AJV Draft-07 mit
`ajv-formats` sowie `@fastify/cors`. API-Anfragen und Inhaltsvalidierung verwenden
getrennte Validatoren. AJV verändert keine Daten: keine Typumwandlung, keine
Standardwerte und kein Entfernen von Feldern.

`DEV_STORAGE_S3_BUCKET` ist Pflicht. `DEV_STORAGE_S3_PREFIX` ist optional und
standardmäßig leer: Ablage direkt in der Bucket-Wurzel. Ein ausdrücklich
gesetzter relativer Prefix wird mit abschließendem Slash vorangestellt.
`AWS_REGION` und die reguläre AWS Credential Provider Chain konfigurieren den
S3-Zugriff. Optional: `DEV_STORAGE_S3_ENDPOINT` und
`DEV_STORAGE_S3_FORCE_PATH_STYLE` (`true`/`false`). `PORT` ist standardmäßig
`3000`, `HOST` standardmäßig `127.0.0.1`.

Die CLI verwendet `DEV_STORAGE_API_URL` und `DEV_STORAGE_ADMIN_TOKEN` für
API-Aufrufe. Nur `workspace init` verwendet direkten Bucket-Zugriff. Die API
selbst prüft Tokens gegen den aktuellen S3-Stand. Zwei getrennte Beispiel-Env-
Dateien für AWS und Supabase S3 stehen im Repository; es gibt keine zusätzliche
Supabase-Datenbankanbindung.

## Pfade, Ablage und Metadaten

Projekt-IDs entsprechen `^[a-z0-9]+(?:-[a-z0-9]+)*$`. Dateinamen sind relative
Pfade, beispielsweise `README.md`, `images/logo.png` oder `pages/home.json`.
Jedes Segment beginnt mit einem ASCII-Buchstaben oder einer Ziffer, gefolgt
von ASCII-Buchstaben, Ziffern, `_`, `-` und `.`. `/` trennt Ordner. Absolute
Pfade, Backslashes, leere Segmente und `..` sind unzulässig. Eine Dateiendung
ist nicht erforderlich. Alle Dateitypen sind erlaubt; diese Namensregeln
bleiben auch für Binärdateien verbindlich.

Ordner entstehen automatisch durch die Objektschlüssel. Es gibt keine eigene
Ordner-Anlagefunktion und keine Übertragung leerer Ordner. Dateien und Schemas
teilen sich einen Namensraum. Doppelte Pfade sowie ein Pfad, der zugleich Datei
und übergeordneter Ordner wäre, führen zu `409`.

Unter der Bucket-Wurzel beziehungsweise dem ausdrücklich gesetzten Prefix:

- `_workspace.json`: `{version: 1, adminToken}`.
- `projects/<projectId>/_meta.json`: Projektmetadaten.
- `projects/<projectId>/_objects/<Ordnerpfad>/<UUID>`: unveränderliche Dateibytes.

Metadaten enthalten `version: 1`, `projectId`, `token`, `state` (`active` oder
`deleting`), einen internen `revision`-Nonce sowie `files` und `schemas`.
Ein Dateieintrag enthält `filename`, `public` (Standard `false`), optional
`title`, optional `description` und `objectKey`. Ein Schemaeintrag enthält
`filename`, `objectKey` und optional `description`.
Es wird keine Schema-Zuordnung gespeichert. Datei-/Schema-Listen geben weder Tokens noch
interne Objektschlüssel aus. Die Admin-Projektliste enthält den aktuellen
Projekt-Token als `token`. Die Schema-Zuordnung im API-Ergebnis wird aus den
Namen berechnet.

Bisherige interne Objektschlüssel mit `.json` bleiben lesbar. Alte gespeicherte
Schema-Zuordnungen werden ignoriert und bei nachfolgenden Metadatenänderungen
entfernt. Alte Schemas ohne `.schema.json` bleiben lesbar und löschbar, gelten
aber nicht als automatische Zuordnung. Eine Neuanlage unter dem passenden
Namen erfolgt bewusst; Dateien werden nicht automatisch umbenannt.

## Rechte und Tokens

Der Admin darf alle Operationen ausführen. Der Projekt-Token darf Dateien und
Schemas seines Projekts auflisten, lesen, hinzufügen, ändern und löschen,
Freigaben ändern sowie Snapshots lesen und ersetzen. Projektverwaltung und
Token-Rotation erfordern den Admin. Geschützte Aufrufe verwenden einen
Bearer-Token im `Authorization`-Header, öffentliche Leserouten keinen Token.

Tokens werden kryptografisch zufällig erzeugt. Anlage und Rotation geben den
neuen Token erst nach erfolgreicher Speicherung aus. Antworten sind nicht
cachebar. Alte Tokens werden nach Rotation nicht aus einem Cache akzeptiert.
Nur die Admin-Projektliste sowie Anlage-/Rotationsantworten enthalten Tokens.
Datei-/Schema-Listen, MCP-Ergebnisse, Fehler und Logs enthalten keine Tokens
oder Storage-Zugangsdaten.
Projekt-Tokens können weder Projekte löschen noch Tokens rotieren.

## Schemas über Dateinamen

Dateien mit Endung `.schema.json` sind Schemas. `pages/home.schema.json` gehört
zu `pages/home.json` im selben Ordner. Nur `.json`-Inhaltsdateien erhalten diese
Validierung. Ohne passendes Schema wird ausschließlich gültiges UTF-8-JSON
verlangt, einschließlich primitiver Werte und `null`. Andere Dateitypen werden
als unveränderte Bytes gespeichert. Ein Schema darf ohne Inhaltsdatei existieren.

Schemas müssen gültige Draft-07-Schemas sein; Boolean-Schemas sind erlaubt.
Interne Referenzen sind möglich, externe oder dateiübergreifende Referenzen und
asynchrone Schemas werden abgelehnt. Es wird nichts extern nachgeladen.
Ein neues oder geändertes Schema muss eine bereits vorhandene zugehörige
JSON-Datei validieren. Unpassende Schema-/Inhaltsänderungen führen zu `422` und
lassen den bisherigen Stand bestehen. Das Löschen des Schemas entfernt die
Validierung; das Löschen der Inhaltsdatei löscht das Schema nicht mit.

Die frühere Set-File-Schema-Funktion entfällt. Beim Inhaltsupload ist das
bisherige Feld `schema` nicht mehr erlaubt. In Schema-Uploads bezeichnet das
Feld `schema` weiterhin den eigentlichen JSON-Schema-Inhalt.

## API-Vertrag

Prefix `/v1`. Projektbezogene Operationen akzeptieren Admin oder passenden
Projekt-Token, mit „Admin“ markierte Operationen ausschließlich Admin.
`:filename` und `:schemaName` bezeichnen vollständige relative Pfade. Clients
sollen sie vollständig mit `encodeURIComponent` kodieren. Lesbare Unterordner-
URLs werden ebenfalls unterstützt. Aktionssuffixe `/public` und `/private`
werden bei POST nach dem kodierten Dateipfad angehängt.

| Funktion | Methode und Route | Eingabe / Ergebnis |
| --- | --- | --- |
| Rotate Admin Token | `POST /v1/admin/token/rotate` | Admin; `{adminToken}`. |
| List Projects | `GET /v1/projects` | Admin; `{projects: [{projectId, state, token}]}`, alphabetisch sortiert. |
| Create Project | `POST /v1/projects` | Admin; `{projectId}`, Ergebnis `{projectId, token}`, `201`. |
| Delete Project | `DELETE /v1/projects/:projectId` | Admin; `{confirmProject: projectId}`, `204`. |
| Rotate Project Token | `POST /v1/projects/:projectId/token/rotate` | Admin; `{projectId, token}`. |
| List Files | `GET /v1/projects/:projectId/files` | `{files: [{filename, schema, title?, description?, public}]}` und ETag. |
| Create File | `POST /v1/projects/:projectId/files` | `{filename, dataBase64, title?, description?, public?}`; für JSON alternativ `content` statt `dataBase64`; `201`. |
| Read File | `GET /v1/projects/:projectId/files/:filename` | Dateibytes und ETag. |
| Update File | `PUT /v1/projects/:projectId/files/:filename` | Dateibytes direkt als Body; `If-Match` erforderlich. |
| Set File Description | `PATCH /v1/projects/:projectId/files/:filename` | `{description: string oder null}`; `If-Match` erforderlich, aktualisierte Metadaten und ETag. |
| Delete File | `DELETE /v1/projects/:projectId/files/:filename` | `If-Match` erforderlich; `204`. |
| Set Public | `POST /v1/projects/:projectId/files/:filename/public` | `{filename, public: true}`. |
| Set Private | `POST /v1/projects/:projectId/files/:filename/private` | `{filename, public: false}`. |
| List Schemas | `GET /v1/projects/:projectId/schemas` | `{schemas: [{filename, description?}]}` und ETag. |
| Create Schema | `POST /v1/projects/:projectId/schemas` | `{filename, dataBase64, description?}` oder `{filename, schema, description?}`; `201`. |
| Read Schema | `GET /v1/projects/:projectId/schemas/:schemaName` | Schema-Dateibytes und ETag. |
| Update Schema | `PUT /v1/projects/:projectId/schemas/:schemaName` | Schema-Dateibytes direkt als Body; `If-Match` erforderlich. |
| Set Schema Description | `PATCH /v1/projects/:projectId/schemas/:schemaName` | `{description: string oder null}`; `If-Match` erforderlich, aktualisierte Metadaten und ETag. |
| Delete Schema | `DELETE /v1/projects/:projectId/schemas/:schemaName` | `If-Match` erforderlich; `204`. |
| Read Snapshot | `GET /v1/projects/:projectId/snapshot` | `{files: [{filename, dataBase64}]}` und ETag, einschließlich Schemas. |
| Replace Snapshot | `PUT /v1/projects/:projectId/snapshot` | Gleiches Paketformat; `If-Match` erforderlich; Ergebnis `{files: Anzahl}`. |
| Public Read File | `GET /v1/public/:projectId/:filename` | Nur freigegebene Inhaltsdatei; Dateibytes ohne Token. |

Soweit nicht anders angegeben gilt Erfolg `200`. Create/Update File liefern
`{filename, schema, title?, description?, public}`, Create/Update Schema `{filename, description?}`.
Datei-/Schema-Mutationen und Snapshot-PUT liefern den neuen ETag.
Dateien mit `.schema.json` werden über `/schemas` verwaltet, nicht über `/files`.

API-Envelopes sind JSON. Base64 muss kanonisch und vollständig sein. Create
akzeptiert genau eine Datenvariante. Die JSON-Wert-Variante wird serialisiert;
Base64 und direkte PUT-Bytes bleiben einschließlich Formatierung unverändert.
GET verwendet den anhand der Dateiendung bestimmten Content-Type, unbekannte
Typen `application/octet-stream`. PUT kann `application/octet-stream` verwenden;
JSON-Prüfung wird durch den Dateinamen bestimmt, nicht durch den HTTP-MIME-Typ.
Leere Binär-/Textdateien sind erlaubt, leere JSON-Dateien nicht.

Das Requestlimit beträgt 16 MiB einschließlich Envelope und Base64-Aufschlag.
Es gibt kein Chunking. Strengere Hosting-Limits für Request/Response und
Laufzeit gelten zusätzlich.

## Konflikte und Veröffentlichung

ETags basieren auf den Projektmetadaten. Damit können auch Änderungen anderer
Dateien, Freigaben und Tokens eine Revision veralten lassen. Fehlendes
`If-Match` führt bei Update, Description-PATCH, Delete und Snapshot-PUT zu `428`, eine abweichende
Revision zu `412`. Es gibt kein automatisches Zusammenführen oder Wiederholen
solcher Consumer-Änderungen. CLI Update/Delete lesen zunächst den Listen-ETag.

Neue Objekte werden unter unveränderlichen Schlüsseln geschrieben. Erst ein
bedingter Metadaten-Write veröffentlicht die Fassung. Bestehende Metadaten
verwenden S3 `If-Match`, Neuanlagen `If-None-Match: *`. Ein zufälliger interner
Nonce verhindert, dass eine zurückgesetzte Änderung alte ETags erneut gültig
macht. Die API liest ausschließlich registrierte Objekte.

Bei wiederholbaren Operationen wie Upload/Freigabe werden Konflikte höchstens
dreimal versucht und ansonsten mit `409` gemeldet. Unveröffentlichte, sicher
nicht referenzierte Objekte werden bestmöglich bereinigt. Bei unklarem Write-
Ergebnis bleiben sie vorsorglich erhalten; der Write könnte erfolgt sein.
Nicht mehr referenzierte Fassungen sind keine angebotene Versionshistorie.

Projektzugriffe werden innerhalb eines API-Prozesses koordiniert. Dies ist
keine verteilte Sperre: parallele Vercel-Instanzen bleiben eine bekannte
Einschränkung. Im Live-Test am 03.10.2026 ignorierte der konfigurierte Bucket
sowohl `If-Match` als auch `If-None-Match` bei PutObject. Die API prüft ETags
und die Existenz eines Projekts vor Neuanlage innerhalb ihrer Projektsperre;
ein zusätzlicher Schutz durch den Bucket besteht dort nicht. Auch Workspace-
Initialisierung darf dort nicht parallel laufen. Es wird weder eine Datenbank noch
zusätzliche verteilte Koordination eingeführt.

## CLI und vollständige Synchronisation

| Kommando | Verhalten |
| --- | --- |
| `dev-storage workspace init` | Direkt in S3 einmalig Workspace und Admin-Token anlegen. |
| `dev-storage admin rotate-token` | Admin-Token über API rotieren. |
| `dev-storage projects list` | Projekte auflisten. |
| `dev-storage projects create <projectId>` | Projekt anlegen. |
| `dev-storage projects delete <projectId> [--confirm <projectId>]` | Projekt nach Bestätigung löschen. |
| `dev-storage projects rotate-token <projectId>` | Projekt-Token rotieren. |
| `dev-storage files create <projectId> <dateipfad> <lokale-datei>` | Neue Datei oder Schema anlegen. |
| `dev-storage files read <projectId> <dateipfad> [--output <lokale-datei>]` | Unveränderte Bytes nach stdout oder Datei schreiben. |
| `dev-storage files update <projectId> <dateipfad> <lokale-datei>` | Vorhandene Datei/Schema mit Revisionsprüfung ersetzen. |
| `dev-storage files delete <projectId> <dateipfad>` | Vorhandene Datei/Schema mit Revisionsprüfung entfernen. |
| `dev-storage files set-description <projectId> <dateipfad> <text>` | Beschreibung mit Revisionsprüfung setzen/ersetzen. |
| `dev-storage files clear-description <projectId> <dateipfad>` | Beschreibung mit Revisionsprüfung entfernen. |
| `dev-storage projects push <projectId> [--dir <ordner>]` | Online-Dateibestand vollständig ersetzen. |
| `dev-storage projects pull <projectId> [--dir <ordner>]` | Lokalen Projektordner vollständig ersetzen. |

CLI-Dateioperationen wählen `/files` oder `/schemas` anhand von `.schema.json`.
Standardordner für Push/Pull ist `projects/<projectId>` relativ zum aktuellen
Arbeitsverzeichnis. Das Online-Projekt muss existieren. Erfolg endet mit `0`,
Fehler/Abbruch mit `1`. Datei- und Synchronisationsstatus gehen nach stderr;
`files read` fügt den Bytes auf stdout keinen Zeilenumbruch hinzu.

Push erfasst rekursiv alle regulären Dateien aller Typen, ohne Gitignore-Filter.
Ungültige Namen, symbolische Links oder spezielle Dateisystemobjekte führen
zum Abbruch vor dem Upload. Das vollständige kodierte Paket wird lokal auf
das Requestlimit geprüft. Anschließend wird ein aktueller Snapshot-ETag gelesen
und der gewünschte Bestand mit dieser Revision ersetzt.

Die API validiert den vollständigen gewünschten Bestand, schreibt neue
Objekte und veröffentlicht dann gemeinsam die neuen Metadaten. Projektname,
Token und Freigaben/Titel weiterhin vorhandener Inhaltsdateipfade bleiben
erhalten; ebenso Beschreibungen vorhandener Inhalts- und Schema-Pfade. Neue
Dateien sind privat. Schema-Zuordnungen folgen den neuen Namen.
Abgelöste Objekte werden anschließend bereinigt. Bei `503 CLEANUP_INCOMPLETE`
ist der neue Bestand bereits veröffentlicht; erneuter Push wiederholt die
Bereinigung. Fehler vor Veröffentlichung lassen den alten Bestand bestehen,
ausgenommen unklare Storage-Antworten, bei denen erneut gelesen werden muss.

Pull lädt zuerst einen konsistenten Snapshot und schreibt ihn vollständig in
ein temporäres Nachbarverzeichnis. Erst dann wird der Zielordner ausgetauscht.
Bei Austauschfehlern wird der bisherige Ordner wiederhergestellt; eine bei einem
Abbruch verbliebene Sicherung wird nicht automatisch entfernt. Eine temporäre
Sperrdatei verhindert parallele Pulls auf dasselbe lokale Ziel. Die CLI lehnt
symbolische Links im Zielpfad und bestehendem Zielbaum sowie Root, Home,
Arbeitsverzeichnis und dessen Eltern als Ersetzungsziel ab.

Ein leerer Push-Ordner leert den Online-Dateibestand. Ein fehlender Push-Ordner
ist ein Fehler. Ein leerer Online-Bestand erzeugt beim Pull einen leeren
Zielordner. Leere Ordner ohne Dateien werden nicht übertragen. Push/Pull
ersetzen ohne zusätzliche Bestätigungsabfrage. Interne Metadaten und Tokens
werden nie lokal gespiegelt; eine README ist dagegen eine normale Datei.

`workspace init` überschreibt keinen gültigen vorhandenen Token und gibt ihn
bei Wiederholung nicht erneut aus. Ungültige vorhandene Konfiguration führt
zum Fehler. Bedingte Anlage schützt vor paralleler Erstinitialisierung.
Nur `projects delete` benötigt interaktiv den exakten Projektnamen oder
nicht interaktiv `--confirm <projectId>`; ohne passende Bestätigung erfolgt
kein Löschaufruf.

## Projekt löschen

Admin und exakt passendes `confirmProject` sind erforderlich. Fehlende/falsche
Bestätigung ergibt `400`, fehlendes Projekt `404`. Die API wartet auf laufende
Projektoperationen und setzt `deleting`. Weitere Zugriffe werden abgewiesen,
öffentliche Aufrufe mit `404`, geschützte mit `409`.

Alle Objekte des Projekt-Prefix werden gelöscht, die `deleting`-Metadaten
zuletzt. Bei Fehlern bleibt das Projekt gesperrt; erneuter bestätigter Aufruf
setzt die Löschung fort. Andere Projekte und der Workspace bleiben bestehen.
Es gibt keine Wiederherstellung. Buckets müssen ohne S3-Versionierung betrieben
werden; alte Objektversionen und Delete-Marker werden nicht verwaltet.

## Öffentliche Auslieferung, CORS und Fehler

Öffentliche Leserouten prüfen bei jedem Aufruf Projektzustand und Freigabe.
Private/fehlende Dateien, Schemas und gelöschte Projekte sind dort `404`.
Der Bucket selbst ist privat. Alle API-Antworten verwenden `Cache-Control:
no-store`. Bereits heruntergeladene Daten lassen sich nicht zurückholen.

CORS erlaubt jede Origin (`*`), aber keine Cookie-Authentifizierung. Preflights
benötigen keinen Token; Methoden werden pro Route angegeben. Erlaubte Header:
`Authorization`, `Content-Type`, `If-Match`. `ETag` wird exponiert. Auch Fehler
enthalten CORS-Header. CORS ersetzt keine Berechtigungsprüfung.

Fehlerformat: `{error: {code, message, details?}}`. Details enthalten Pfade und
Ursachen, keine Tokens oder Storage-Zugangsdaten.

| Status | Bedeutung |
| --- | --- |
| `400` | Ungültige Anfrage, JSON, Base64, Pfade, fehlende Löschbestätigung oder zu großer Request. |
| `401` | Token fehlt oder ist ungültig. |
| `403` | Gültiger Token ohne erforderliche Rechte. |
| `404` | Projekt, Datei, Schema oder Route fehlt bzw. ist öffentlich nicht verfügbar. |
| `409` | Name/Pfad belegt, Projekt wird gelöscht oder interne Schreibkonkurrenz. |
| `412` | Revision veraltet. |
| `422` | Schema oder Inhalt verletzt Schema-Anforderungen. |
| `428` | Erforderliches If-Match fehlt. |
| `503` | Storage nicht verfügbar oder Bereinigung unvollständig; kein vollständiger Erfolg behaupten. |

Editor-Details bleiben in [Editor-Idee](files/editor-idee.md). Die
[manuelle Abnahme](files/manual-acceptance.md) dokumentiert die Prüfszenarien.

## Optionale Dateibeschreibungen

Projektmetadaten speichern optional `description: string` an Inhalts- und
Schema-Einträgen. Fehlende Felder bleiben gültig; keine Migration. Vorhandene
Felder anderen Typs machen die gespeicherten Metadaten ungültig. Texte bleiben
unverändert, einschließlich Zeilenumbrüchen und leerer Strings.

POST für Dateien und Schemas akzeptiert optional `description`. Listen und
Metadatenantworten liefern das Feld nur bei Vorhandensein; Datei-GET bleibt
bytegetreu. `PATCH /v1/projects/:projectId/files/:filename` sowie
`PATCH /v1/projects/:projectId/schemas/:schemaName` akzeptieren ausschließlich
`{description: string | null}`. `null` entfernt das Feld. Beide verlangen
Admin-/Projekt-Token und `If-Match`; Antwort `200` mit aktualisierten öffentlichen
Metadaten und neuem ETag. Fehlende Revision `428`, veraltete `412`, unbekannte
Datei `404`. Es werden keine Inhaltsobjekte geschrieben. PATCH unterstützt
Unterordner und CORS.

CLI: `files set-description <projectId> <dateipfad> <text>` und
`files clear-description <projectId> <dateipfad>`. Schema-Endung bestimmt die
Route. Listen-ETag vor PATCH laden, Konflikte nicht automatisch wiederholen.

Inhaltsänderungen erhalten Beschreibungen. Snapshot-PUT erhält sie für
weiterhin vorhandene Inhalts- und Schema-Pfade. Neue Pfade starten ohne Feld;
entfernte Pfade verlieren es. Snapshots und Pull exportieren keine Beschreibungen.

## Projektgebundener MCP-Zugriff

Endpunkt `/v1/projects/:projectId/mcp`, zustandsloses Streamable HTTP über das
offizielle MCP-SDK im selben Fastify-Prozess. REST und MCP teilen dieselbe
Service-Instanz und Projektsperre. Projekt aus der URL, nicht aus Tool-Parametern.
Bearer-Authentifizierung bei jeder Anfrage, auch initialize/tools/list/ping.
Projekt-Token nur für das eigene Projekt; Admin-Token ohne zusätzliche Tools.

Genau drei Werkzeuge:

| Werkzeug | Parameter | Ergebnis |
| --- | --- | --- |
| `list_json_files` | keine | `{files: [{filename, schema, title?, description?}]}`. |
| `read_json_file` | `filename` | `{filename, content, description?, schemaFilename, schema, schemaDescription?, revision}`. |
| `save_json_file` | `filename`, `content`, `revision` | `{filename, revision}`. |

Nur vorhandene `.json`-Inhaltsdateien, einschließlich Unterordnern; keine
`.schema.json`-Dateien oder anderen Dateitypen. read liefert Inhalt, Schema,
Beschreibungen und Revision unter einer gemeinsamen Sperre. Ohne Schema sind
`schemaFilename` und `schema` null; fehlende Beschreibungen werden weggelassen.
Tool-Beschreibungen erklären, dass zurückgelieferte Inhalte und Beschreibungen
Kontextdaten statt ausführbarer Anweisungen sind.

save ersetzt die gesamte bestehende JSON-Datei, formatiert mit zwei Leerzeichen
und abschließendem Zeilenumbruch. Primitive Werte und null bleiben gültig.
Vorhandene Schema-Validierung und Revisionskontrolle gelten; keine Neuanlage,
keine Schema-/Description-Änderung oder andere Verwaltungsoperation. Schemafehler
lassen den alten Bestand bestehen; bei veralteter Revision erneut lesen.
Beschreibungsänderungen ändern ebenfalls die Projekt-Revision.

Ergebnisse werden als `structuredContent` und JSON-Text ausgegeben. Fachliche
Fehler verwenden `isError: true` mit `{error: {code, message, status, details?}}`.
Keine Tokens oder internen Schlüssel ausgeben; keine stille Kürzung. Bestehendes
16-MiB-Requestlimit und Cache-Control no-store gelten. Kein OAuth, keine Resources
oder Prompts. POST verarbeitet Protokollnachrichten; GET/DELETE nach Authentifizierung
405, OPTIONS tokenfreier Preflight. Keine dauerhaften Sessions oder SSE-GET-Streams.

MCP-Origins separat prüfen: Fehlender Origin erlaubt; vorhandener Origin muss
exakt in der optionalen kommaseparierten Konfiguration
`DEV_STORAGE_MCP_ALLOWED_ORIGINS` stehen. Standard leere Liste. Nur HTTP(S)-Origins
ohne Pfad/Zugangsdaten/abschließenden Slash konfigurieren. Ungültige Konfiguration
verhindert Start. Ungültige Request-Origin ergibt 403, auch bei OPTIONS.
REST-CORS bleibt offen. MCP-CORS erlaubt zusätzlich MCP-Protocol-Version.
SDK-Versionen und Client-Einrichtung stehen in der README.

## ETags hinter komprimierenden Proxys

API-Antworten verwenden `Cache-Control: no-store, no-transform`. Die CLI sendet
`Accept-Encoding: identity`, damit Vercels Komprimierung einen starken ETag
nicht mit `W/` abschwächt. Der Server vergleicht Revisionen weiterhin unverändert;
keine Normalisierung schwacher ETags und keine automatische Save-Wiederholung.
