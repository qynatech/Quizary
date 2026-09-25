export async function loadJoyride() {
  const module = await import('react-joyride')
  return module.Joyride
}
