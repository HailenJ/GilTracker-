# Gil Ledger

What to craft, gather and sell on your FFXIV world today, with live Universalis prices.

## Files
- `index.html`, `app.css`, `app.js` – the app
- `data/game.json` – game data (recipes, nodes, vendors, collectables, leves, GC turn-ins). Rebuilt nightly by GitHub Actions.
- `data/strategies.json` – the researched playbook and event calendar. Ask Claude to refresh it.
- `vendor/sim.js` – Teamcraft's open-source crafting simulator (MIT, see `vendor/LICENSE-teamcraft-simulator.txt`); `vendor/solver.js` finds rotations with it.
- `sw.js`, `manifest.webmanifest`, `icons/` – home-screen app and offline support
- `tools/build_data.py` – builds `data/game.json` from https://github.com/xivapi/ffxiv-datamining
- `.github/workflows/update-data.yml` – the nightly job

## One-time setup
1. Upload everything in this folder to the repository root (keep the folders).
2. Settings → Actions → General → Workflow permissions → **Read and write permissions** → Save.
3. Actions tab → **Update game data** → **Run workflow** once to check it works.
