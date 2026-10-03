# Umsetzungsanleitung

## Zielstruktur

```text
<neues-projekt>/
  package.json
  README.md
  .env.example
  .gitignore
  src/
    cli.js
    config.js
    model.js
    files.js
    errors.js
    local-files.js
  scripts/
    check-syntax.js
  cli-kickstart/              # dieses Übergabepaket, nicht veröffentlichen
```

Die bewusste Nähe zur bisherigen Struktur erleichtert den Abgleich. Ein
zusätzliches Shared-Paket oder eine Aufteilung in viele Command-Module ist
für diese Auslagerung nicht erforderlich.

## 1. CLI übernehmen

`reference/src/cli.js` nach `src/cli.js` übernehmen und bearbeiten:

1. `storageConfig` aus den Imports entfernen.
2. `workspace init` aus Hilfe und Command-Tabelle entfernen.
3. Den zugehörigen Zweig mit dynamischen Imports von `storage.js` und
   `service.js` vollständig entfernen. Einen gezielten Hinweis für einen
   Aufruf von `workspace init` vor der generischen Argumentfehlermeldung ergänzen.
4. Vor der ersten API-Anfrage einmal die lokale Konfiguration laden. Die
   Argumentprüfung und `--help` müssen davor funktionieren.
5. Die übrigen Befehle, Optionen, Requests, Zeitlimits und Ausgaben erhalten.

Der HTTP-Client kann vorerst in `cli.js` bleiben. Keine unaufgeforderte
Erweiterung um neue API-Kommandos, Watch-Modus oder automatische Synchronisation.

## 2. Hilfsmodule auf den Clientbedarf reduzieren

| Quelle | Im neuen Paket übernehmen |
| --- | --- |
| `config.js` | `required`, `httpUrl`, `cliConfig`; um `.env`-Laden ergänzen; `storageConfig` und `serverConfig` entfernen |
| `model.js` | `projectPattern`, `filenamePattern`, `isProject`, `isFilename`, `projectId`, `filename`, `isSchema`, `fileKind`, `checkPaths` und dessen Helfer `directoryOf` |
| `files.js` | `BODY_LIMIT`, `decodeBase64` und benötigten `fail`-Import |
| `errors.js` | `ApiError` und `fail` |
| `local-files.js` | Vollständig übernehmen; lokale Schutzmechanismen erhalten |
| `scripts/check-syntax.js` | In den gleichnamigen Ordner übernehmen |

Keine Token-Erzeugung, S3-Metadatenvalidierung, Content-Type-Tabelle,
serverseitige JSON-/Schema-Validierung oder Storage-Fehlerklassen übernehmen.
Die importierten Funktionen nach dem Kürzen gegenprüfen. Die lokale
Dateiverarbeitung benötigt `filename`, `checkPaths`, `BODY_LIMIT` und
`decodeBase64`; deren transitive Helfer dürfen nicht verloren gehen.

## 3. Paket und Nutzerdokumentation erstellen

- Die Paketdefinition aus `PLAN.md` anlegen.
- `.env.example` mit `DEV_STORAGE_API_URL=http://127.0.0.1:3000` und
  `DEV_STORAGE_ADMIN_TOKEN=replace-with-your-admin-token` erstellen.
- `.gitignore` mindestens für `node_modules/`, `.env`, `.env.*` mit Ausnahme
  `!.env.example`, `*.tgz` und lokale Daten unter `projects/` anlegen.
- README für den tatsächlichen Paketnutzer schreiben: Voraussetzungen,
  Installation, `.env`, sämtliche Befehle, eigene Datenordner, Push/Pull als
  vollständiger Ersatz, 16-MiB-Limit, Exit-Codes und API-Kompatibilität.
- Darauf hinweisen, dass `workspace init` zum separat betriebenen Server gehört.
- Entwicklungsaufrufe (`node src/cli.js`, `npm run cli -- ...`) von Aufrufen
  im Consumer-Projekt (`npx dev-storage ...`) unterscheiden.
- Die Release-Schritte als Betreiberanleitung dokumentieren, einschließlich
  Paketname, Registry, Sichtbarkeit, Lizenz und Entfernung von `private: true`.

## 4. Prüfen und übergeben

Die Kriterien aus `ACCEPTANCE.md` abarbeiten. Keine Abhängigkeiten installieren
und keine Testsuite anlegen. Syntax und Hilfe können ohne Installation geprüft
werden. Nicht durchgeführte Live- und Installationsprüfungen ausdrücklich
kennzeichnen; sie sind keine automatisch bestandenen Prüfungen.

Das Ergebnis ist ein zur weiteren Paketprüfung vorbereitetes CLI-Repository.
Ein tatsächliches Registry-Release und die Bereinigung des Serverrepositories
sind nicht Teil dieses Implementierungsauftrags.
