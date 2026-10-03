# Auftrag für das LLM im neuen Projekt

Den folgenden Text als ersten Arbeitsauftrag verwenden:

---

Implementiere in diesem leeren Projekt eine eigenständige Dev-Storage-CLI als
npm-Paket. Lies zuerst `cli-kickstart/README.md`, danach `PLAN.md`,
`IMPLEMENTATION.md`, `ACCEPTANCE.md` und die benötigten Referenzen im selben
Ordner. Dieses Paket enthält den bisherigen Code und den API-Vertrag; Zugriff
auf das alte Serverrepository ist nicht erforderlich.

Erstelle das neue Paket in der Projektwurzel, nicht innerhalb des Kickstarts.
Übernimm und entkopple die vorhandene Implementierung. Bewahre die bestehenden
Befehle und ihre Semantik mit der ausdrücklich geplanten Ausnahme:
`workspace init` bleibt beim Server und entfällt hier. Die neue CLI verwendet
ausschließlich die HTTP-API und benötigt keine S3-Konfiguration oder externen
Laufzeitabhängigkeiten. Ergänze das in `PLAN.md` beschriebene Laden der `.env`.

Arbeite bis zu einem lokal vorbereiteten, dokumentierten Paket. Verwende für
den noch unentschiedenen Paketnamen vorläufig `devstorage-cli-placeholder` und
lasse `private: true` gesetzt. Der ausführbare Befehl heißt `dev-storage`.
Name, Registry, Sichtbarkeit und Lizenz sind vor einer Veröffentlichung mit
dem Betreiber zu klären, blockieren aber nicht die Implementierung.

Arbeitsregeln:

- Hauptumgebung ist WSL unter `/home/cs/projects`; Windows-Zugriff erfolgt
  gegebenenfalls über `\\wsl.localhost\Ubuntu\home\cs\projects`.
- Kein `npm install`, `npm add` und keine Migrationen ausführen. Benötigte
  Installationsschritte dem Betreiber nennen.
- Keine Tests oder Testsuite anlegen, sofern der Betreiber dies nicht verlangt.
  Syntaxprüfung und ungefährliche lokale CLI-Aufrufe sind vorgesehen.
- Keine Veröffentlichung, Token-Rotation, Löschung oder Push/Pull gegen eine
  echte API zur bloßen Verifikation ausführen. Die Live-Prüfschritte dokumentieren.
- Keine Zugangsdaten erfinden, kopieren oder einchecken. `.env.example` enthält
  ausschließlich Beispielwerte.
- Kein Server, AWS-SDK, neues Authentifizierungssystem, MCP-Server oder UI bauen.
- Die Referenzkopien nicht ändern. Alle Implementierungsdateien neu in der
  Projektwurzel anlegen und dort bearbeiten.

Gib zum Abschluss an, was umgesetzt und geprüft wurde, was noch nicht geprüft
werden konnte und welche konkreten Schritte der Betreiber für Installation
und Veröffentlichung übernehmen muss.

---
