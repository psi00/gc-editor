/**
 * The `:root` block of web/src/styles.css, as a display list for the Custom CSS
 * panel. The stylesheet stays the single source of truth — this only mirrors the
 * names and defaults so a user can retheme without reading the source. Keep it
 * in sync when a token is added there.
 */
export type ThemeToken = { name: string; value: string; note: string }

export const THEME_TOKENS: ThemeToken[] = [
  { name: '--background', value: '223 14% 10%', note: 'page behind everything' },
  { name: '--foreground', value: '223 17% 92%', note: 'body text' },
  { name: '--card', value: '223 14% 12%', note: 'panels, cards, dialogs' },
  { name: '--card-foreground', value: '223 17% 92%', note: 'text on --card' },
  { name: '--card-hover', value: '222 13% 16%', note: 'hovered card, toast' },
  { name: '--surface-raised', value: '223 14% 20%', note: 'active nav pill, hover border' },
  { name: '--surface-raised-hover', value: '225 14% 24%', note: 'pressed nav pill' },
  { name: '--surface-sunken', value: '224 15% 9%', note: 'log wells, sticker slots' },
  { name: '--primary', value: '216 100% 57%', note: 'selection and the one main action' },
  { name: '--primary-foreground', value: '0 0% 100%', note: 'text on --primary' },
  { name: '--primary-soft', value: '218 100% 78%', note: 'accent text (name tags)' },
  { name: '--primary-hover', value: '216 100% 65%', note: 'hovered main action' },
  { name: '--muted', value: '222 13% 16%', note: 'muted fill' },
  { name: '--muted-foreground', value: '212 11% 66%', note: 'secondary text' },
  { name: '--border', value: '222 14% 20%', note: 'default border colour' },
  { name: '--input', value: '222 14% 20%', note: 'field border' },
  { name: '--ok', value: '142 71% 45%', note: 'success' },
  { name: '--ok-soft', value: '140 68% 62%', note: 'success text' },
  { name: '--warn', value: '42 100% 50%', note: 'warning' },
  { name: '--warn-soft', value: '42 100% 65%', note: 'warning text' },
  { name: '--err', value: '4 90% 58%', note: 'failure' },
  { name: '--err-soft', value: '5 100% 75%', note: 'failure text' },
  { name: '--err-strong', value: '359 74% 53%', note: 'invalid field border' },
  { name: '--scrollbar', value: '0 0% 19%', note: 'scrollbar thumb' },
  { name: '--edge', value: '0 0% 100%', note: 'every hairline and faint fill (alpha at use)' },
  { name: '--well', value: '0 0% 0%', note: 'every inset well and shadow (alpha at use)' },
  { name: '--topbar', value: '223 14% 10%', note: 'sticky header, shown at 92%' },
]
