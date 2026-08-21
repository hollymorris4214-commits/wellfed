import { useState } from 'react'
import {
  BODY_COMPOSITION_METRICS,
  CARDIO_WORKOUT_TYPES,
  CHECKPOINT_DIRECTIONS,
  CHECKPOINT_TYPES,
  DEFAULT_WORKOUT_TYPES,
  MOVEMENT_RECOVERY_METRICS,
  PILATES_SUBTYPES,
  collectBodyCompositionEntries,
  collectCheckpointSeries,
  collectHealthCheckpoints,
  getDerivedTdee,
  getMovementMetricValue,
  hasTrackedValue,
  normaliseMovementRecovery,
  optionalNumber,
} from './data/health'
import { formatDate, timeNow, todayKey } from './utils/date'
import { createId } from './utils/storage'

const formatValue = (value, digits = 1) =>
  new Intl.NumberFormat('en-GB', { maximumFractionDigits: digits }).format(
    Number(value) || 0,
  )

const uniqueOptions = (items = []) =>
  [...new Set(items.map((item) => String(item ?? '').trim()).filter(Boolean))]

function MiniTrendChart({ digits = 1, label, points = [], unit = '' }) {
  if (!points.length) {
    return <p className="empty-note">No {label.toLowerCase()} values logged yet.</p>
  }

  const values = points.map((point) => Number(point.value))
  const minimum = Math.min(...values)
  const maximum = Math.max(...values)
  const padding = maximum === minimum ? Math.max(Math.abs(maximum) * 0.08, 1) : 0
  const chartMin = minimum - padding
  const chartMax = maximum + padding
  const range = chartMax - chartMin || 1
  const width = 620
  const height = 180
  const insetX = 24
  const insetY = 22
  const plotted = points.map((point, index) => ({
    ...point,
    x:
      points.length === 1
        ? width / 2
        : insetX + (index / (points.length - 1)) * (width - insetX * 2),
    y:
      height -
      insetY -
      ((Number(point.value) - chartMin) / range) * (height - insetY * 2),
  }))
  const latest = plotted.at(-1)

  return (
    <div className="mini-trend-chart">
      <svg
        aria-label={`${label} trend with ${points.length} logged values`}
        role="img"
        viewBox={`0 0 ${width} ${height}`}
      >
        <title>{label} over time</title>
        {[0.25, 0.5, 0.75].map((position) => (
          <line
            className="trend-grid-line"
            key={position}
            x1={insetX}
            x2={width - insetX}
            y1={insetY + position * (height - insetY * 2)}
            y2={insetY + position * (height - insetY * 2)}
          />
        ))}
        {plotted.length > 1 && (
          <polyline
            className="trend-line"
            fill="none"
            points={plotted.map((point) => `${point.x},${point.y}`).join(' ')}
          />
        )}
        {plotted.map((point) => (
          <circle className="trend-point" cx={point.x} cy={point.y} key={`${point.date}-${point.value}`} r="5">
            <title>{`${point.date}: ${formatValue(point.value, digits)} ${unit}`}</title>
          </circle>
        ))}
      </svg>
      <div className="trend-chart-caption">
        <span>{formatDate(points[0].date, { weekday: null })}</span>
        <strong>
          Latest {formatValue(latest.value, digits)} {unit}
        </strong>
        <span>{formatDate(latest.date, { weekday: null })}</span>
      </div>
    </div>
  )
}

export function MovementRecoveryPanel({ date, movement, onChange, onLogWorkout }) {
  const values = normaliseMovementRecovery(movement)
  const derivedTdee = getDerivedTdee(values)
  const tdeeValue = getMovementMetricValue(values, 'tdeeKcal')

  return (
    <section className="movement-recovery-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Daily signals</p>
          <h2>Movement &amp; recovery</h2>
          <p className="quiet">{formatDate(date, { year: 'numeric' })}</p>
        </div>
        <div className="button-row">
          {onLogWorkout && (
            <button onClick={onLogWorkout} type="button">Log workout</button>
          )}
          <span className="source-pill">Manual</span>
        </div>
      </div>
      <div className="movement-metric-grid">
        {MOVEMENT_RECOVERY_METRICS.filter((metric) => metric.id !== 'tdeeKcal').map(
          (metric) => (
            <label className="metric-entry" key={metric.id}>
              <span>{metric.label}</span>
              <span className="metric-input-wrap">
                <input
                  inputMode="decimal"
                  min="0"
                  onChange={(event) =>
                    onChange({
                      [metric.id]: optionalNumber(event.target.value),
                      source: 'manual',
                    })
                  }
                  step={metric.step ?? '1'}
                  type="number"
                  value={values[metric.id]}
                />
                <small>{metric.unit}</small>
              </span>
            </label>
          ),
        )}
        <label className="metric-entry tdee-entry">
          <span>Total daily energy expenditure</span>
          <span className="metric-input-wrap">
            <input
              inputMode="numeric"
              min="0"
              onChange={(event) =>
                onChange({
                  tdeeKcal: optionalNumber(event.target.value),
                  tdeeMode: 'manual',
                  source: 'manual',
                })
              }
              type="number"
              value={tdeeValue ?? ''}
            />
            <small>kcal</small>
          </span>
          <small>
            {values.tdeeMode === 'manual' && hasTrackedValue(values.tdeeKcal)
              ? 'Manual override'
              : derivedTdee !== null
                ? 'Active + resting energy'
                : 'Enter manually, or add active and resting energy'}
          </small>
          {derivedTdee !== null && values.tdeeMode === 'manual' && (
            <button
              className="text-action"
              onClick={() => onChange({ tdeeKcal: '', tdeeMode: 'derived' })}
              type="button"
            >
              Use calculated {formatValue(derivedTdee, 0)} kcal
            </button>
          )}
        </label>
      </div>
      <p className="data-caveat">
        Tracked values for pattern-finding. Wearable calorie estimates are not
        treated as measured metabolism or targets.
      </p>
    </section>
  )
}

export function MovementTrendPanel({ dateKeys, days, title }) {
  const [metricId, setMetricId] = useState('steps')
  const metric =
    MOVEMENT_RECOVERY_METRICS.find((item) => item.id === metricId) ??
    MOVEMENT_RECOVERY_METRICS[0]
  const points = dateKeys
    .map((date) => ({
      date,
      value: getMovementMetricValue(days[date]?.movementRecovery, metricId),
    }))
    .filter((point) => point.value !== null)
  const workouts = dateKeys.flatMap((date) =>
    (days[date]?.bodyEvents ?? []).filter((event) => event.kind === 'workout'),
  )
  const workoutMinutes = workouts.reduce(
    (total, event) => total + (Number(event.durationMinutes) || 0),
    0,
  )

  return (
    <section className="movement-trend-panel wide-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Movement &amp; recovery</p>
          <h2>{title}</h2>
        </div>
        <label className="compact-select">
          <span>Metric</span>
          <select onChange={(event) => setMetricId(event.target.value)} value={metricId}>
            {MOVEMENT_RECOVERY_METRICS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="trend-summary-strip">
        <span>{points.length} days with {metric.label.toLowerCase()}</span>
        <span>{workouts.length} workouts</span>
        <span>{formatValue(workoutMinutes, 0)} workout minutes</span>
      </div>
      <MiniTrendChart
        digits={metric.digits}
        label={metric.label}
        points={points}
        unit={metric.unit}
      />
    </section>
  )
}

const emptyExercise = () => ({
  id: createId(),
  name: '',
  load: '',
  loadUnit: 'kg',
  repetitions: '',
  sets: '',
  notes: '',
})

export function WorkoutPicker({
  currentDate,
  customWorkoutTypes = [],
  exerciseNames = [],
  onBack,
  onLog,
}) {
  const workoutOptions = uniqueOptions([
    ...DEFAULT_WORKOUT_TYPES,
    ...customWorkoutTypes,
  ])
  const [date, setDate] = useState(currentDate)
  const [time, setTime] = useState(timeNow())
  const [workoutType, setWorkoutType] = useState('Pilates')
  const [customType, setCustomType] = useState('')
  const [durationMinutes, setDurationMinutes] = useState('')
  const [rpe, setRpe] = useState('')
  const [notes, setNotes] = useState('')
  const [pilatesSubtype, setPilatesSubtype] = useState('')
  const [strengthExercises, setStrengthExercises] = useState([])
  const [cardio, setCardio] = useState({
    distance: '',
    distanceUnit: 'km',
    averageHeartRate: '',
    maximumHeartRate: '',
    paceOrSpeed: '',
  })
  const [pilates, setPilates] = useState({
    classLevelType: '',
    springsResistance: '',
    instructor: '',
    performanceNotes: '',
  })
  const resolvedType =
    workoutType === 'Other' ? customType.trim() || 'Other' : workoutType
  const canSave =
    Boolean(date && time && resolvedType) &&
    Number(durationMinutes) > 0 &&
    Number(rpe) >= 1 &&
    Number(rpe) <= 10
  const isStrength = resolvedType === 'Strength training'
  const isPilates = resolvedType === 'Pilates'
  const isCardio = CARDIO_WORKOUT_TYPES.has(resolvedType)

  const updateExercise = (id, field, value) => {
    setStrengthExercises((items) =>
      items.map((exercise) =>
        exercise.id === id ? { ...exercise, [field]: value } : exercise,
      ),
    )
  }

  const submit = () => {
    if (!canSave) return
    onLog({
      date,
      time,
      workoutType: resolvedType,
      customWorkoutType:
        workoutType === 'Other' && customType.trim() ? customType.trim() : '',
      durationMinutes: Number(durationMinutes),
      rpe: Number(rpe),
      notes: notes.trim(),
      pilatesSubtype: isPilates ? pilatesSubtype : '',
      performance: {
        ...(isStrength
          ? {
              strengthExercises: strengthExercises
                .filter((exercise) => exercise.name.trim())
                .map((exercise) => ({
                  ...exercise,
                  name: exercise.name.trim(),
                  load: optionalNumber(exercise.load),
                  repetitions: optionalNumber(exercise.repetitions),
                  sets: optionalNumber(exercise.sets),
                  notes: exercise.notes.trim(),
                })),
            }
          : {}),
        ...(isCardio
          ? {
              cardio: {
                ...cardio,
                distance: optionalNumber(cardio.distance),
                averageHeartRate: optionalNumber(cardio.averageHeartRate),
                maximumHeartRate: optionalNumber(cardio.maximumHeartRate),
                paceOrSpeed: cardio.paceOrSpeed.trim(),
              },
            }
          : {}),
        ...(isPilates
          ? {
              pilates: Object.fromEntries(
                Object.entries(pilates).map(([key, value]) => [key, value.trim()]),
              ),
            }
          : {}),
      },
    })
  }

  return (
    <div className="body-event-picker workout-picker">
      <div className="picker-header">
        <div>
          <strong>Workout</strong>
          <small>Type, duration and RPE are enough for a quick log.</small>
        </div>
        <button onClick={onBack} type="button">Back</button>
      </div>
      <div className="health-form-grid workout-core-grid">
        <label>
          <span>Date</span>
          <input onChange={(event) => setDate(event.target.value)} type="date" value={date} />
        </label>
        <label>
          <span>Time</span>
          <input onChange={(event) => setTime(event.target.value)} type="time" value={time} />
        </label>
        <label>
          <span>Workout type</span>
          <select onChange={(event) => setWorkoutType(event.target.value)} value={workoutType}>
            {workoutOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
            <option value="Other">Other / custom</option>
          </select>
        </label>
        {workoutType === 'Other' && (
          <label>
            <span>Custom workout type</span>
            <input onChange={(event) => setCustomType(event.target.value)} placeholder="e.g. Pole conditioning" type="text" value={customType} />
          </label>
        )}
        <label>
          <span>Duration</span>
          <span className="metric-input-wrap">
            <input min="1" onChange={(event) => setDurationMinutes(event.target.value)} type="number" value={durationMinutes} />
            <small>min</small>
          </span>
        </label>
        <label>
          <span>Intensity / RPE</span>
          <select onChange={(event) => setRpe(event.target.value)} value={rpe}>
            <option value="">Select 1–10</option>
            {Array.from({ length: 10 }, (_, index) => index + 1).map((score) => (
              <option key={score} value={score}>{score}</option>
            ))}
          </select>
        </label>
        {isPilates && (
          <label>
            <span>Pilates subtype optional</span>
            <select onChange={(event) => setPilatesSubtype(event.target.value)} value={pilatesSubtype}>
              <option value="">Not specified</option>
              {PILATES_SUBTYPES.map((subtype) => (
                <option key={subtype} value={subtype}>{subtype}</option>
              ))}
            </select>
          </label>
        )}
        <label className="span-two">
          <span>Notes optional</span>
          <input onChange={(event) => setNotes(event.target.value)} placeholder="How it felt, context, anything notable" type="text" value={notes} />
        </label>
      </div>

      {(isStrength || isCardio || isPilates) && (
        <details className="health-advanced-details">
          <summary>Optional performance details</summary>
          {isStrength && (
            <div className="strength-exercise-list">
              <datalist id="known-exercise-names">
                {exerciseNames.map((name) => <option key={name} value={name} />)}
              </datalist>
              {strengthExercises.map((exercise) => (
                <div className="exercise-row" key={exercise.id}>
                  <label>
                    <span>Exercise</span>
                    <input list="known-exercise-names" onChange={(event) => updateExercise(exercise.id, 'name', event.target.value)} value={exercise.name} />
                  </label>
                  <label>
                    <span>Load</span>
                    <input inputMode="decimal" min="0" onChange={(event) => updateExercise(exercise.id, 'load', event.target.value)} type="number" value={exercise.load} />
                  </label>
                  <label>
                    <span>Unit</span>
                    <select onChange={(event) => updateExercise(exercise.id, 'loadUnit', event.target.value)} value={exercise.loadUnit}>
                      <option value="kg">kg</option>
                      <option value="lb">lb</option>
                      <option value="band">band</option>
                      <option value="bodyweight">bodyweight</option>
                    </select>
                  </label>
                  <label>
                    <span>Repetitions</span>
                    <input min="0" onChange={(event) => updateExercise(exercise.id, 'repetitions', event.target.value)} type="number" value={exercise.repetitions} />
                  </label>
                  <label>
                    <span>Sets</span>
                    <input min="0" onChange={(event) => updateExercise(exercise.id, 'sets', event.target.value)} type="number" value={exercise.sets} />
                  </label>
                  <label className="exercise-notes">
                    <span>Notes</span>
                    <input onChange={(event) => updateExercise(exercise.id, 'notes', event.target.value)} value={exercise.notes} />
                  </label>
                  <button className="text-action" onClick={() => setStrengthExercises((items) => items.filter((item) => item.id !== exercise.id))} type="button">Remove</button>
                </div>
              ))}
              <button onClick={() => setStrengthExercises((items) => [...items, emptyExercise()])} type="button">Add exercise</button>
            </div>
          )}
          {isCardio && (
            <div className="health-form-grid">
              <label><span>Distance</span><input min="0" onChange={(event) => setCardio((value) => ({ ...value, distance: event.target.value }))} step="0.01" type="number" value={cardio.distance} /></label>
              <label><span>Distance unit</span><select onChange={(event) => setCardio((value) => ({ ...value, distanceUnit: event.target.value }))} value={cardio.distanceUnit}><option value="km">km</option><option value="mi">miles</option><option value="m">metres</option></select></label>
              <label><span>Average heart rate</span><input min="0" onChange={(event) => setCardio((value) => ({ ...value, averageHeartRate: event.target.value }))} type="number" value={cardio.averageHeartRate} /></label>
              <label><span>Maximum heart rate</span><input min="0" onChange={(event) => setCardio((value) => ({ ...value, maximumHeartRate: event.target.value }))} type="number" value={cardio.maximumHeartRate} /></label>
              <label className="span-two"><span>Pace or speed</span><input onChange={(event) => setCardio((value) => ({ ...value, paceOrSpeed: event.target.value }))} placeholder="e.g. 6:30/km or 20 km/h" value={cardio.paceOrSpeed} /></label>
            </div>
          )}
          {isPilates && (
            <div className="health-form-grid">
              <label><span>Class level / type</span><input onChange={(event) => setPilates((value) => ({ ...value, classLevelType: event.target.value }))} value={pilates.classLevelType} /></label>
              <label><span>Instructor</span><input onChange={(event) => setPilates((value) => ({ ...value, instructor: event.target.value }))} value={pilates.instructor} /></label>
              <label className="span-two"><span>Springs / resistance</span><input onChange={(event) => setPilates((value) => ({ ...value, springsResistance: event.target.value }))} value={pilates.springsResistance} /></label>
              <label className="span-two"><span>Performance notes</span><textarea onChange={(event) => setPilates((value) => ({ ...value, performanceNotes: event.target.value }))} value={pilates.performanceNotes} /></label>
            </div>
          )}
        </details>
      )}
      <button className="primary-action" disabled={!canSave} onClick={submit} type="button">Log workout</button>
    </div>
  )
}

const emptyBodyComposition = () =>
  BODY_COMPOSITION_METRICS.reduce(
    (draft, metric) => ({ ...draft, [metric.id]: '' }),
    { date: todayKey(), notes: '' },
  )

function BodyCompositionSection({ days, onDelete, onSave }) {
  const entries = collectBodyCompositionEntries(days)
  const [draft, setDraft] = useState(emptyBodyComposition)
  const [metricId, setMetricId] = useState('fatMassKg')
  const metric = BODY_COMPOSITION_METRICS.find((item) => item.id === metricId)
  const points = entries
    .filter((entry) => hasTrackedValue(entry.values?.[metricId]))
    .map((entry) => ({ date: entry.date, value: Number(entry.values[metricId]) }))
  const latestValue = (id) =>
    [...entries].reverse().find((entry) => hasTrackedValue(entry.values?.[id]))
      ?.values?.[id]
  const canSave = BODY_COMPOSITION_METRICS.some((item) =>
    hasTrackedValue(draft[item.id]),
  )

  const save = () => {
    if (!canSave) return
    onSave({
      date: draft.date,
      notes: draft.notes.trim(),
      values: Object.fromEntries(
        BODY_COMPOSITION_METRICS.filter((item) =>
          hasTrackedValue(draft[item.id]),
        ).map((item) => [item.id, Number(draft[item.id])]),
      ),
    })
    setDraft((previous) => ({ ...emptyBodyComposition(), date: previous.date }))
  }

  return (
    <section className="health-section body-composition-section">
      <div className="section-heading">
        <div><p className="eyebrow">Longitudinal</p><h2>Body composition</h2><p className="quiet">Fat mass and lean mass sit alongside weight—not beneath it.</p></div>
      </div>
      <div className="composition-headline-grid">
        {BODY_COMPOSITION_METRICS.slice(0, 4).map((item) => (
          <div className={`composition-headline ${item.id}`} key={item.id}>
            <span>{item.label}</span>
            <strong>{hasTrackedValue(latestValue(item.id)) ? `${formatValue(latestValue(item.id), item.digits)} ${item.unit}` : '—'}</strong>
          </div>
        ))}
      </div>
      <details className="entry-disclosure">
        <summary>Add body-composition entry</summary>
        <div className="health-form-grid composition-entry-grid">
          <label><span>Date</span><input onChange={(event) => setDraft((value) => ({ ...value, date: event.target.value }))} type="date" value={draft.date} /></label>
          {BODY_COMPOSITION_METRICS.map((item) => (
            <label key={item.id}><span>{item.label}</span><span className="metric-input-wrap"><input inputMode="decimal" min="0" onChange={(event) => setDraft((value) => ({ ...value, [item.id]: event.target.value }))} step="0.1" type="number" value={draft[item.id]} /><small>{item.unit}</small></span></label>
          ))}
          <label className="span-two"><span>Notes optional</span><input onChange={(event) => setDraft((value) => ({ ...value, notes: event.target.value }))} value={draft.notes} /></label>
        </div>
        <button className="primary-action" disabled={!canSave} onClick={save} type="button">Save body composition</button>
      </details>
      <div className="trend-panel-inner">
        <label className="compact-select"><span>Plot</span><select onChange={(event) => setMetricId(event.target.value)} value={metricId}>{BODY_COMPOSITION_METRICS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        <MiniTrendChart digits={metric.digits} label={metric.label} points={points} unit={metric.unit} />
      </div>
      <div className="health-entry-list">
        {[...entries].reverse().slice(0, 12).map((entry) => (
          <article className="health-entry-card" key={entry.id}>
            <div><strong>{formatDate(entry.date, { year: 'numeric' })}</strong><small>{entry.notes || 'Body-composition entry'}</small></div>
            <div className="measurement-chip-list">{BODY_COMPOSITION_METRICS.filter((item) => hasTrackedValue(entry.values?.[item.id])).map((item) => <span key={item.id}>{item.label} {formatValue(entry.values[item.id], item.digits)} {item.unit}</span>)}</div>
            <button className="text-action" onClick={() => onDelete(entry)} type="button">Delete</button>
          </article>
        ))}
      </div>
    </section>
  )
}

const emptyMeasurement = () => ({
  id: createId(),
  definitionId: '',
  name: '',
  value: '',
  unit: '',
  referenceMin: '',
  referenceMax: '',
  category: '',
  notes: '',
  direction: 'none',
  targetMin: '',
  targetMax: '',
})

function CheckpointForm({ definitions, onSave }) {
  const [type, setType] = useState('Blood Test')
  const [otherType, setOtherType] = useState('')
  const [date, setDate] = useState(todayKey())
  const [provider, setProvider] = useState('')
  const [notes, setNotes] = useState('')
  const [measurements, setMeasurements] = useState([emptyMeasurement()])
  const validMeasurements = measurements.filter(
    (measurement) => measurement.name.trim() && hasTrackedValue(measurement.value),
  )

  const updateMeasurement = (id, updates) => {
    setMeasurements((items) =>
      items.map((measurement) =>
        measurement.id === id ? { ...measurement, ...updates } : measurement,
      ),
    )
  }

  const selectDefinition = (measurement, definitionId) => {
    const definition = definitions.find((item) => item.id === definitionId)
    if (!definition) {
      updateMeasurement(measurement.id, {
        definitionId: '',
        name: '',
        unit: '',
        category: '',
        direction: 'none',
        targetMin: '',
        targetMax: '',
      })
      return
    }
    updateMeasurement(measurement.id, {
      definitionId: definition.id,
      name: definition.name,
      unit: definition.unit,
      category: definition.category ?? '',
      direction: definition.direction ?? 'none',
      targetMin: definition.targetMin ?? '',
      targetMax: definition.targetMax ?? '',
    })
  }

  const save = () => {
    if (!date || !validMeasurements.length) return
    onSave({
      type: type === 'Other' ? otherType.trim() || 'Other' : type,
      date,
      provider: provider.trim(),
      notes: notes.trim(),
      measurements: validMeasurements,
    })
    setProvider('')
    setNotes('')
    setMeasurements([emptyMeasurement()])
  }

  return (
    <details className="entry-disclosure checkpoint-entry-disclosure">
      <summary>Add health checkpoint</summary>
      <div className="health-form-grid checkpoint-core-grid">
        <label><span>Checkpoint type</span><select onChange={(event) => setType(event.target.value)} value={type}>{CHECKPOINT_TYPES.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
        {type === 'Other' && <label><span>Assessment name</span><input onChange={(event) => setOtherType(event.target.value)} value={otherType} /></label>}
        <label><span>Date</span><input onChange={(event) => setDate(event.target.value)} type="date" value={date} /></label>
        <label><span>Provider / source</span><input onChange={(event) => setProvider(event.target.value)} placeholder="Optional" value={provider} /></label>
        <label className="span-two"><span>Checkpoint notes</span><input onChange={(event) => setNotes(event.target.value)} placeholder="Optional" value={notes} /></label>
      </div>
      <div className="checkpoint-measurement-list">
        {measurements.map((measurement, index) => (
          <fieldset className="checkpoint-measurement" key={measurement.id}>
            <legend>Measurement {index + 1}</legend>
            <label className="span-two"><span>Reuse a saved field</span><select onChange={(event) => selectDefinition(measurement, event.target.value)} value={measurement.definitionId}><option value="">Create a new measurement</option>{definitions.map((definition) => <option key={definition.id} value={definition.id}>{definition.name}{definition.unit ? ` (${definition.unit})` : ''}</option>)}</select></label>
            <div className="health-form-grid">
              <label><span>Measurement name</span><input onChange={(event) => updateMeasurement(measurement.id, { name: event.target.value })} readOnly={Boolean(measurement.definitionId)} value={measurement.name} /></label>
              <label><span>Value</span><input inputMode="decimal" onChange={(event) => updateMeasurement(measurement.id, { value: event.target.value })} step="any" type="number" value={measurement.value} /></label>
              <label><span>Unit</span><input onChange={(event) => updateMeasurement(measurement.id, { unit: event.target.value })} readOnly={Boolean(measurement.definitionId)} value={measurement.unit} /></label>
              <label><span>Category / group</span><input onChange={(event) => updateMeasurement(measurement.id, { category: event.target.value })} value={measurement.category} /></label>
              <label><span>Reference minimum</span><input inputMode="decimal" onChange={(event) => updateMeasurement(measurement.id, { referenceMin: event.target.value })} step="any" type="number" value={measurement.referenceMin} /></label>
              <label><span>Reference maximum</span><input inputMode="decimal" onChange={(event) => updateMeasurement(measurement.id, { referenceMax: event.target.value })} step="any" type="number" value={measurement.referenceMax} /></label>
              <label className="span-two"><span>Desired direction</span><select onChange={(event) => updateMeasurement(measurement.id, { direction: event.target.value })} value={measurement.direction}>{CHECKPOINT_DIRECTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
              {measurement.direction === 'target' && <><label><span>Target minimum</span><input inputMode="decimal" onChange={(event) => updateMeasurement(measurement.id, { targetMin: event.target.value })} step="any" type="number" value={measurement.targetMin} /></label><label><span>Target maximum</span><input inputMode="decimal" onChange={(event) => updateMeasurement(measurement.id, { targetMax: event.target.value })} step="any" type="number" value={measurement.targetMax} /></label></>}
              <label className="span-two"><span>Measurement notes</span><input onChange={(event) => updateMeasurement(measurement.id, { notes: event.target.value })} value={measurement.notes} /></label>
            </div>
            {measurements.length > 1 && <button className="text-action" onClick={() => setMeasurements((items) => items.filter((item) => item.id !== measurement.id))} type="button">Remove measurement</button>}
          </fieldset>
        ))}
      </div>
      <div className="button-row"><button onClick={() => setMeasurements((items) => [...items, emptyMeasurement()])} type="button">Add measurement</button><button className="primary-action" disabled={!validMeasurements.length} onClick={save} type="button">Save checkpoint</button></div>
    </details>
  )
}

function HealthCheckpointsSection({ days, definitions, onDelete, onSave }) {
  const checkpoints = collectHealthCheckpoints(days)
  const series = collectCheckpointSeries(days)
  const repeatSeries = series.filter((item) => item.points.length > 1)
  const [seriesKey, setSeriesKey] = useState('')
  const selectedSeries =
    series.find((item) => item.key === seriesKey) ?? repeatSeries[0] ?? series[0]
  const current = selectedSeries?.points.at(-1)
  const previous = selectedSeries?.points.at(-2)
  const absoluteChange = current && previous ? current.value - previous.value : null
  const percentageChange =
    absoluteChange !== null && previous.value !== 0
      ? (absoluteChange / Math.abs(previous.value)) * 100
      : null
  const directionLabel = CHECKPOINT_DIRECTIONS.find(
    (option) => option.id === selectedSeries?.direction,
  )?.label
  const targetRange =
    selectedSeries?.direction === 'target' &&
    (hasTrackedValue(selectedSeries.targetMin) ||
      hasTrackedValue(selectedSeries.targetMax))
      ? `${
          hasTrackedValue(selectedSeries.targetMin)
            ? selectedSeries.targetMin
            : '—'
        } to ${
          hasTrackedValue(selectedSeries.targetMax)
            ? selectedSeries.targetMax
            : '—'
        } ${selectedSeries.unit}`
      : ''

  return (
    <section className="health-section checkpoints-section">
      <div className="section-heading"><div><p className="eyebrow">Low-frequency records</p><h2>Health Checkpoints</h2><p className="quiet">Build only the fields you actually use, then reuse them next time.</p></div></div>
      <CheckpointForm definitions={definitions} onSave={onSave} />
      {series.length > 0 && (
        <div className="checkpoint-comparison">
          <div className="section-heading"><div><p className="eyebrow">Longitudinal comparison</p><h3>{selectedSeries?.name ?? 'Measurement'}</h3></div><label className="compact-select"><span>Measurement</span><select onChange={(event) => setSeriesKey(event.target.value)} value={selectedSeries?.key ?? ''}>{series.map((item) => <option key={item.key} value={item.key}>{item.name}{item.unit ? ` (${item.unit})` : ''}</option>)}</select></label></div>
          {previous && current ? (
            <div className="comparison-grid">
              <div><span>Previous</span><strong>{formatValue(previous.value, 3)} {selectedSeries.unit}</strong><small>{formatDate(previous.date, { weekday: null })}</small></div>
              <div><span>Current</span><strong>{formatValue(current.value, 3)} {selectedSeries.unit}</strong><small>{formatDate(current.date, { weekday: null })}</small></div>
              <div><span>Absolute change</span><strong>{absoluteChange > 0 ? '+' : ''}{formatValue(absoluteChange, 3)} {selectedSeries.unit}</strong></div>
              <div><span>Percentage change</span><strong>{percentageChange === null ? '—' : `${percentageChange > 0 ? '+' : ''}${formatValue(percentageChange, 1)}%`}</strong></div>
              <div><span>Reference range</span><strong>{hasTrackedValue(current.referenceMin) || hasTrackedValue(current.referenceMax) ? `${hasTrackedValue(current.referenceMin) ? current.referenceMin : '—'} to ${hasTrackedValue(current.referenceMax) ? current.referenceMax : '—'} ${selectedSeries.unit}` : 'Not supplied'}</strong></div>
              <div><span>User-defined direction</span><strong>{directionLabel || 'Informational only'}{targetRange ? ` · ${targetRange}` : ''}</strong></div>
            </div>
          ) : (
            <p className="quiet">A comparison appears after this measurement is logged at a second checkpoint.</p>
          )}
          {selectedSeries && <MiniTrendChart digits={3} label={selectedSeries.name} points={selectedSeries.points} unit={selectedSeries.unit} />}
          <p className="data-caveat">Changes are shown numerically. WellFed does not assume that higher or lower is better.</p>
        </div>
      )}
      <div className="health-entry-list">
        {[...checkpoints].reverse().map((checkpoint) => (
          <article className="health-entry-card checkpoint-card" key={checkpoint.id}>
            <div><strong>{checkpoint.type}</strong><span>{formatDate(checkpoint.date, { year: 'numeric' })}</span><small>{checkpoint.provider || 'No provider supplied'}{checkpoint.notes ? ` · ${checkpoint.notes}` : ''}</small></div>
            <div className="measurement-chip-list">{(checkpoint.measurements ?? []).map((measurement) => <span key={measurement.id}>{measurement.name} {formatValue(measurement.value, 3)} {measurement.unit}</span>)}</div>
            <button className="text-action" onClick={() => onDelete(checkpoint)} type="button">Delete</button>
          </article>
        ))}
      </div>
    </section>
  )
}

export function HealthView({
  days,
  measurementDefinitions,
  onDeleteBodyComposition,
  onDeleteCheckpoint,
  onSaveBodyComposition,
  onSaveCheckpoint,
}) {
  return (
    <div className="screen-grid health-grid">
      <section className="focus-panel wide-panel health-intro">
        <div><p className="eyebrow">Health</p><h2>Composition &amp; checkpoints</h2><p>Daily movement stays with the daily journal. Slower-changing measurements live here, out of the way until useful.</p></div>
      </section>
      <BodyCompositionSection days={days} onDelete={onDeleteBodyComposition} onSave={onSaveBodyComposition} />
      <HealthCheckpointsSection days={days} definitions={measurementDefinitions} onDelete={onDeleteCheckpoint} onSave={onSaveCheckpoint} />
    </div>
  )
}
