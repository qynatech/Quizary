const STORAGE_PREFIX = 'quizary.tour.'
const NEW_ACCOUNT_KEY = 'quizary.tour.pending-new-account'
const TERMINAL_STATUSES = new Set(['completed', 'skipped', 'dismissed'])

function getStorage(storage) {
  if (storage) return storage
  try {
    return globalThis.localStorage
  } catch {
    return null
  }
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase()
}

export function markNewAccount(email, storage) {
  const normalized = normalizeEmail(email)
  if (!normalized) return false
  try {
    const store = getStorage(storage)
    if (!store) return false
    store.setItem(NEW_ACCOUNT_KEY, normalized)
    return true
  } catch {
    return false
  }
}

export function isPendingNewAccount(user, storage) {
  const expected = normalizeEmail(user?.email)
  if (!expected) return false
  try {
    return getStorage(storage)?.getItem(NEW_ACCOUNT_KEY) === expected
  } catch {
    return false
  }
}

export function consumeNewAccount(user, storage) {
  if (!isPendingNewAccount(user, storage)) return false
  try {
    getStorage(storage)?.removeItem(NEW_ACCOUNT_KEY)
    return true
  } catch {
    return false
  }
}

export function canAutoStartTour(user, key, storage) {
  return isPendingNewAccount(user, storage) && getTourStatus(key, storage) === 'unseen'
}

export function tourKey(page, variant = 'default') {
  return `${STORAGE_PREFIX}${page}.${variant}`
}

export function userTourKey(user, key) {
  return `${key}##${user?.id ?? ''}:${normalizeEmail(user?.email)}`
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

export { STORAGE_PREFIX, NEW_ACCOUNT_KEY, TERMINAL_STATUSES }
