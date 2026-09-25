import test from 'node:test'
import assert from 'node:assert/strict'
import { getAuthenticatedPath } from './authRedirect.js'

test('admin always lands on admin workspace', () => {
  assert.equal(getAuthenticatedPath({ role: 'admin' }, '/forms'), '/admin')
})

test('regular user keeps intended path', () => {
  assert.equal(getAuthenticatedPath({ role: 'user' }, '/forms'), '/forms')
})
