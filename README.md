# gc-editor
An inventory web editor for the CS:GO and CS2 game coordinators, with support for live gives and editing `inventory.txt` without the game running.

![gc-editor skins catalogue](media/live.png)

![gc-editor skins list view](media/live-list.png)

## Requirements
- Node.js version 20+
- For CS:GO, [GT-610's csgo_gc fork](https://github.com/GT-610/csgo-gc) must be installed
- For CS2, either [programmer1o1's valve_gc](https://github.com/programmer1o1/valve_gc) (offline) or [my fork of the project](https://github.com/psi00/valve_gc/tree/integration) (includes RCON support) must be installed
- RCON enabled within `csgo_gc/config.txt` (CS:GO) or `game/csgo_gc/config.txt` (CS2)

## Games
CS:GO and CS2 can be installed side by side. gc-editor detects both Steam folders automatically, with manual overrides in the Settings tab.

## Usage
Install the latest release from the Releases tab in GitHub, or `git clone` this repository.

To run in production mode:
```bash
npm ci
npm run build
npm run build-cases # optional, grabs case and collection names for skins
npm start
```

This serves the web app on port 5174. Simply navigate to `localhost:5174` in your web browser. To configure live editing, make sure that the IP address, port, and password in the Settings tab match the RCON configuration within csgo_gc's config.

With one-time setup, gc-editor can also run fully offline. Local image caching is also supported and requires approximately 5 GB of free space.

```bash
npm run fetch-schema     # fetch JSON schema for both catalogues
npm run build-cases      # case + collection names per game
npm run prefetch-images  # optional, fetches artwork into imgs/ for CS:GO
npm run prefetch-images-cs2  # optional, fetches artwork into imgs/cs2/
```

For offline editing of `inventory.txt`, **close the game before saving changes** so it cannot overwrite your edits with its in-memory inventory.

## Custom CSS

gc-editor allows for custom CSS support. There is support for both editing `~/.gc-editor/custom.css` directly in your favourite text editor/IDE, or through the Settings menu within the app.

If a theme breaks the layout, open the app with `?safe=1` and clear the sheet in Settings. You can also restore a previous backup (`.bak` which will be located in the same directory as the CSS file itself).

## Screenshots
![gc-editor skins config menu](media/configurator.png)

![gc-editor inventory editor menu](media/editor.png)

![gc-editor inventory viewer](media/offline.png)

![gc-editor inventory list view](media/offline-list.png)

![gc-editor inventory bulk selection](media/selection.png)

## AI usage disclaimer
This project was fully vibecoded in an afternoon using a mixture of Kimi K3.1 Pro (frontend) and Deepseek V4.1 Flash (backend). This code hasn't been rigorously tested and was meant for personal use, but I have decided to publish it anyway. I may decide to maintain code in the near future, but it's not a guarantee. Feel free to fork and fix any mistakes I've inevitably made.
