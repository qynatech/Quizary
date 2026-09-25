import test from 'node:test'
import assert from 'node:assert/strict'
import {
  availableSteps,
  canAutoStartTour,
  consumeNewAccount,
  getTourStatus,
  isPendingNewAccount,
  markNewAccount,
  saveTourStatus,
  tourKey,
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

test('creates a namespaced tour key', () => {
  assert.equal(tourKey('forms', 'quiz-auto'), 'quizary.tour.forms.quiz-auto')
})

test('returns an unseen status when no tour state exists', () => {
  assert.equal(getTourStatus('quizary.tour.dashboard.default', createStorage()), 'unseen')
})

test('persists a terminal tour status', () => {
  const storage = createStorage()
  saveTourStatus('quizary.tour.dashboard.default', 'completed', storage)
  assert.equal(getTourStatus('quizary.tour.dashboard.default', storage), 'completed')
})

test('keeps only steps whose targets are available', () => {
  const doc = { querySelector: (selector) => selector === '[data-tour="present"]' ? {} : null }
  const steps = [
    { target: '[data-tour="present"]' },
    { target: '[data-tour="missing"]' },
    { target: null },
  ]
  assert.deepEqual(availableSteps(steps, doc), [steps[0], steps[2]])
})

test('normalizes and consumes a new-account marker once', () => {
  const storage = createStorage()
  assert.equal(markNewAccount(' User@Example.COM ', storage), true)
  const user = { email: 'user@example.com' }
  assert.equal(isPendingNewAccount(user, storage), true)
  assert.equal(consumeNewAccount(user, storage), true)
  assert.equal(consumeNewAccount(user, storage), false)
})

test('allows automatic tour only for matching unseen tour', () => {
  const storage = createStorage()
  const user = { email: 'user@example.com' }
  markNewAccount(user.email, storage)
  assert.equal(canAutoStartTour(user, 'quizary.tour.dashboard.ready', storage), true)
  saveTourStatus('quizary.tour.dashboard.ready', 'completed', storage)
  assert.equal(canAutoStartTour(user, 'quizary.tour.dashboard.ready', storage), false)
})

test('does not allow automatic tour without a new-account marker', () => {
  assert.equal(canAutoStartTour({ email: 'existing@example.com' }, 'quizary.tour.dashboard.ready', createStorage()), false)
})

test('does not mark a new account without storage', () => {
  assert.equal(markNewAccount('user@example.com'), false)
})

test('scopes tour keys per user', () => {
  const key = 'quizary.tour.dashboard.ready'
  assert.equal(userTourKey({ id: 1, email: 'User@Example.COM' }, key), `${key}##1:user@example.com`)
  assert.notEqual(
    userTourKey({ id: 1, email: 'a@example.com' }, key),
    userTourKey({ id: 2, email: 'b@example.com' }, key),
  )
})
