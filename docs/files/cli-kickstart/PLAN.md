# Ziel und Architektur

## Ergebnis

Ein eigenes Repository liefert ein kleines npm-Paket, das in beliebigen
Projekten als Entwicklungsabhängigkeit installiert werden kann. Der Befehl
bleibt `dev-storage`. Er kommuniziert mit einem unabhängig betriebenen
Dev-Storage-Server; eine Installation startet oder installiert keinen Server.
Node.js ab Version 22 und eine kompatible API sind erforderlich.

Nach Veröffentlichung wäre die Verwendung beispielsweise:

```bash
npm install --save-dev @DEIN-SCOPE/devstorage-cli
npx dev-storage projects list
npx dev-storage projects push example --dir ./data
npx dev-storage projects pull example --dir ./data
```

`@DEIN-SCOPE/devstorage-cli` ist ein Platzhalter, kein bereits existierendes
Paket. Die Installation übernimmt der Betreiber. Optional kann er global
installieren; die lokale Installation hält die CLI-Version je Projekt fest.
Das Zielprojekt muss kein bestimmtes Framework verwenden.

## Abgrenzung zum Server

Alle bisherigen API-Kommandos wandern in das neue Paket:

```text
dev-storage admin rotate-token
dev-storage projects list
dev-storage projects create <projectId>
dev-storage projects delete <projectId> [--confirm <projectId>]
dev-storage projects rotate-token <projectId>
dev-storage files create <projectId> <dateipfad> <lokale-datei>
dev-storage files read <projectId> <dateipfad> [--output <lokale-datei>]
dev-storage files update <projectId> <dateipfad> <lokale-datei>
dev-storage files delete <projectId> <dateipfad>
dev-storage projects push <projectId> [--dir <ordner>]
dev-storage projects pull <projectId> [--dir <ordner>]
```

`workspace init` bleibt im Serverrepository, weil es unmittelbar auf S3
zugreift. Eine unbekannte Anforderung dieses Befehls im neuen Paket soll ohne
Netzwerkzugriff mit einer verständlichen Meldung auf das Server-Setup verweisen.
Der Server muss für die erste CLI-Version nicht geändert werden. Seine bisherige
CLI kann übergangsweise parallel bestehen bleiben. Deren spätere Entfernung
und die Aktualisierung der Serverdokumentation sind eine getrennte Aufgabe.

## Konfiguration

Bestehende Namen bleiben erhalten:

| Variable | Bedeutung |
| --- | --- |
| `DEV_STORAGE_API_URL` | API-Basis-URL ohne `/v1` |
| `DEV_STORAGE_ADMIN_TOKEN` | Credential für die bisherigen administrativen CLI-Aufrufe |

Der Name des Tokens und die Berechtigungen werden in dieser Auslagerung nicht
umgestaltet. Projekt-Tokens sind kein pauschaler Ersatz für Admin-Tokens;
maßgeblich ist der mitgelieferte API-Vertrag.

Neu: Die CLI lädt bei API-Kommandos die optionale `.env` im **aktuellen
Arbeitsverzeichnis** selbst. Dafür die eingebaute Node-Funktion `loadEnvFile`
aus `node:process` nutzen; kein dotenv-Paket erforderlich. Bestehende
Umgebungsvariablen haben Vorrang. Nur eine tatsächlich fehlende Datei (`ENOENT`)
darf ignoriert werden; andere Ladefehler verständlich melden. Nicht im
Installationsverzeichnis oder rekursiv in Elternverzeichnissen nach `.env`
suchen. Hilfe und ungültige Befehle ohne Konfiguration und Netzwerk bearbeiten.

Dateipfade und `--dir` beziehen sich weiter auf das Arbeitsverzeichnis.
Ohne `--dir` bleibt `projects/<projectId>` erhalten. Keine neue Projektdatei,
kein Login-Assistent und keine automatische Auswahl eines Projekts in Version 1.

## npm-Paket

Die neue `package.json` kann so beginnen:

```json
{
  "name": "devstorage-cli-placeholder",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "CLI for the Dev Storage HTTP API",
  "engines": { "node": ">=22" },
  "bin": { "dev-storage": "./src/cli.js" },
  "files": ["src/", "README.md", ".env.example"],
  "scripts": {
    "cli": "node src/cli.js",
    "check": "node scripts/check-syntax.js"
  }
}
```

Keine externen Runtime-Abhängigkeiten, kein Build und keine Installations-Hooks.
Die Shebang `#!/usr/bin/env node` in `src/cli.js` beibehalten und unter Linux
das ausführbare Dateibit setzen. `files` begrenzt die Veröffentlichung;
Kickstart, Referenzquellen, lokale Daten und echte `.env` gehören nicht hinein.
README und Paketmetadaten werden von npm teilweise automatisch eingeschlossen.
Vor Release deshalb die tatsächliche Dateiliste des Pakets kontrollieren.

Vor Veröffentlichung den endgültigen verfügbaren Paketnamen, Repository-URL,
Lizenz und öffentliche/private Registry-Sichtbarkeit bestimmen. Erst dann
`private: true` entfernen. Ein privates Git-Repository und ein privates
Registry-Paket sind unterschiedliche Entscheidungen; `private: true` verhindert
das Veröffentlichen des npm-Pakets vollständig.

Versionen der CLI unabhängig vom Server vergeben und die unterstützte
`/v1`-API dokumentieren. Eine neue CLI-Version nicht automatisch mit einer
neuen Serverversion gleichsetzen. Keine automatischen Self-Updates.

## Unveränderte, wesentliche Semantik

- Datei-Inhalte bleiben Bytes. Uploads als Base64-JSON beziehungsweise bei
  Update als `application/octet-stream`; Downloads unverändert schreiben.
- `*.schema.json` nutzt die Schema-Routen. Verschachtelte Remote-Dateinamen
  inklusive Slashes als ein Pfadparameter mit `encodeURIComponent` kodieren.
- Vor Update/Delete Listen-ETag lesen; vor Push Snapshot-ETag lesen. Bei
  Änderungen `If-Match` senden. Konflikte nicht automatisch überschreiben.
- Push ersetzt den vollständigen Online-Bestand; Pull den vollständigen
  lokalen Zielordner. Kein Merge, keine `.gitignore`-Filterung. Einen eigenen
  Datenordner verwenden; Pull darf nicht die Projektwurzel ersetzen.
- 16 MiB gelten für das kodierte Request-Paket inklusive Base64-Aufschlag.
- Pfadprüfung, Symlink-Abweisung, Pull-Sperre, temporärer Nachbarordner und
  Wiederherstellung des Backups beim fehlgeschlagenen Austausch bleiben erhalten.
- Projektlöschung benötigt den exakten Projektnamen als Bestätigung; ohne
  interaktives Terminal ist `--confirm` erforderlich.
- Keine automatischen Wiederholungen mutierender Requests. Nach Timeout kann
  die Operation bereits erfolgt sein, insbesondere eine Token-Rotation.
- Exit-Code 0 bei Erfolg, 1 bei Fehler/Abbruch. Datei-Bytes beziehungsweise
  JSON-Ergebnisse auf stdout, Datei-Statusmeldungen und Fehler auf stderr.
  Token-Antworten nur bei bewusst aufgerufener erfolgreicher Anlage/Rotation.
