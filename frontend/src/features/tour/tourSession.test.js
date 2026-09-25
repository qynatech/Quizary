import test from 'node:test'
import assert from 'node:assert/strict'
import {
  claimFirstLoginSession,
  clearTourSession,
  continueTourSession,
  createTourSession,
  endTourSession,
  hasSessionPage,
  isTourSessionOwner,
  markSessionPageShown,
  readTourSession,
  startManualTourSession,
} from './tourSession.js'
import {
  markNewAccount as markAccountForSessionTest,
  saveTourStatus,
  userTourKey,
} from './tourStorage.js'

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial))
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  }
}

function createLockManager() {
  const names = []
  let queue = Promise.resolve()
  return {
    names,
    request(name, callback) {
      names.push(name)
      const granted = queue.then(() => callback({ name, mode: 'exclusive' }))
      queue = granted.catch(() => {})
      return granted
    },
  }
}

function markNewAccountForSessionTest(email, storage) {
  assert.equal(markAccountForSessionTest(email, storage), true)
}

test('creates an active owner-gated session and tracks pages once', async () => {
  const storage = createStorage()
  const user = { id: 1, email: 'user@example.com' }
  const session = createTourSession(user, 'first-login', storage, 'session-1')

  assert.equal(session.id, 'session-1')
  assert.equal(session.status, 'active')
  assert.equal(isTourSessionOwner(readTourSession(storage), user), true)
  assert.equal(hasSessionPage(readTourSession(storage), 'dashboard'), false)

  const marked = await markSessionPageShown(readTourSession(storage), user, 'dashboard', { storage })
  assert.equal(hasSessionPage(marked, 'dashboard'), true)

  assert.equal(endTourSession({ storage }), true)
  assert.equal(readTourSession(storage), null)
  assert.equal(clearTourSession(storage), true)
})

test('claims one first-login session and continues across unvisited pages', async () => {
  const storage = createStorage()
  const user = { id: 1, email: 'user@example.com' }
  const lockManager = createLockManager()
  markNewAccountForSessionTest(user.email, storage)

  const session = await claimFirstLoginSession(user, 'quizary.tour.dashboard.ready', {
    storage,
    lockManager,
    sessionId: 'session-1',
  })

  assert.equal(session?.id, 'session-1')
  assert.equal(continueTourSession(user, 'dashboard', 'quizary.tour.dashboard.ready', { storage })?.id, 'session-1')
  assert.equal(continueTourSession(user, 'forms', 'quizary.tour.forms.ready', { storage })?.id, 'session-1')

  const marked = await markSessionPageShown(session, user, 'dashboard', { storage, lockManager })
  assert.deepEqual(marked?.pages, ['dashboard'])
  assert.equal(continueTourSession(user, 'dashboard', 'quizary.tour.dashboard.ready', { storage }), null)
  assert.equal(continueTourSession(user, 'forms', 'quizary.tour.forms.ready', { storage })?.id, 'session-1')

  const manual = await startManualTourSession(user, { storage, lockManager, sessionId: 'session-2' })
  assert.equal(manual?.id, 'session-1')
})

test('keeps terminal statuses scoped per user', async () => {
  const storage = createStorage()
  const userA = { id: 1, email: 'a@example.com' }
  const userB = { id: 2, email: 'b@example.com' }
  const lockManager = createLockManager()
  const key = 'quizary.tour.dashboard.ready'
  markNewAccountForSessionTest(userB.email, storage)
  saveTourStatus(userTourKey(userB, key), 'completed', storage)

  assert.equal(await claimFirstLoginSession(userB, key, { storage, lockManager }), null)

  markNewAccountForSessionTest(userA.email, storage)
  const session = await claimFirstLoginSession(userA, key, { storage, lockManager, sessionId: 'session-a' })
  assert.equal(session?.id, 'session-a')
  assert.equal(continueTourSession(userA, 'dashboard', key, { storage })?.id, 'session-a')
})
