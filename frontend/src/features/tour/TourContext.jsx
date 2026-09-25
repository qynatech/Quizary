import { Suspense, createContext, lazy, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { usePrefs } from '../../context/PreferencesContext'
import { availableSteps, saveTourStatus, tourKey } from './tourStorage'
import { loadJoyride } from './joyrideLoader'
import TourTooltip from './TourTooltip'

const Joyride = lazy(() => loadJoyride().then((component) => ({ default: component })))
const TourContext = createContext(null)
const RETRY_DELAYS = [120, 320, 700]

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
  const registrations = useRef(new Map())
  const pending = useRef(new Map())
  const activeKey = useRef(null)
  const autoStarted = useRef(new Set())
  const [activeTour, setActiveTour] = useState(null)
  const [run, setRun] = useState(false)

  const clearPending = useCallback((key) => {
    const timer = pending.current.get(key)
    if (timer) clearTimeout(timer)
    pending.current.delete(key)
  }, [])

  const beginTour = useCallback((key, force = false) => {
    const registration = registrations.current.get(key)
    if (!registration) return false
    clearPending(key)
     if (activeKey.current === key && force) {
       setRun(true)
       return true
     }

     const start = (attempt = 0) => {
       const steps = availableSteps(registration.steps).map((step) => ({
         ...step,
         skipBeacon: true,
         placement: step.placement === 'center' ? 'center' : 'auto',
         floatingOptions: {
           strategy: 'fixed',
           shiftOptions: { padding: 16 },
           ...step.floatingOptions,
         },
       }))

      if (steps.length && (steps.length === registration.steps.length || attempt >= RETRY_DELAYS.length)) {
         activeKey.current = key
         autoStarted.current.add(key)
         setActiveTour({ key, steps })
         setRun(true)

        return
      }
      const delay = RETRY_DELAYS[attempt]
      if (delay) pending.current.set(key, setTimeout(() => start(attempt + 1), delay))
    }
    start()
    return true
  }, [clearPending])

  const registerTour = useCallback((page, variant, steps, options = {}) => {
    const key = tourKey(page, variant)
    registrations.current.set(key, { page, variant, steps })
    if (activeKey.current && activeKey.current !== key) {
      activeKey.current = null
      setActiveTour(null)
      setRun(false)
    }
     if (options.auto === false || activeKey.current === key || autoStarted.current.has(key)) return

    clearPending(key)
    pending.current.set(key, setTimeout(() => beginTour(key), options.delay ?? 180))
  }, [beginTour, clearPending])

  const unregisterTour = useCallback((key) => {
    clearPending(key)
    registrations.current.delete(key)
  }, [clearPending])

  const replayTour = useCallback((page, variant = 'default') => {
    autoStarted.current.clear()
    for (const key of pending.current.keys()) clearPending(key)
    activeKey.current = null
    setRun(false)
    setActiveTour(null)
    setTimeout(() => beginTour(tourKey(page, variant), true), 0)
  }, [beginTour, clearPending])

  const handleCallback = useCallback((data, action) => {
    if (!activeKey.current) return
    const key = activeKey.current
    if (data?.status === 'finished' || action === 'finish') {
      saveTourStatus(key, 'completed')
      activeKey.current = null
      setRun(false)
      setActiveTour(null)
    } else if (data?.status === 'skipped' || action === 'skip') {
      saveTourStatus(key, 'skipped')
      activeKey.current = null
      setRun(false)
      setActiveTour(null)
    } else if (action === 'close' || action === 'escape') {
      saveTourStatus(key, 'dismissed')
      activeKey.current = null
      setRun(false)
      setActiveTour(null)
    }
  }, [])

  useEffect(() => {
    activeKey.current = null
    setRun(false)
    setActiveTour(null)
  }, [location.pathname])

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

export function usePageTour(page, { variant = 'default', variantKey = variant, steps = [], auto = true, delay = 180 } = {}) {
  const { registerTour, unregisterTour, replayTour } = useTour()
  const key = tourKey(page, variant)
  const stepsRef = useRef(steps)
  stepsRef.current = steps

  useEffect(() => {
    if (!stepsRef.current.length) {
      unregisterTour(key)
      return undefined
    }
    registerTour(page, variant, stepsRef.current, { auto, delay })
    return () => unregisterTour(key)
  }, [page, variant, variantKey, auto, delay, key, registerTour, unregisterTour])

  return { key, replay: () => replayTour(page, variant) }
}
