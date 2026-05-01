import { useEffect } from 'react'
import { Outlet, useNavigate, useParams } from 'react-router'
import { useAuth } from '@/contexts/auth'

export default function ProjectLayout() {
  const navigate = useNavigate()
  const { user, loading } = useAuth()
  const { projectId } = useParams()

  useEffect(() => {
    if (!loading && !user) {
      navigate('/login', { replace: true })
    }
  }, [user, loading, navigate])

  if (loading || !user) {
    return null
  }

  return <Outlet />
}
