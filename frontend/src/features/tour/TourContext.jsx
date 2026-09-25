import { Suspense, createContext, lazy, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { usePrefs } from '../../context/PreferencesContext'
import { useAuth } from '../../hooks/useAuth'
import { findChangedStepIndex, isSameTourContext } from './tourLifecycle'
import {
  availableSteps,
  consumeNewAccount,
  getTourStatus,
  isPendingNewAccount,
  saveTourStatus,
  tourKey,
  userTourKey,
} from './tourStorage'
import {
  claimFirstLoginSession,
  continueTourSession,
  endTourSession,
  hasSessionPage,
  isTourSessionOwner,
  markSessionPageShown,
  readTourSession,
  startManualTourSession,
} from './tourSession'
import { loadJoyride } from './joyrideLoader'
import TourTooltip from './TourTooltip'

const Joyride = lazy(() => loadJoyride().then((component) => ({ default: component })))
const TourContext = createContext(null)
const RETRY_DELAYS = [120, 320, 700]

function prepareSteps(steps) {
  return availableSteps(steps).map((step) => ({
    ...step,
    skipBeacon: true,
    placement: step.placement === 'center' ? 'center' : 'auto',
    floatingOptions: {
      strategy: 'fixed',
      shiftOptions: { padding: 16 },
      ...step.floatingOptions,
    },
  }))
}

function tourStyles(dark) {
  const surface = dark ? '#111827' : '#ffffff'
   return {
     arrow: { color: surface },
     options: {

      backgroundColor: 'transparent',
      border: 'none',
      borderRadius: '24px',
      boxShadow: 'none',
      maxWidth: 'calc(100vw - 24px)',
      padding: 0,
      width: '380px',
      zIndex: 100,
    },
  }
}

export function TourProvider({ children }) {
  const location = useLocation()
  const { dark } = usePrefs()
  const { user } = useAuth()
  const userRef = useRef(user)
  userRef.current = user
  const locationRef = useRef(location.pathname)
  locationRef.current = location.pathname
  const registrations = useRef(new Map())
  const pending = useRef(new Map())
  const activeKey = useRef(null)
  const autoStarted = useRef(new Set())
  const userSession = useRef(`${user?.id || ''}:${user?.email || ''}`)
  const currentUserSession = `${user?.id || ''}:${user?.email || ''}`
  const [activeTour, setActiveTour] = useState(null)
  const [run, setRun] = useState(false)
  const activeTourRef = useRef(null)
  const indexRef = useRef(0)
  const setActiveTourState = useCallback((tour) => {
    activeTourRef.current = tour
    setActiveTour(tour)
  }, [])

  const clearPending = useCallback((key) => {
    const timer = pending.current.get(key)
    if (timer) clearTimeout(timer)
    pending.current.delete(key)
  }, [])

  useEffect(() => {
    if (userSession.current !== currentUserSession) {
      userSession.current = currentUserSession
      activeKey.current = null
      setRun(false)
      setActiveTourState(null)
      autoStarted.current.clear()
      for (const timer of pending.current.values()) clearTimeout(timer)
      pending.current.clear()
      endTourSession({ storage: undefined })
    }
  }, [clearPending, currentUserSession, setActiveTourState])

  const beginTour = useCallback(async (key, force = false) => {
    const registration = registrations.current.get(key)
    if (!registration) return false
    clearPending(key)
    const userAtStart = userRef.current
    const routeAtStart = locationRef.current
    const canProceed = () => isSameTourContext(
      userAtStart,
      userRef.current,
      routeAtStart,
      locationRef.current,
      registration,
      registrations.current.get(key),
    )

    if (activeKey.current === key && force) {
      if (!canProceed()) return false
      setRun(true)
      return true
    }

    const start = async (attempt = 0) => {
      const steps = prepareSteps(registration.steps)

      if (steps.length && (steps.length === registration.steps.length || attempt >= RETRY_DELAYS.length)) {
        const session = readTourSession()
        if (!force && (!session || !isTourSessionOwner(session, userAtStart))) return
        if (!force && hasSessionPage(session, registration.reservationKey)) return
        const markedSession = session
          ? await markSessionPageShown(session, userAtStart, registration.reservationKey, { storage: undefined })
          : null
        if (!markedSession && !force) return
        if (!canProceed()) return
        activeKey.current = key

        autoStarted.current.add(key)
        setActiveTourState({ key, steps, reservationKey: registration.reservationKey })
          setRun(true)

        return
      }
      const delay = RETRY_DELAYS[attempt]
      if (delay) pending.current.set(key, setTimeout(() => start(attempt + 1), delay))
    }
    start()
    return true
  }, [clearPending, setActiveTourState])

  const registerTour = useCallback((page, variant, steps, options = {}) => {
    const key = tourKey(page, variant)
    const reservationKey = options.reservationKey ?? page
    const registration = { page, variant, steps, reservationKey }
    registrations.current.set(key, registration)
    const activeTourSnapshot = activeTourRef.current
    if (
      activeTourSnapshot &&
      activeTourSnapshot.reservationKey === reservationKey &&
      activeKey.current !== key
    ) {
      const nextSteps = prepareSteps(steps)
      clearPending(key)
      if (!nextSteps.length) {
        activeKey.current = null
        setActiveTourState(null)
          setRun(false)
        return
      }
      const currentIndex = Math.min(indexRef.current, activeTourSnapshot.steps.length - 1)
      const currentTarget = activeTourSnapshot.steps[currentIndex]?.target
      const nextTargets = new Set(nextSteps.map((step) => step.target))
      activeKey.current = key
      autoStarted.current.add(key)
      if (currentTarget && nextTargets.has(currentTarget)) {
        setActiveTourState({ key, steps: nextSteps, reservationKey })
        return
      }
      const changedIndex = findChangedStepIndex(activeTourSnapshot.steps, nextSteps)
      setActiveTourState({
        key,
        steps: changedIndex >= 0 ? nextSteps.slice(changedIndex) : nextSteps,
        reservationKey,
      })
      return
    }
    if (activeKey.current && activeKey.current !== key) {
      activeKey.current = null
      setActiveTourState(null)
      setRun(false)
    }
    const schedule = async () => {
      if (options.auto === false) return
      const userAtRegistration = userRef.current
      const routeAtRegistration = locationRef.current
      const canProceed = () => isSameTourContext(
        userAtRegistration,
        userRef.current,
        routeAtRegistration,
        locationRef.current,
        registration,
        registrations.current.get(key),
      )
      const claimedSession = await claimFirstLoginSession(userAtRegistration, key, {
        canProceed,
      })
      const session = claimedSession || continueTourSession(userAtRegistration, reservationKey, key, {
        storage: undefined,
      })
      if (!session || !canProceed()) return
      if (hasSessionPage(session, reservationKey)) return
      const markedSession = await markSessionPageShown(session, userAtRegistration, reservationKey, {
        storage: undefined,
      })
      if (!markedSession || !canProceed()) return
      if (
        activeKey.current !== key &&
        !autoStarted.current.has(key) &&
        getTourStatus(userTourKey(userAtRegistration, key)) === 'unseen'
      ) {
        clearPending(key)
        pending.current.set(key, setTimeout(() => beginTour(key), options.delay ?? 180))
      }
    }
    schedule()
  }, [beginTour, clearPending, setActiveTourState])

  const unregisterTour = useCallback((key) => {
    clearPending(key)
    registrations.current.delete(key)
  }, [clearPending])

  const replayTour = useCallback(async (page, variant = 'default') => {
    const key = tourKey(page, variant)
    const replayUser = userRef.current
    const replayRoute = locationRef.current
    const replayRegistration = registrations.current.get(key)
    autoStarted.current.clear()
    for (const pendingKey of pending.current.keys()) clearPending(pendingKey)
    activeKey.current = null
    setRun(false)
    setActiveTourState(null)
    const session = await startManualTourSession(replayUser, {
      consumeMarker: () => isPendingNewAccount(replayUser) ? consumeNewAccount(replayUser) : false,
    })
    if (!session || !isSameTourContext(replayUser, userRef.current, replayRoute, locationRef.current, replayRegistration, registrations.current.get(key))) return
    setTimeout(() => {
      if (!isSameTourContext(replayUser, userRef.current, replayRoute, locationRef.current, replayRegistration, registrations.current.get(key))) return
      beginTour(key, true)
    }, 0)
  }, [beginTour, clearPending, setActiveTourState])

  const handleCallback = useCallback((data, action) => {
    if (typeof data?.index === 'number') indexRef.current = data.index
    if (!activeKey.current) return
    const key = activeKey.current
    const owner = userRef.current
    if (data?.status === 'finished' || action === 'finish') {
      saveTourStatus(userTourKey(owner, key), 'completed')
      activeKey.current = null
      setRun(false)
      setActiveTourState(null)
    } else if (data?.status === 'skipped' || action === 'skip') {
      saveTourStatus(userTourKey(owner, key), 'skipped')
      endTourSession({ storage: undefined })
      activeKey.current = null
      setRun(false)
      setActiveTourState(null)
    } else if (action === 'close' || action === 'escape') {
      saveTourStatus(userTourKey(owner, key), 'dismissed')
      endTourSession({ storage: undefined })
      activeKey.current = null
      setRun(false)
      setActiveTourState(null)
    }
  }, [setActiveTourState])

  useEffect(() => {
    activeKey.current = null
    setRun(false)
    setActiveTourState(null)
  }, [location.pathname, setActiveTourState])

  const styles = useMemo(() => tourStyles(dark), [dark])
  const context = useMemo(() => ({ registerTour, unregisterTour, replayTour }), [registerTour, unregisterTour, replayTour])

  return (
    <TourContext.Provider value={context}>
      {children}
      {activeTour && run && (
        <Suspense fallback={null}>
          <Joyride
            continuous
             run={run}
             steps={activeTour.steps}
             callback={handleCallback}

            disableOverlayClose
            disableScrolling={false}
            hideBackButton={activeTour.steps.length < 2}
            locale={{ back: 'Back', close: 'Close', last: 'Done', next: 'Next', skip: 'Skip' }}
            scrollOffset={96}
            showProgress
            showSkipButton
            spotlightClicks={false}
            spotlightPadding={8}
            styles={styles}
            tooltipComponent={TourTooltip}
          />
        </Suspense>
      )}
    </TourContext.Provider>
  )
}

export function useTour() {
  const context = useContext(TourContext)
  return context || { registerTour: () => {}, unregisterTour: () => {}, replayTour: () => false }
}

export function usePageTour(page, { variant = 'default', variantKey = variant, reservationKey = page, steps = [], auto = true, delay = 180 } = {}) {
  const { registerTour, unregisterTour, replayTour } = useTour()
  const key = tourKey(page, variant)
  const stepsRef = useRef(steps)
  stepsRef.current = steps

  useEffect(() => {
    if (!stepsRef.current.length) {
      unregisterTour(key)
      return undefined
    }
    registerTour(page, variant, stepsRef.current, { auto, delay, reservationKey })
    return () => unregisterTour(key)
  }, [page, variant, variantKey, reservationKey, auto, delay, key, registerTour, unregisterTour])

  return { key, replay: () => replayTour(page, variant) }
}
