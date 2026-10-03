# Beispieldaten

- `notes.json`: freie JSON-Inhalte ohne Schema.
- `profile.json`: Profildaten mit dem zugehörigen Schema `profile.schema.json`.
- `pages/home.json`: JSON-Inhalte in einem automatisch angelegten Unterordner.

`profile.schema.json` wird automatisch `profile.json` zugeordnet. Die API
leitet diese Verbindung ausschließlich aus dem Namen und demselben Ordner ab.
`notes.json` hat kein zugehöriges Schema.

Für die Unterordner-Datei beim Upload `filename: "pages/home.json"` setzen.
Der Ordner wird durch die API automatisch beim Speichern angelegt.
Lesen über `GET /v1/projects/test/files/pages/home.json`.

Diese README ist ebenfalls eine Inhaltsdatei und wird mit übertragen:

```bash
npm run cli -- projects push test
npm run cli -- projects pull test
```

Das Online-Projekt `test` muss vorher angelegt sein. Push ersetzt dessen
gesamten Dateibestand, Pull den gesamten lokalen Ordner `projects/test`.
