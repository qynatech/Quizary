export function getAuthenticatedPath(user, fallback = '/') {
  if (user?.role === 'admin') return '/admin'
  return fallback || '/'
}
