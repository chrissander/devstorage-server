# Kickstart: eigenständige Dev-Storage-CLI

Stand: 3. Oktober 2026. Dieses Übergabepaket beschreibt die Auslagerung der
vorhandenen CLI aus `devstorage-server` in ein eigenes Repository und npm-Paket.
Es enthält den Arbeitsauftrag, technische Entscheidungen und Quellcode als
Referenz. Es ist **noch kein fertig ausgelagertes oder veröffentlichtes Paket**.
Die Serverimplementierung wurde durch dieses Paket nicht verändert.

## In einem leeren Projekt starten

1. Den **gesamten Ordner `cli-kickstart`** in die Wurzel des neuen, leeren
   Projekts kopieren. Der Einstieg liegt dann unter `cli-kickstart/README.md`.
2. Dem ausführenden LLM den Auftrag aus [START-PROMPT.md](START-PROMPT.md) geben.
3. Das LLM erstellt das eigentliche npm-Paket in der Projektwurzel neben diesem
   Ordner. `reference/` bleibt als eingefrorene Vergleichsbasis erhalten.
4. Paketname, Veröffentlichungsziel und Lizenz vor einer Veröffentlichung
   festlegen. Installationen und Veröffentlichung führt der Betreiber aus.

Alle zur beschriebenen Auslagerung benötigten Referenzen liegen hier. Das neue
Projekt benötigt weder einen Checkout noch Zugangsdaten des Serverprojekts.
Für spätere manuelle API-Prüfungen wird eine separat laufende API benötigt.

## Lesereihenfolge

| Datei | Zweck |
| --- | --- |
| [START-PROMPT.md](START-PROMPT.md) | Direkt kopierbarer Auftrag an das LLM |
| [PLAN.md](PLAN.md) | Ziel, Architektur, Konfiguration und Paketierung |
| [IMPLEMENTATION.md](IMPLEMENTATION.md) | Konkrete Arbeitsschritte und Modulzuordnung |
| [ACCEPTANCE.md](ACCEPTANCE.md) | Fertigkriterien und manuelle Prüfung |
| [reference/api-contract.md](reference/api-contract.md) | Vollständiger API-Vertrag zum Zeitpunkt der Kopie |
| [reference/server-readme.md](reference/server-readme.md) | Aktuelles Verhalten und betriebliche Einschränkungen |
| `reference/src/` | Unveränderte Kopien der CLI und ihrer lokalen Hilfsmodule |
| `reference/scripts/check-syntax.js` | Bestehende reine Syntaxprüfung |
| `reference/server-package.json` | Abhängigkeiten und Paketdefinition des bisherigen Servers |

## Umgang mit den Referenzen

Die Referenzdateien sind bewusst kein lauffähiges Teilprojekt. Insbesondere
fehlen `storage.js` und `service.js`: Der einzige darauf zugreifende CLI-Befehl
`workspace init` soll im Server verbleiben. Nicht versuchen, diese Dateien oder
das AWS-SDK im neuen Projekt nachzurüsten.

`server-package.json` nicht als neue Paketdefinition übernehmen. Es enthält
Fastify, AWS-SDK und Validierungsbibliotheken, die die neue CLI nicht benötigt.
Die vorgeschlagene neue Paketdefinition steht in [PLAN.md](PLAN.md).

Die Kopien dokumentieren den Stand vom 3. Oktober 2026 und werden nicht
automatisch synchronisiert. Bei späteren Serveränderungen die API-Kompatibilität
erneut prüfen. Das neue Paket veröffentlicht diesen Kickstart nicht mit.
