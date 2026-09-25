import test from 'node:test'
import assert from 'node:assert/strict'
import { findChangedStepIndex, isSameTourContext } from './tourLifecycle.js'

test('matches the same tour context', () => {
  const user = { id: 1, email: 'user@example.com' }
  const registration = { page: 'dashboard' }

  assert.equal(
    isSameTourContext(user, { ...user }, '/dashboard', '/dashboard', registration, registration),
    true,
  )
})

test('rejects a changed user identity', () => {
  const user = { id: 1, email: 'user@example.com' }
  const registration = { page: 'dashboard' }

  assert.equal(
    isSameTourContext(user, { id: 2, email: user.email }, '/dashboard', '/dashboard', registration, registration),
    false,
  )
  assert.equal(
    isSameTourContext(user, { id: user.id, email: 'other@example.com' }, '/dashboard', '/dashboard', registration, registration),
    false,
  )
})

test('rejects a changed route', () => {
  const user = { id: 1, email: 'user@example.com' }
  const registration = { page: 'dashboard' }

  assert.equal(
    isSameTourContext(user, { ...user }, '/dashboard', '/forms', registration, registration),
    false,
  )
})

test('rejects an unregistered tour', () => {
  const user = { id: 1, email: 'user@example.com' }
  const registration = { page: 'dashboard' }

  assert.equal(
    isSameTourContext(user, { ...user }, '/dashboard', '/dashboard', registration, undefined),
    false,
  )
})

test('rejects a re-registered tour', () => {
  const user = { id: 1, email: 'user@example.com' }
  const registration = { page: 'dashboard' }

  assert.equal(
    isSameTourContext(user, { ...user }, '/dashboard', '/dashboard', registration, { page: 'dashboard' }),
    false,
  )
})

test('jumps to the first newly appeared step on variant change', () => {
  const oldSteps = [
    { target: '[data-tour="builder-add"]' },
    { target: '[data-tour="builder-list"]' },
  ]
  const newSteps = [
    { target: '[data-tour="builder-add"]' },
    { target: '[data-tour="builder-list"]' },
    { target: '[data-tour="builder-editor"]' },
    { target: '[data-tour="question-type"]' },
  ]

  assert.equal(findChangedStepIndex(oldSteps, newSteps), 2)
})

test('keeps position when variant change adds no new step', () => {
  const oldSteps = [
    { target: '[data-tour="builder-add"]' },
    { target: '[data-tour="builder-list"]' },
  ]
  const newSteps = [
    { target: '[data-tour="builder-add"]' },
    { target: '[data-tour="builder-list"]' },
  ]

  assert.equal(findChangedStepIndex(oldSteps, newSteps), -1)
})

test('treats the first step list as entirely new when nothing ran before', () => {
  assert.equal(findChangedStepIndex([], [{ target: '[data-tour="dashboard-welcome"]' }]), 0)
  assert.equal(findChangedStepIndex(null, [{ target: '[data-tour="dashboard-welcome"]' }]), 0)
})
