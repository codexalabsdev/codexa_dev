export type LevelDefinition = {
  level: number
  name?: string | null
  min_xp: number
  is_active?: boolean | null
}

export type LevelState = {
  level: number
  levelName: string
  currentLevelXp: number
  nextLevelXp: number
  hasNextMilestone: boolean
  progress: number
}

export function computeLevelState(totalXp: number, levels: LevelDefinition[]): LevelState {
  const normalizedXp = Number.isFinite(totalXp) ? Math.max(0, Number(totalXp)) : 0
  const sortedLevels = [...levels]
    .filter((level) => Number.isFinite(level.min_xp) && level.is_active !== false)
    .sort((left, right) => left.min_xp - right.min_xp || left.level - right.level)

  if (!sortedLevels.length) {
    return {
      level: 1,
      levelName: 'Iniciante',
      currentLevelXp: 0,
      nextLevelXp: 100,
      hasNextMilestone: false,
      progress: 0,
    }
  }

  const current = sortedLevels.reduce((highest, level) => {
    if (normalizedXp >= level.min_xp) return level
    return highest
  }, sortedLevels[0])

  const next = sortedLevels.find((level) => level.min_xp > normalizedXp) ?? null
  const currentLevelXp = Number(current.min_xp ?? 0)
  const nextLevelXp = next ? Number(next.min_xp ?? currentLevelXp + 100) : currentLevelXp + 100
  const denominator = Math.max(1, nextLevelXp - currentLevelXp)
  const progress = next ? Math.min(99, Math.max(0, Math.round(((normalizedXp - currentLevelXp) / denominator) * 100))) : 100

  return {
    level: Number(current.level ?? 1),
    levelName: current.name?.trim() || 'Iniciante',
    currentLevelXp,
    nextLevelXp,
    hasNextMilestone: Boolean(next),
    progress,
  }
}