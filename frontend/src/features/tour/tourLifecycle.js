export function isSameTourContext(initialUser, currentUser, initialRoute, currentRoute, initialRegistration, currentRegistration) {
  return (
    initialUser?.id === currentUser?.id &&
    initialUser?.email === currentUser?.email &&
    initialRoute === currentRoute &&
    initialRegistration === currentRegistration
  )
}

function stepIdentity(step, index) {
  return step?.target ?? `#${index}`
}

export function findChangedStepIndex(oldSteps, newSteps) {
  const previous = Array.isArray(oldSteps) ? oldSteps : []
  const next = Array.isArray(newSteps) ? newSteps : []
  const previousTargets = new Set(previous.map(stepIdentity))
  const changed = next.findIndex((step, index) => !previousTargets.has(stepIdentity(step, index)))
  return changed >= 0 ? changed : previous.length ? -1 : 0
}
