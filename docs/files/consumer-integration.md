# Consumer-Integration

Ein Consumer ist ein separates Projekt, das die Dev-Storage-API nutzt.
Ladefunktionen und die Umschaltung zwischen lokalen und Remote-Dateien bleiben
Aufgabe des Consumers. Dev Storage liefert jetzt selbst Datei-CRUD und
Push/Pull in der CLI; eigene Upload-/Download-Skripte sind optional.

## Lokale Daten

Dateien beliebiger Typen liegen beispielsweise unter `data/`, einschließlich
Unterordnern. JSON-Inhalte können durch eine benachbarte Datei mit passendem
Namen validiert werden: `pages/home.schema.json` gehört zu `pages/home.json`.
Es gibt keine lokale Metadatei und keine manuelle Schema-Zuordnung.

## Übertragung

```bash
dev-storage projects push example --dir ./data
dev-storage projects pull example --dir ./data
```

Das Online-Projekt muss vorher angelegt sein. Push ersetzt dessen vollständigen
Dateibestand einschließlich Schemas; Pull ersetzt den gesamten lokalen
Zielordner. Auch README-Dateien, Bilder und PDFs werden übertragen. Dateibytes
bleiben erhalten. Interne Metadaten und Tokens werden nicht synchronisiert.
Freigaben und Titel vorhandener Dateipfade bleiben beim Push serverseitig
bestehen, neue Dateien sind privat. Ein Schema gilt durch seinen Namen.

Die CLI benötigt `DEV_STORAGE_API_URL` und ihr bisheriges Aufrufer-Credential
`DEV_STORAGE_ADMIN_TOKEN`. Die API akzeptiert für Dateioperationen auch einen
passenden Projekt-Token. Im Consumer werden Tokens nur dort hinterlegt, wo die
entsprechenden Zugriffsrechte beabsichtigt sind.

## API-Verwendung

Relative Dateipfade vollständig URL-kodieren. GET liefert Dateibytes und einen
ETag; PUT sendet Dateibytes und benötigt `If-Match`. DELETE benötigt ebenfalls
die aktuelle Revision. Bei `412` erneut lesen und über die Änderung entscheiden.
Öffentliche Dateien werden über `/v1/public/:projectId/:filename` ohne Token
geladen. Die Freigabe wird für jeden Aufruf geprüft. Browserzugriffe werden
über CORS unterstützt.

Das vollständige Push-Paket darf einschließlich Base64 höchstens 16 MiB groß
sein. Die API veröffentlicht einen geprüften neuen Bestand in einer gemeinsamen
Metadatenänderung. Die Grenzen des gewählten Hostings gelten zusätzlich.
Details und Fehlerfälle stehen in der [Haupt-Spec](../doc.md) und der
[Einrichtungsanleitung](../../README.md).

Ein späterer Editor bleibt ein separates Vorhaben; siehe
[Editor-Idee](./editor-idee.md).
