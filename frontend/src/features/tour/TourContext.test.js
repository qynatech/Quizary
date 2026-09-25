import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./TourContext.jsx', import.meta.url), 'utf8')

test('resets all session page tours when replay is requested', () => {
  assert.match(source, /autoStarted\.current\.clear\(\)/)
})

test('resets automatic tour state and timers on user identity changes', () => {
  assert.match(source, /userSession\.current !== currentUserSession/)
  assert.match(source, /autoStarted\.current\.clear\(\)/)
  assert.match(source, /for \(const timer of pending\.current\.values\(\)\) clearTimeout\(timer\)/)
  assert.match(source, /pending\.current\.clear\(\)/)
})

test('clears active tour state and persisted reservation on identity changes', () => {
  const identityReset = source.match(/userSession\.current !== currentUserSession[\s\S]*?\n  \}/)?.[0]
  assert.ok(identityReset)
  assert.match(identityReset, /activeKey\.current = null/)
  assert.match(identityReset, /setActiveTourState\(null\)/)
  assert.match(identityReset, /setRun\(false\)/)
  assert.match(identityReset, /endTourSession\(\{ storage: undefined \}\)/)
})

test('creates or continues an owned cross-page session before automatic scheduling', () => {
  assert.match(source, /claimFirstLoginSession\(userAtRegistration, key, \{\s*canProceed,?\s*\}\)/)
  assert.match(source, /continueTourSession\(userAtRegistration, reservationKey, key, \{\s*storage: undefined,?\s*\}\)/)
  assert.match(source, /if \(!session \|\| !canProceed\(\)\) return/)
})

test('marks the actually started page once in the active session', () => {
  assert.match(source, /markSessionPageShown\(session, userAtStart, registration\.reservationKey, \{\s*storage: undefined,?\s*\}\)/)
  assert.match(source, /if \(!markedSession && !force\) return/)
})

test('uses a stable page reservation key while keeping variant tour status', () => {
  assert.match(source, /const reservationKey = options\.reservationKey \?\? page/)
  assert.match(source, /continueTourSession\(userAtRegistration, reservationKey, key, \{\s*storage: undefined,?\s*\}\)/)
  assert.match(source, /getTourStatus\(userTourKey\(userAtRegistration, key\)\) === 'unseen'/)
  assert.match(source, /reservationKey = page/)
})

test('guards forced replay timers and final activation with current context', () => {
  assert.match(source, /if \(activeKey\.current === key && force\)/)
  assert.match(source, /if \(!canProceed\(\)\) return false/)
  assert.match(source, /const replayUser = userRef\.current/)
  assert.match(source, /const replayRoute = locationRef\.current/)
  assert.match(source, /const replayRegistration = registrations\.current\.get\(key\)/)
  assert.match(source, /isSameTourContext\(replayUser, userRef\.current, replayRoute, locationRef\.current, replayRegistration, registrations\.current\.get\(key\)\)/)
})

test('manual replay creates a session and consumes a matching new-account marker', () => {
  assert.match(source, /startManualTourSession\(replayUser, \{/)
  assert.match(source, /consumeMarker: \(\) => isPendingNewAccount\(replayUser\) \? consumeNewAccount\(replayUser\) : false/)
  assert.match(source, /beginTour\(key, true\)/)
})

test('finish completes the current page without ending the session', () => {
  const finished = source.match(/if \(data\?\.status === 'finished' \|\| action === 'finish'\) \{([\s\S]*?)\n    \} else if/)?.[1]
  assert.ok(finished)
  assert.match(finished, /saveTourStatus\(userTourKey\(owner, key\), 'completed'\)/)
  assert.equal(/endTourSession\(\{ storage: undefined \}\)/.test(finished), false)
})

test('skip or close ends the active session', () => {
  const skipped = source.match(/if \(data\?\.status === 'skipped' \|\| action === 'skip'\) \{([\s\S]*?)\n    \} else if/)?.[1]
  const closed = source.match(/if \(action === 'close' \|\| action === 'escape'\) \{([\s\S]*?)\n    \}/)?.[1]
  assert.ok(skipped)
  assert.ok(closed)
  assert.match(skipped, /saveTourStatus\(userTourKey\(owner, key\), 'skipped'\)/)
  assert.match(skipped, /endTourSession\(\{ storage: undefined \}\)/)
  assert.match(closed, /saveTourStatus\(userTourKey\(owner, key\), 'dismissed'\)/)
  assert.match(closed, /endTourSession\(\{ storage: undefined \}\)/)
})

test('identity changes end the session without clearing a valid same-user refresh', () => {
  assert.match(source, /userSession\.current !== currentUserSession/)
  assert.match(source, /endTourSession\(\{ storage: undefined \}\)/)
})

test('jumps to the changed step when the same page changes variant', () => {
  assert.match(source, /activeTourSnapshot\.reservationKey === reservationKey/)
  assert.match(source, /findChangedStepIndex\(activeTourSnapshot\.steps, nextSteps\)/)
  assert.match(source, /steps: changedIndex >= 0 \? nextSteps\.slice\(changedIndex\) : nextSteps/)
  assert.match(source, /setActiveTourState\(\{/)
})

test('holds position when the current step target survives a variant change', () => {
  assert.match(source, /const currentTarget = activeTourSnapshot\.steps\[currentIndex\]\?\.target/)
  assert.match(source, /if \(currentTarget && nextTargets\.has\(currentTarget\)\)/)
  assert.match(source, /if \(typeof data\?\.index === 'number'\) indexRef\.current = data\.index/)
})

test('leaves Joyride uncontrolled so Next and Back work natively', () => {
  assert.equal(/stepIndex=\{stepIndex\}/.test(source), false)
  assert.equal(/setStepIndexState/.test(source), false)
})

test('never reschedules a page already shown in the session', () => {
  assert.match(source, /if \(hasSessionPage\(session, reservationKey\)\) return/)
})

test('never restarts a shown page at activation time', () => {
  assert.match(source, /if \(!force && hasSessionPage\(session, registration\.reservationKey\)\) return/)
})

test('records the session page when scheduling so refresh cannot repeat it', () => {
  assert.match(source, /const markedSession = await markSessionPageShown\(session, userAtRegistration, reservationKey, \{/)
  assert.match(source, /if \(!markedSession \|\| !canProceed\(\)\) return/)
})

test('keeps tooltips inside the viewport and themes the arrow', () => {
  assert.match(source, /strategy: 'fixed'/)
  assert.match(source, /placement: step\.placement === 'center' \? 'center' : 'auto'/)
  assert.match(source, /arrow: \{ color: surface \}/)
})

test('marks successful registration as a pending first-login account', () => {
  const authSource = readFileSync(new URL('../../context/AuthContext.jsx', import.meta.url), 'utf8')
  const registerSource = authSource.match(/const register = useCallback\(async \([^\n]*\) => \{([\s\S]*?)\n  \}, \[\]\)/)?.[1]

  assert.match(authSource, /import \{ markNewAccount \} from '\.\.\/features\/tour\/tourStorage'/)
  assert.ok(registerSource)
  assert.match(registerSource, /const res = await api\.post\('\/register', \{[^\n]*\}\)\s*const data = res\.data\s*markNewAccount\(data\.email\)\s*return data/)
})
