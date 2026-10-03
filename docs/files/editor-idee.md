# Idee: Separater Editor für Dev Storage

Dieses Dokument skizziert einen möglichen separaten Editor, der die API von
Dev Storage als Client nutzt. Dev Storage stellt projektbezogene JSON-Dateien
und optionale JSON-Schemas bereit und validiert Änderungen beim Speichern.
Die folgenden Ideen sind für ein späteres Editor-Vorhaben festgehalten. Sie sind keine Lieferanforderungen an Dev Storage und werden
nicht in dessen Repository implementiert:

- Ein erster Editor könnte manuell als eigene Route in einem konkreten
  Consumer (beispielsweise einem Next.js-Projekt) entstehen und Dev Storage
  über die API nutzen.
- Für schema-basierte Formulare ist **React JSON Schema Form (RJSF)** vorgesehen.
  Der Entwickler legt JSON-Schemas und UI-Konfiguration einschließlich der
  Eingabekomponenten fest, etwa einzeilige Input-Felder und mehrzeilige
  Textfelder. Kunden bearbeiten die Inhalte.
- Ein einfacher vorhandener Markdown-Editor soll Fettschrift, Links und Listen
  unterstützen. Markdown wird als Inhalt in den JSON-Dateien gespeichert.
- Später könnte der Editor als eigenständiges npm-Paket nachinstallierbar sein.

[RJSF](https://rjsf-team.github.io/react-jsonschema-form/docs/quickstart/)
verwendet JSON Schema für Formulare und kann durch ein `uiSchema` für die
Darstellung ergänzt werden. Es bietet mit `@rjsf/validator-ajv8` einen
AJV-basierten Validator. Diese Bibliothekswahl betrifft ausschließlich den
separaten Editor.

Für dieses spätere Vorhaben bleiben die Bearbeitung von JSON ohne Schema,
die Markdown-Bibliothek, die Absicherung der Editor-Route und die
Benutzerführung bei Speicherkonflikten offen. Auch die Ablage, Zuordnung und
Auslieferung optionaler UI-Schemas ist für eine solche Integration noch zu
klären; eine Formularinterpretation durch Dev Storage ist nicht vorgesehen.
