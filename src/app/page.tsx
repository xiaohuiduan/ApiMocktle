import { useEffect } from 'react'
import { useNavigate } from 'react-router'
import { useAuth } from '@/contexts/auth'

export default function RootPage() {
  const navigate = useNavigate()
  const { user, loading } = useAuth()

  useEffect(() => {
    if (loading) return
    if (user) {
      navigate('/projects', { replace: true })
    } else {
      navigate('/login', { replace: true })
    }
  }, [user, loading, navigate])

  return null
}
