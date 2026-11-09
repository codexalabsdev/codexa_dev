import test from 'node:test'
import assert from 'node:assert/strict'

import { computeLevelState } from './gamification.ts'

test('computeLevelState assigns the correct level and milestone from total XP', () => {
  const levels = [
    { level: 1, name: 'Iniciante', min_xp: 0 },
    { level: 2, name: 'Protagonista', min_xp: 150 },
    { level: 3, name: 'Líder', min_xp: 400 },
  ]

  assert.deepEqual(computeLevelState(0, levels), {
    level: 1,
    levelName: 'Iniciante',
    currentLevelXp: 0,
    nextLevelXp: 150,
    hasNextMilestone: true,
    progress: 0,
  })

  assert.deepEqual(computeLevelState(320, levels), {
    level: 2,
    levelName: 'Protagonista',
    currentLevelXp: 150,
    nextLevelXp: 400,
    hasNextMilestone: true,
    progress: 68,
  })

  assert.deepEqual(computeLevelState(600, levels), {
    level: 3,
    levelName: 'Líder',
    currentLevelXp: 400,
    nextLevelXp: 500,
    hasNextMilestone: false,
    progress: 100,
  })
})