import test from 'node:test'
import assert from 'node:assert/strict'
import { availableSteps, getTourStatus, saveTourStatus, tourKey } from './tourStorage.js'

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial))
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
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
