import { createAvatar } from '@dicebear/core'
import type { Style } from '@dicebear/core'
import * as adventurer from '@dicebear/adventurer'
import * as avataaars from '@dicebear/avataaars'
import * as bigSmile from '@dicebear/big-smile'
import * as funEmoji from '@dicebear/fun-emoji'
import * as lorelei from '@dicebear/lorelei'
import * as micah from '@dicebear/micah'
import * as notionists from '@dicebear/notionists'
import * as personas from '@dicebear/personas'
import * as pixelArt from '@dicebear/pixel-art'
import {
  getProfileAvatarPreset,
  type CartoonAvatarStyleId,
} from '../data/profileAvatarPresets'

const styleModules: Record<CartoonAvatarStyleId, Style<Record<string, unknown>>> = {
  avataaars,
  adventurer,
  bigSmile,
  funEmoji,
  lorelei,
  micah,
  notionists,
  personas,
  pixelArt,
}

export function createCartoonAvatarDataUri(
  presetId: string | null | undefined,
  sizePx: number,
): string | null {
  const preset = getProfileAvatarPreset(presetId)
  if (!preset) return null
  const style = styleModules[preset.style]
  if (!style) return null
  return createAvatar(style, {
    seed: preset.seed,
    size: sizePx,
    backgroundColor: ['f5f3ff', 'ede9fe', 'e0e7ff', 'dbeafe', 'd1fae5'],
  }).toDataUri()
}
