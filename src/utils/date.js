import { WEEKDAY_KEYS } from '../data/nutrients'

export const dateKeyFromDate = (date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export const parseDateKey = (dateKey) => {
  const [year, month, day] = dateKey.split('-').map(Number)
  return new Date(year, month - 1, day)
}

export const todayKey = () => dateKeyFromDate(new Date())

export const timeNow = () => {
  const now = new Date()
  return `${String(now.getHours()).padStart(2, '0')}:${String(
    now.getMinutes(),
  ).padStart(2, '0')}`
}

export const addDays = (dateKey, amount) => {
  const date = parseDateKey(dateKey)
  date.setDate(date.getDate() + amount)
  return dateKeyFromDate(date)
}

export const isBeforeDateKey = (left, right) =>
  parseDateKey(left).getTime() < parseDateKey(right).getTime()

export const getWeekStartKey = (dateKey) => {
  const date = parseDateKey(dateKey)
  const day = date.getDay()
  const diff = day === 0 ? -6 : 1 - day
  date.setDate(date.getDate() + diff)
  return dateKeyFromDate(date)
}

export const getWeekDates = (dateKey) => {
  const start = getWeekStartKey(dateKey)
  return WEEKDAY_KEYS.map((_, index) => addDays(start, index))
}

export const getWeekdayKey = (dateKey) => {
  const day = parseDateKey(dateKey).getDay()
  return WEEKDAY_KEYS[day === 0 ? 6 : day - 1]
}

export const getMonthKey = (dateKey) => dateKey.slice(0, 7)

export const getMonthDates = (monthKey) => {
  const [year, month] = monthKey.split('-').map(Number)
  const date = new Date(year, month - 1, 1)
  const dates = []
  while (date.getMonth() === month - 1) {
    dates.push(dateKeyFromDate(date))
    date.setDate(date.getDate() + 1)
  }
  return dates
}

export const formatDate = (dateKey, options = {}) =>
  new Intl.DateTimeFormat('en-AU', {
    ...(options.weekday === null
      ? {}
      : { weekday: options.weekday ?? 'short' }),
    day: 'numeric',
    month: 'short',
    year: options.year ?? undefined,
  }).format(parseDateKey(dateKey))

export const formatMonth = (monthKey) => {
  const [year, month] = monthKey.split('-').map(Number)
  return new Intl.DateTimeFormat('en-AU', {
    month: 'long',
    year: 'numeric',
  }).format(new Date(year, month - 1, 1))
}

export const formatWeekRange = (dateKey) => {
  const dates = getWeekDates(dateKey)
  return `${formatDate(dates[0], { weekday: null })} - ${formatDate(
    dates[6],
    { weekday: null, year: 'numeric' },
  )}`
}
