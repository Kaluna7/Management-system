/** DiceBear cartoon style used for each preset. */
export type CartoonAvatarStyleId =
  | 'avataaars'
  | 'adventurer'
  | 'bigSmile'
  | 'funEmoji'
  | 'lorelei'
  | 'micah'
  | 'notionists'
  | 'personas'
  | 'pixelArt'

/** Fifteen built-in cartoon avatars (ids "01"–"15"). */
export type ProfileAvatarPreset = {
  id: string
  style: CartoonAvatarStyleId
  /** Stable seed so the same preset always looks the same. */
  seed: string
  label: string
}

export const PROFILE_AVATAR_PRESETS: ProfileAvatarPreset[] = [
  { id: '01', style: 'avataaars', seed: 'whsmith-cartoon-01', label: 'Classic' },
  { id: '02', style: 'adventurer', seed: 'whsmith-cartoon-02', label: 'Explorer' },
  { id: '03', style: 'bigSmile', seed: 'whsmith-cartoon-03', label: 'Cheerful' },
  { id: '04', style: 'funEmoji', seed: 'whsmith-cartoon-04', label: 'Emoji' },
  { id: '05', style: 'lorelei', seed: 'whsmith-cartoon-05', label: 'Soft' },
  { id: '06', style: 'micah', seed: 'whsmith-cartoon-06', label: 'Sketch' },
  { id: '07', style: 'notionists', seed: 'whsmith-cartoon-07', label: 'Notion' },
  { id: '08', style: 'personas', seed: 'whsmith-cartoon-08', label: 'Persona' },
  { id: '09', style: 'pixelArt', seed: 'whsmith-cartoon-09', label: 'Pixel' },
  { id: '10', style: 'avataaars', seed: 'whsmith-cartoon-10', label: 'Sunny' },
  { id: '11', style: 'adventurer', seed: 'whsmith-cartoon-11', label: 'Trail' },
  { id: '12', style: 'bigSmile', seed: 'whsmith-cartoon-12', label: 'Happy' },
  { id: '13', style: 'funEmoji', seed: 'whsmith-cartoon-13', label: 'Playful' },
  { id: '14', style: 'lorelei', seed: 'whsmith-cartoon-14', label: 'Calm' },
  { id: '15', style: 'micah', seed: 'whsmith-cartoon-15', label: 'Cool' },
]

const presetById = new Map(PROFILE_AVATAR_PRESETS.map((p) => [p.id, p]))

export function getProfileAvatarPreset(id: string | null | undefined): ProfileAvatarPreset | null {
  if (!id) return null
  const key = id.padStart(2, '0')
  return presetById.get(key) ?? null
}
