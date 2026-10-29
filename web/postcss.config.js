import { fileURLToPath } from 'node:url'

// Vite runs with `root: 'web'`, and tailwind resolves its config from the
// process cwd unless given an explicit path. Keep both configs inside `web/`
// and point tailwind at this one so `npm run build` from the repo root works.
const config = fileURLToPath(new URL('./tailwind.config.js', import.meta.url))

export default {
  plugins: {
    tailwindcss: { config },
    autoprefixer: {},
  },
}
