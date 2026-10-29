# gc-editor agent instructions

gc-editor is a local inventory workbench for the GT-610 fork of csgo_gc. It has
a zero-dependency Node HTTP backend in `server/` and a React single-page app in
`web/`. It has no lint. Verify changes with `npm test`, `npx tsc --noemit`, and
`npm run build`; CI runs the same commands.

## Run and verify

- Development needs **two terminals**. Run `npm run dev:server` for the API on
  port 5174, and run `npm run dev:web` for Vite on port 5173. Vite proxies `/api`
  and `/imgs`. The combined `npm run dev` chains both commands with `&`. npm runs
  Windows scripts through `cmd.exe`, so the combined command blocks on the
  server. Don't use it.
- For production, run `npm run build` and then `npm start`. The `npm start`
  command serves `dist/web` and the API on port 5174.
- `EADDRINUSE 127.0.0.1:5174` means a stale Node process is holding the port.
  Kill the Node processes and restart. Don't change the port.
- For one-time online setup, run `npm run fetch-schema` and then
  `npm run prefetch-images`. After that, the app works offline. Run
  `npm run build-cases` once to map skins to their case or collection (it reads
  the local `items_game.txt` and `csgo_english.txt` and writes
  `data/cases.json`); without it the Case field
  shows `—`. The image prefetch is resumable. A full cache contains about
  29,000 files and uses about 4 GB, so use `-- --only=skins` first. Git ignores
  `data/*.json` and `imgs/*` by design.
- For save tests, point the editor's `?path=` parameter at a **copy** of
  `inventory.txt`, never the live file.
- `npm test` uses Node's built-in test runner for VDF, inventory, and custom
  stylesheet round-trips. No extra dependencies.
- `npm run screenshots` regenerates the README images in `media/` at 1440x1080.
  It drives a local Chrome or Edge over the DevTools pipe (set `CHROME_PATH` if
  detection fails), needs `npm run build` first, and starts `node server/index.js`
  itself when nothing answers on port 5174. Gallery shots load
  `demo/inventory.txt` when present, so the README never shows a personal file.
- Commit messages must follow Conventional Commits. `commitlint` runs from the
  husky `commit-msg` hook, which `npm install` sets up through the `prepare`
  script. Use prefixes such as `fix(rcon): ...` or `ci(release): ...`.

## Project layout

- `server/` contains the whole backend, including HTTP, RCON, VDF, inventory,
  and schema code. It uses only Node builtins and has zero dependencies.
- `web/` is the only app and contains the Vite root, Tailwind config, and PostCSS
  config. `web/postcss.config.js` points Tailwind at `web/tailwind.config.js` so
  builds work from the repo root. Don't move these files.
- `.references/` is a separate design-history app with its own `node_modules`.
  Don't run it or run `npm install` in it. It is not the editor.
- `test/` holds Node's built-in tests. `media/` holds the README screenshots.
  `demo/inventory.txt` (gitignored) is a curated inventory the screenshot script
  points the gallery at; it is local-only and not shipped.

## Frozen backend contract

- Add fields only. Never rename or remove an `/api/*` path, method, or JSON
  field. The API shape is the contract.
- RCON replies are verbatim GC text starting with `OK ` or `ERR `. Transport
  failures return `{ ok: false, raw: "ERR ..." }` with HTTP 200.
- The server builds and quotes the `give_item` string for `POST /api/rcon/give`.
  It also runs `save_inventory` unless the request sets `autosave: false`.
- Keep the image URLs unchanged. Use `/imgs/skins/<weapon>_<paint>.png`, where
  `0` means vanilla, and `/imgs/<cat>/<id>.png` for everything else. A missing
  file produces a placeholder and is never fatal.
- Schema category endpoints default to 500 rows. Send `?q=` for large sets.
  Stickers have more than 11,000 rows, so never load them all.
- Always give music kits with `give_item 1314 music=<id>`. Get their art from
  `music_kits/<id>`.

## GC and RCON gotchas

- Source RCON authentication uses **two packets**. The first is an empty
  `RESPONSE_VALUE`, and the second is `AUTH_RESPONSE` with id `-1` on failure.
  `server/rcon.js` handles this. Don't simplify it.
- Empty `rcon.password` in `csgo_gc/config.txt` accepts **any** password. The GC
  reads the config at load, so restart the game after changing the RCON block.
- `ERR no client gc` means authentication succeeded, but no game client is
  registered with the GC. Start the game through the launcher. A listening server
  alone is not enough.

## inventory.txt

- `inventory.txt` uses Valve KeyValues. The parser strips a BOM and tolerates
  non-ASCII. Each overwrite copies the current file to
  `inventory.txt.<timestamp>.bak` before the atomic rename.
- When saving an `items` array, `serializeInventory` re-reads the existing file
  and merges the changes. Preserve unknown top-level sections such as
  `format_version` and `player_state`, plus per-item `equipped_state` and
  `default_equips`. Dropping them loses player progress.
- Top-level scalars must stay scalars. `serializeVdf` handles this. Treating
  every key as a block turns `format_version` into `{ "0": "1" }`.
- The UI stages single and bulk offline deletes. It does not write the file until
  you save, which also creates a backup.

## Domain facts (verified against the cache and GC data)

- **The catalog is CS:GO, not CS2.** ByMykel's upstream JSON tracks CS2, so
  `scripts/fetch-schema.mjs` filters every download through
  `scripts/csgo-whitelist.json`. The whitelist uses the final CS:GO
  `items_game.txt`, GameTracking-CSGO `e63fc7f`, item 996, and music def 70.
  Never serve raw ByMykel data. The filter drops the CS2-only `keychains`,
  `highlights`, and `sticker_slabs` categories. It leaves `graffiti` unfiltered
  because there is no comparable id namespace. Run `npm run filter-schema` to
  reapply the filter. It is idempotent and creates one `.pre-csgo.bak`.
- The attribute ids are 6 for paint, 7 for seed, 8 for wear, 80 for stattrak,
  111 for name tags, 166 for music, 113 through 136 for stickers, and 137 through
  140 and 223 for tournament attributes. See `buildGiveCommand`.
- Attributes 113 through 136 cover six sticker slots with four attributes each:
  id, wear, scale, and rotation. Slot 0 uses 113 through 116, and slot 5 uses 133
  through 136.
- Attribute 111 is a **string** name tag, and this fork writes it there.
  `custom_name` is legacy. Don't pass attribute 111 through numeric
  normalization. `quality` 9 means StatTrak, and 12 means Souvenir.
- The glove defs in the skins map are 4725, 5027, and 5030 through 5035
  (`GLOVE_DEFS`). Hand Wraps are 5032. Keep gloves out of gun and knife filters.
  Gloves take no stattrak or stickers.
- Contraband exists only as M4A4 Howl (def 16, paint 309). Derive rarity per
  weapon instead of hardcoding it globally.

## Offline name and art resolution

- Cache keys differ by category. Skins use weapon def and paint, music kits use
  music id (def 1314 and attr 166), and categories use their own def or sticker
  id. Category ids collide, so `web/src/lib/inventory-catalog.ts` resolves skins
  and music first, then a fixed category order, then exact `?q=`. Don't reduce
  this to a def lookup.
- The editor renders unresolved defs as `Item def N` and missing art as the
  placeholder. Resolution must never block the editor.

## Custom CSS

- The user stylesheet is a real file at `~/.gc-editor/custom.css`, seeded from
  `server/custom-css.js` when missing. Settings writes it through
  `POST /api/custom-css`. Don't keep a second copy in localStorage.
- `web/index.html` links `/api/custom-css.css` before React mounts. That route
  must stay `no-store` and must answer an empty 200 when the file is missing, not
  a 404.
- `?safe=1` removes the link in `main.tsx` before the first render. It is the only
  way out of a layout-breaking theme, so keep it independent of custom CSS.
- The `:root` tokens in `web/src/styles.css` are the public API; class names are
  internal. Don't put literal colors in rules or components. Add a token to
  `:root` and to `web/tailwind.config.js` instead.
- Writes are atomic with a timestamped `.bak`, like `inventory.txt`. The size cap
  is `CUSTOM_CSS_LIMIT`.

## UI conventions

- There is no router. `web/src/app.tsx` owns page state and the offline dirty-nav
  guard. Add new pages there.
- `web/src/components/ui` contains shared UI components built with Radix and cva.
  Keep the layout-heavy classes for cards, the dialog grid, the wear slider, and
  sticker slots in `web/src/styles.css` instead of using only Tailwind.
- The UI shortens rarity labels for display, using labels such as `Consumer`,
  `Industrial`, and `Mil-Spec`. Filter values still compare raw schema names.
  Don't filter on the labels.
