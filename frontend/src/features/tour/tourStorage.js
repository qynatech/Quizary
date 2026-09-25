const STORAGE_PREFIX = 'quizary.tour.'
const TERMINAL_STATUSES = new Set(['completed', 'skipped', 'dismissed'])

function getStorage(storage) {
  if (storage) return storage
  try {
    return globalThis.localStorage
  } catch {
    return null
  }
}

export function tourKey(page, variant = 'default') {
  return `${STORAGE_PREFIX}${page}.${variant}`
}

export function getTourStatus(key, storage) {
  try {
    const status = getStorage(storage)?.getItem(key)
    return TERMINAL_STATUSES.has(status) ? status : 'unseen'
  } catch {
    return 'unseen'
  }
}

export function saveTourStatus(key, status, storage) {
  if (!TERMINAL_STATUSES.has(status)) return false
  try {
    getStorage(storage)?.setItem(key, status)
    return true
  } catch {
    return false
  }
}

export function availableSteps(steps, documentRef = globalThis.document) {
  if (!Array.isArray(steps)) return []
  if (!documentRef?.querySelector) return steps.filter((step) => !step.target)
  return steps.filter((step) => !step.target || documentRef.querySelector(step.target))
}

export { STORAGE_PREFIX, TERMINAL_STATUSES }
