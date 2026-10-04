import { CHARACTER_APPEARANCES } from '@piko/shared'
import { decodeCharacterAtlas, getCharacterPortraitBounds } from './characterAtlas'

export type CharacterDirectionSprites = ReturnType<typeof decodeCharacterAtlas>
type LoadedCharacter = CharacterDirectionSprites & { portrait: HTMLCanvasElement }

// Avatars and the office share requests, but neither depends on the other's mount.
const characters = new Map<number, Promise<LoadedCharacter>>()

async function readCharacter(asset: string): Promise<LoadedCharacter> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    const finish = (error?: Error) => {
      clearTimeout(timeout)
      img.onload = null
      img.onerror = null
      if (error) reject(error)
      else resolve(img)
    }
    const timeout = setTimeout(() => finish(new Error(`Character image timed out: ${asset}`)), 15_000)
    img.onload = () => finish()
    img.onerror = () => finish(new Error(`Character image failed to load: ${asset}`))
    img.src = asset
  })
  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Character image canvas unavailable')
  context.drawImage(image, 0, 0)
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height)
  const sprites = decodeCharacterAtlas(pixels)
  const bounds = getCharacterPortraitBounds(pixels)
  const portrait = document.createElement('canvas')
  const unit = Math.ceil(Math.max(bounds.width / 14, bounds.height / 29))
  portrait.width = 16 * unit
  portrait.height = 32 * unit
  const portraitContext = portrait.getContext('2d')
  if (!portraitContext) throw new Error('Character portrait canvas unavailable')
  // Copy original pixels 1:1. Only add transparent padding for the avatar slot;
  // reducing to the engine's 16 × 32 grid here destroys faces and clothing details.
  portraitContext.drawImage(image, bounds.left, bounds.top, bounds.width, bounds.height,
    Math.floor((portrait.width - bounds.width) / 2), portrait.height - bounds.height,
    bounds.width, bounds.height)
  return { ...sprites, portrait }
}

export function loadCharacterSprite(palette: number): Promise<LoadedCharacter> {
  const count = CHARACTER_APPEARANCES.length
  const index = Number.isFinite(palette) ? ((Math.trunc(palette) % count) + count) % count : 0
  const cached = characters.get(index)
  if (cached) return cached
  const request = readCharacter(CHARACTER_APPEARANCES[index].asset).catch(error => {
    // A temporary failure must not poison future mounts or another member's avatar.
    characters.delete(index)
    throw error
  })
  characters.set(index, request)
  return request
}

export function loadCharacterSprites(): Promise<CharacterDirectionSprites[]> {
  return Promise.all(CHARACTER_APPEARANCES.map((_, index) => loadCharacterSprite(index)))
}
