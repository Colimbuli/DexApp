# Kartenscanner (PWA)

Pokémon-Karten (deutsch und englisch) scannen, bewerten und in einer lokalen Sammlung verwalten.

## Starten
```
npm install
npm run dev      # Entwicklung, http://localhost:5173
npm run build && npm run preview
npm test
```
Kamera und PIN-Hash brauchen HTTPS oder localhost. Fürs Handy die gebaute App über HTTPS hosten
(z. B. GitHub Pages, Netlify) und „Zum Startbildschirm hinzufügen“.

## Funktionsweise
- **Scan:** Karte im Rahmen aufnehmen → Tesseract.js (OCR, `deu+eng`) liest Namen (oben) und Sammlernummer (unten) → Treffer über die TCGdex-API (deutscher und englischer Katalog, wählbar) → Auswahl bestätigen.
- **Preis:** Cardmarket-Trendpreis (EUR) aus TCGdex, mit Zustandsfaktor (siehe `src/pricing.ts`) – grobe Schätzung. Der Preis gilt pro Karte, nicht pro Sprache: DE und EN erhalten denselben Wert.
- **Daten:** IndexedDB im Browser, mehrere lokale Profile, optionale PIN (kein Verschlüsselungsschutz). Backup/Restore als JSON, Export als CSV.
- Scan und Suche brauchen Internet; die Sammlung ist offline nutzbar.

## Grenzen
- OCR-Treffer immer prüfen; Holo-Reflexe und schlechtes Licht stören.
- Browserdaten können verloren gehen → Backups speichern.
