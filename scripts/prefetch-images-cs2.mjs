// CS2-only artwork: reads data/cs2/inventory.en.json and writes imgs/cs2/.
// CS:GO uses prefetch-images (imgs/). never fetched at runtime; a missing file
// falls back to the placeholder.
//
// usage: npm run prefetch-images-cs2 [-- --conc=16 --only=skins,stickers --limit=500]
import { prefetchGame } from './prefetch-images.mjs'

const result = await prefetchGame('cs2')
if (result.processed === 0 && result.skipped === 0) {
  console.error('nothing prefetched - run npm run fetch-schema first')
  process.exit(1)
}
