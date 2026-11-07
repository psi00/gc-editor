import test from 'node:test'
import assert from 'node:assert/strict'
import { buildGiveCommand } from '../server/rcon.js'

test('buildGiveCommand minimal weapon tokens', () => {
  const command = buildGiveCommand({ def_index: 7, paint: 44, wear: 0.15, seed: 661 })
  console.log(command)
  assert.equal(command, 'give_item 7 paint=44 seed=661 wear=0.15')
})

test('buildGiveCommand every optional field in wire order', () => {
  const command = buildGiveCommand({
    def_index: 7,
    count: 3,
    level: 5,
    quality: 4,
    rarity: 6,
    name: 'a "quote" \\ name',
    paint: 44,
    seed: 661,
    wear: 0.15,
    stattrak: 404,
    music: 3,
    keychain: 12,
    spray_color: 1,
    spray_remaining: 2,
    tournament_event: 3,
    tournament_stage: 4,
    tournament_team0: 5,
    tournament_team1: 6,
    tournament_mvp: 7,
    stickers: [{ id: 37, wear: 0.1, scale: 0.2, rotation: 90 }, { id: 38 }],
  })
  console.log(command)
  assert.equal(
    command,
    String.raw`give_item 7 3 level=5 quality=4 rarity=6 name="a \"quote\" \\ name" paint=44 seed=661 wear=0.15 stattrak=404 music=3 keychain=12 spray_color=1 spray_remaining=2 tournament_event=3 tournament_stage=4 tournament_team0=5 tournament_team1=6 tournament_mvp=7 sticker0=37 sticker0_wear=0.1 sticker0_scale=0.2 sticker0_rotation=90 sticker1=38`,
  )
})

test('buildGiveCommand keeps sticker slot indices when entries are sparse', () => {
  const command = buildGiveCommand({
    def_index: 9,
    paint: 344,
    stickers: [null, { id: 37 }, { id: 38, wear: 0.2 }],
  })
  console.log(command)
  assert.equal(command, 'give_item 9 paint=344 sticker1=37 sticker2=38 sticker2_wear=0.2')
})

test('buildGiveCommand quotes a name with a double quote as one argument', () => {
  const command = buildGiveCommand({ def_index: 7, name: 'say "hi"' })
  console.log(command)
  assert.equal(command, String.raw`give_item 7 name="say \"hi\""`)
})

test('buildGiveCommand wear 1e-7', () => {
  const command = buildGiveCommand({ def_index: 7, paint: 44, wear: 1e-7 })
  console.log(command)
  assert.equal(command, 'give_item 7 paint=44 wear=1e-7')
})

test('buildGiveCommand count level quality rarity passthrough', () => {
  const command = buildGiveCommand({ def_index: 7, count: 2, level: 1, quality: 9, rarity: 6 })
  console.log(command)
  assert.equal(command, 'give_item 7 2 level=1 quality=9 rarity=6')
})
