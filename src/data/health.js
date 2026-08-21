export const DEFAULT_WORKOUT_TYPES = [
  'Pilates',
  'Strength training',
  'Walking',
  'Interval walking',
  'Swimming',
  'Cycling',
  'Rebounder',
  'Cardio',
]

export const PILATES_SUBTYPES = ['Restore', 'Rooted', 'Radiance', 'Rise']

export const CARDIO_WORKOUT_TYPES = new Set([
  'Walking',
  'Interval walking',
  'Swimming',
  'Cycling',
  'Rebounder',
  'Cardio',
])

export const MOVEMENT_RECOVERY_METRICS = [
  { id: 'steps', label: 'Steps', unit: 'steps', digits: 0 },
  {
    id: 'activeEnergyKcal',
    label: 'Active energy',
    unit: 'kcal',
    digits: 0,
  },
  {
    id: 'restingEnergyKcal',
    label: 'Resting energy',
    unit: 'kcal',
    digits: 0,
  },
  { id: 'tdeeKcal', label: 'TDEE', unit: 'kcal', digits: 0 },
  {
    id: 'exerciseMinutes',
    label: 'Exercise minutes',
    unit: 'min',
    digits: 0,
  },
  {
    id: 'restingHeartRateBpm',
    label: 'Resting heart rate',
    unit: 'bpm',
    digits: 0,
  },
  { id: 'hrvMs', label: 'HRV', unit: 'ms', digits: 0 },
  {
    id: 'sleepDurationHours',
    label: 'Sleep duration',
    unit: 'h',
    digits: 1,
    step: '0.1',
  },
]

export const BODY_COMPOSITION_METRICS = [
  { id: 'fatMassKg', label: 'Fat mass', unit: 'kg', digits: 1 },
  { id: 'leanMassKg', label: 'Lean mass', unit: 'kg', digits: 1 },
  {
    id: 'bodyFatPercent',
    label: 'Body-fat percentage',
    unit: '%',
    digits: 1,
  },
  { id: 'weightKg', label: 'Weight', unit: 'kg', digits: 1 },
  { id: 'waistCm', label: 'Waist', unit: 'cm', digits: 1 },
  { id: 'abdomenCm', label: 'Abdomen', unit: 'cm', digits: 1 },
  { id: 'hipsCm', label: 'Hip / glute', unit: 'cm', digits: 1 },
  { id: 'thighCm', label: 'Thigh', unit: 'cm', digits: 1 },
  { id: 'upperArmCm', label: 'Upper arm', unit: 'cm', digits: 1 },
]

export const CHECKPOINT_TYPES = ['Blood Test', 'DEXA', 'Other']

export const CHECKPOINT_DIRECTIONS = [
  { id: 'none', label: 'No direction / informational only' },
  { id: 'higher', label: 'Higher is desirable' },
  { id: 'lower', label: 'Lower is desirable' },
  { id: 'target', label: 'Target range' },
]

export const emptyMovementRecovery = () => ({
  steps: '',
  activeEnergyKcal: '',
  restingEnergyKcal: '',
  tdeeKcal: '',
  tdeeMode: 'derived',
  exerciseMinutes: '',
  restingHeartRateBpm: '',
  hrvMs: '',
  sleepDurationHours: '',
  source: 'manual',
})

export const hasTrackedValue = (value) =>
  value !== '' && value !== null && value !== undefined && Number.isFinite(Number(value))

export const optionalNumber = (value) => {
  if (value === '' || value === null || value === undefined) return ''
  const number = Number(value)
  return Number.isFinite(number) ? number : ''
}

export const getDerivedTdee = (movement = {}) => {
  if (
    !hasTrackedValue(movement.activeEnergyKcal) ||
    !hasTrackedValue(movement.restingEnergyKcal)
  ) {
    return null
  }
  return Number(movement.activeEnergyKcal) + Number(movement.restingEnergyKcal)
}

export const getMovementMetricValue = (movement = {}, metricId) => {
  if (metricId === 'tdeeKcal') {
    if (movement.tdeeMode === 'manual' && hasTrackedValue(movement.tdeeKcal)) {
      return Number(movement.tdeeKcal)
    }
    const derived = getDerivedTdee(movement)
    if (derived !== null) return derived
  }
  return hasTrackedValue(movement[metricId]) ? Number(movement[metricId]) : null
}

export const normaliseMovementRecovery = (movement = {}) => ({
  ...emptyMovementRecovery(),
  ...movement,
  source: movement.source || 'manual',
})

export const collectBodyCompositionEntries = (days = {}) =>
  Object.values(days)
    .flatMap((day) => day?.bodyCompositionEntries ?? [])
    .sort((a, b) => `${a.date ?? ''}${a.createdAt ?? ''}`.localeCompare(`${b.date ?? ''}${b.createdAt ?? ''}`))

export const collectHealthCheckpoints = (days = {}) =>
  Object.values(days)
    .flatMap((day) => day?.healthCheckpoints ?? [])
    .sort((a, b) => `${a.date ?? ''}${a.createdAt ?? ''}`.localeCompare(`${b.date ?? ''}${b.createdAt ?? ''}`))

export const collectExerciseNames = (days = {}) =>
  [...new Set(
    Object.values(days).flatMap((day) =>
      (day?.bodyEvents ?? [])
        .filter((event) => event.kind === 'workout')
        .flatMap((event) =>
          (event.performance?.strengthExercises ?? []).map((exercise) =>
            String(exercise.name ?? '').trim(),
          ),
        ),
    ),
  )]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b))

export const measurementKey = (measurement = {}) => {
  if (measurement.definitionId) return `definition:${measurement.definitionId}`
  return `${String(measurement.name ?? '').trim().toLowerCase()}|${String(
    measurement.unit ?? '',
  )
    .trim()
    .toLowerCase()}`
}

export const collectCheckpointSeries = (days = {}) => {
  const series = new Map()
  collectHealthCheckpoints(days).forEach((checkpoint) => {
    ;(checkpoint.measurements ?? []).forEach((measurement) => {
      if (!hasTrackedValue(measurement.value) || !measurement.name) return
      const key = measurementKey(measurement)
      const existing = series.get(key) ?? {
        key,
        name: measurement.name,
        unit: measurement.unit ?? '',
        category: measurement.category ?? '',
        direction: measurement.direction ?? 'none',
        targetMin: measurement.targetMin ?? '',
        targetMax: measurement.targetMax ?? '',
        points: [],
      }
      existing.name = measurement.name
      existing.unit = measurement.unit ?? existing.unit
      existing.category = measurement.category ?? existing.category
      existing.direction = measurement.direction ?? existing.direction
      existing.targetMin = measurement.targetMin ?? existing.targetMin
      existing.targetMax = measurement.targetMax ?? existing.targetMax
      existing.points.push({
        checkpointId: checkpoint.id,
        checkpointType: checkpoint.type,
        date: checkpoint.date,
        provider: checkpoint.provider ?? '',
        value: Number(measurement.value),
        referenceMin: measurement.referenceMin ?? '',
        referenceMax: measurement.referenceMax ?? '',
        notes: measurement.notes ?? '',
      })
      series.set(key, existing)
    })
  })
  return [...series.values()]
    .map((item) => ({
      ...item,
      points: item.points.sort((a, b) => a.date.localeCompare(b.date)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}
