/**
 * Plain-language hints for the GC replies we actually see. The reply itself
 * is always shown verbatim elsewhere; this only annotates it.
 */
export function rconHint(raw: string) {
  const text = String(raw || '')
  if (/auth/i.test(text)) return 'The password was rejected. An empty password in csgo_gc/config.txt accepts anything; the GC reads config at load, so restart the game after edits.'
  if (/no client gc/i.test(text)) return 'Auth worked but no client GC is registered. Start the game through the launcher so the GC attaches, not just the server.'
  if (/timeout/i.test(text)) return 'The connection timed out. Is the game running and rcon enabled?'
  if (/econnrefused/i.test(text)) return 'Check the game is running and the rcon port matches.'
  if (/^ok pong/i.test(text)) return 'Transport is healthy: the GC answered ping.'
  if (/^ok/i.test(text)) return 'The GC answered the command.'
  return 'Check the host, port, password, and that the game is running.'
}
