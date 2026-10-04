import type { SpriteData } from '../types'

export interface CharacterAtlasPixels {
  width: number
  height: number
  data: Uint8Array | Uint8ClampedArray
}

const ALPHA_THRESHOLD = 128
const FRAME_WIDTH = 16
const FRAME_HEIGHT = 32

function frameBounds(image: CharacterAtlasPixels, col: number, row: number) {
  const x0 = Math.round(col * image.width / 7), x1 = Math.round((col + 1) * image.width / 7)
  const y0 = Math.round(row * image.height / 3), y1 = Math.round((row + 1) * image.height / 3)
  let left = x1, top = y1, right = x0 - 1, bottom = y0 - 1
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    if (image.data[(y * image.width + x) * 4 + 3] < ALPHA_THRESHOLD) continue
    left = Math.min(left, x); right = Math.max(right, x)
    top = Math.min(top, y); bottom = Math.max(bottom, y)
  }
  if (right < left || bottom < top) throw new Error(`Empty character frame ${col},${row}`)
  return { left, top, width: right - left + 1, height: bottom - top + 1 }
}

/** Standing portrait in the original atlas, before the game's 16 × 32 reduction. */
export function getCharacterPortraitBounds(image: CharacterAtlasPixels) {
  return frameBounds(image, 0, 0)
}

/** Decode a transparent 7 × 3 atlas into the engine's small, pixel-aligned frames.
 * The original PNG stays intact. All poses share a scale and a bottom baseline.
 */
export function decodeCharacterAtlas(image: CharacterAtlasPixels): { down: SpriteData[]; up: SpriteData[]; right: SpriteData[] } {
  if (image.width < 7 || image.height < 3 || image.data.length !== image.width * image.height * 4) {
    throw new Error('Invalid character atlas dimensions')
  }
  const frames = []
  for (let row = 0; row < 3; row++) for (let col = 0; col < 7; col++) {
    frames.push(frameBounds(image, col, row))
  }
  const scale = Math.min(14 / Math.max(...frames.map(f => f.width)), 29 / Math.max(...frames.map(f => f.height)))
  const sprites = frames.map(frame => {
    const width = Math.max(1, Math.round(frame.width * scale)), height = Math.max(1, Math.round(frame.height * scale))
    const offsetX = Math.floor((FRAME_WIDTH - width) / 2), offsetY = FRAME_HEIGHT - height
    const sprite: SpriteData = Array.from({ length: FRAME_HEIGHT }, () => Array(FRAME_WIDTH).fill(''))
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const sx = frame.left + Math.min(frame.width - 1, Math.floor((x + 0.5) * frame.width / width))
      const sy = frame.top + Math.min(frame.height - 1, Math.floor((y + 0.5) * frame.height / height))
      const index = (sy * image.width + sx) * 4
      if (image.data[index + 3] < ALPHA_THRESHOLD) continue
      sprite[offsetY + y][offsetX + x] = '#' + [image.data[index], image.data[index + 1], image.data[index + 2]]
        .map(channel => channel.toString(16).padStart(2, '0')).join('').toUpperCase()
    }
    return sprite
  })
  // Engine order is step A, idle, step B, work A/B, read A/B.
  const order = [1, 0, 2, 3, 4, 5, 6]
  const row = (index: number) => order.map(frame => sprites[index * 7 + frame])
  const up = row(1)
  // A book held in front is occluded in the rear view.
  up[5] = up[3]; up[6] = up[4]
  return { down: row(0), up, right: row(2) }
}
