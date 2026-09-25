import test from 'node:test'
import assert from 'node:assert/strict'
import { loadJoyride } from './joyrideLoader.js'

test('loads the Joyride component export', async () => {
  assert.equal(typeof (await loadJoyride()), 'function')
})
