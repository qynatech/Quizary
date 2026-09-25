import { consumeNewAccount, getTourStatus, isPendingNewAccount, userTourKey } from './tourStorage.js'

const SESSION_KEY = 'quizary.tour.session.active'

function resolveStorage(storage) {
  if (storage) return storage
  try {
    return globalThis.localStorage
  } catch {
    return null
  }
}

function normalizeSessionEmail(email) {
  return String(email || '').trim().toLowerCase()
}

function sessionOwner(user) {
  return `${user?.id ?? ''}:${normalizeSessionEmail(user?.email)}`
}

function readSessionJson(raw) {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function readTourSession(storage) {
  try {
    const raw = resolveStorage(storage)?.getItem(SESSION_KEY)
    if (!raw) return null
    const value = readSessionJson(raw)
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    const pages = Array.isArray(value.pages) ? value.pages.filter((page) => typeof page === 'string') : []
    if (typeof value.id !== 'string' || !value.id) return null
    if (typeof value.owner !== 'string' || !value.owner) return null
    if (value.source !== 'first-login' && value.source !== 'manual-replay') return null
    if (value.status !== 'active') return null
    return { id: value.id, owner: value.owner, source: value.source, status: 'active', pages }
  } catch {
    return null
  }
}

export function isTourSessionOwner(session, user) {
  const owner = sessionOwner(user)
  return Boolean(owner && session?.owner === owner && session?.status === 'active')
}

export function createTourSession(user, source, storage, sessionId = `tour-${Date.now()}-${Math.floor(Math.random() * 1000000)}`) {
  const owner = sessionOwner(user)
  if (!owner || (source !== 'first-login' && source !== 'manual-replay')) return null
  try {
    const store = resolveStorage(storage)
    if (!store) return null
    const session = { id: sessionId, owner, source, status: 'active', pages: [] }
    store.setItem(SESSION_KEY, JSON.stringify(session))
    return session
  } catch {
    return null
  }
}

export function hasSessionPage(session, reservationKey) {
  return Boolean(session && typeof reservationKey === 'string' && reservationKey && session.pages.includes(reservationKey))
}

export async function markSessionPageShown(session, user, reservationKey, { storage, lockManager } = {}) {
  const mark = () => {
    const current = readTourSession(storage)
    if (!isTourSessionOwner(current, user)) return null
    if (typeof reservationKey !== 'string' || !reservationKey) return null
    if (hasSessionPage(current, reservationKey)) return current
    const next = { ...current, pages: [...current.pages, reservationKey] }
    try {
      resolveStorage(storage)?.setItem(SESSION_KEY, JSON.stringify(next))
      return next
    } catch {
      return null
    }
  }
  const manager = lockManager ?? globalThis.navigator?.locks
  if (typeof manager?.request !== 'function') return mark()
  return manager.request(SESSION_KEY, mark)
}

export function endTourSession({ storage } = {}) {
  try {
    const store = resolveStorage(storage)
    if (!store) return false
    store.removeItem(SESSION_KEY)
    return true
  } catch {
    return false
  }
}

export function clearTourSession(storage) {
  return endTourSession({ storage })
}

export async function claimFirstLoginSession(user, fullTourKey, { storage, lockManager, canProceed = () => true, sessionId } = {}) {
  const manager = lockManager ?? globalThis.navigator?.locks
  if (typeof manager?.request !== 'function') return null
  return manager.request(SESSION_KEY, () => {
    if (!canProceed()) return null
    const existing = readTourSession(storage)
    if (isTourSessionOwner(existing, user)) return existing
    if (!isPendingNewAccount(user, storage)) return null
    if (getTourStatus(userTourKey(user, fullTourKey), storage) !== 'unseen') return null
    if (!consumeNewAccount(user, storage)) return null
    return createTourSession(user, 'first-login', storage, sessionId)
  })
}

export function continueTourSession(user, reservationKey, fullTourKey, { storage } = {}) {
  const session = readTourSession(storage)
  if (!isTourSessionOwner(session, user)) return null
  if (typeof reservationKey !== 'string' || !reservationKey) return null
  if (hasSessionPage(session, reservationKey)) return null
  if (getTourStatus(userTourKey(user, fullTourKey), storage) !== 'unseen') return null
  return session
}

export async function startManualTourSession(user, { storage, lockManager, consumeMarker = () => false, sessionId } = {}) {
  const createManual = () => {
    const existing = readTourSession(storage)
    if (isTourSessionOwner(existing, user)) {
      consumeMarker()
      return existing
    }
    if (!user) return null
    consumeMarker()
    return createTourSession(user, 'manual-replay', storage, sessionId)
  }
  const manager = lockManager ?? globalThis.navigator?.locks
  if (typeof manager?.request !== 'function') return createManual()
  return manager.request(SESSION_KEY, createManual)
}

export { SESSION_KEY }
