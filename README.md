# gc-editor
An inventory web editor for [GT-610's csgo_gc](https://github.com/GT-610/csgo-gc), with support for live gives and editing `inventory.txt` without the game running.

![gc-editor skins catalogue](media/live.png)

![gc-editor skins list view](media/live-list.png)

## Requirements
- Node.js version 20+
- For live editing, [GT-610's csgo_gc fork](https://github.com/GT-610/csgo-gc)
- RCON enabled within `csgo_gc/config.txt` in your game installation

## Usage
Install the latest release from the Releases tab in GitHub, or `git clone` this repository.

To run in production mode:
```bash
npm ci
npm run build
npm run build-cases # optional, grabs case names for skins from items_game.txt
npm start
```

This serves the web app on port 5174. Simply navigate to `localhost:5174` in your web browser. To configure live editing, make sure that the IP address, port, and password in the Settings tab match the RCON configuration within csgo_gc's config.

With one-time setup, gc-editor can also run fully offline. Local image caching is also supported and requires approximately 5 GB of free space to store images for all CS:GO items.

```bash
npm run fetch-schema     # JSON schema for catalogue
npm run prefetch-images  # optional, fetches artwork, ~29,000 files saved to imgs/...
```

For offline editing of `inventory.txt`, **close the game before saving changes** so it cannot overwrite your edits with its in-memory inventory.

## Screenshots
![gc-editor skins config menu](media/configurator.png)

![gc-editor inventory editor menu](media/editor.png)

![gc-editor inventory viewer](media/offline.png)

![gc-editor inventory list view](media/offline-list.png)

![gc-editor inventory bulk selection](media/selection.png)

## AI usage disclaimer
This project was fully vibecoded in an afternoon using a mixture of Kimi K3.1 Pro (frontend) and Deepseek V4.1 Flash (backend). This code hasn't been rigorously tested and was meant for personal use, but I have decided to publish it anyway. I may decide to maintain code in the near future, but it's not a guarantee. Feel free to fork and fix any mistakes I've inevitably made.
