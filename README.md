# The Post-Snap — Matchups

The page and data behind https://thepostsnap.com/matchups.

- `index.html` — the matchup board. It loads its data from `/api/matchups-data`.
- `data.json` — every FBS team's most-snapped players (PFF snap counts) with their original high-school recruiting ratings from 247Sports, 247 Composite, On3, On3 Industry, ESPN and Rivals, season results, the projection model, CFP/AP/Coaches ranks and committed 2027 classes.

The site's edge function reads both files from this repository, so a push here updates the live page within a few minutes. Rebuilt weekly after PFF refreshes snap counts.

Snap counts: PFF. Results, SP+, FPI, Elo and 247 Composite: CollegeFootballData.
