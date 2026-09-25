import { useEffect, useState } from 'react'
import api from '../api/client'

export function useRegistrationStatus() {
  const [registrationOpen, setRegistrationOpen] = useState(true)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const controller = new AbortController()
    api.get('/registration/status', { signal: controller.signal })
      .then(({ data }) => setRegistrationOpen(data.registration_open))
      .catch((error) => {
        if (error.name !== 'CanceledError' && error.name !== 'AbortError') setRegistrationOpen(true)
      })
      .finally(() => setLoading(false))
    return () => controller.abort()
  }, [])

  return { registrationOpen, loading }
}
