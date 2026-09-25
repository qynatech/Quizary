import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./TourContext.jsx', import.meta.url), 'utf8')

test('resets all session page tours when replay is requested', () => {
  assert.match(source, /autoStarted\.current\.clear\(\)/)
})

test('keeps tooltips inside the viewport and themes the arrow', () => {
  assert.match(source, /strategy: 'fixed'/)
  assert.match(source, /placement: step\.placement === 'center' \? 'center' : 'auto'/)
  assert.match(source, /arrow: \{ color: surface \}/)
})
