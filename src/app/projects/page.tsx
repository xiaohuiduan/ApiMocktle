import { useEffect } from 'react'
import { useNavigate } from 'react-router'

import { ProjectsClient } from '@/components/projects/ProjectsClient'
import { useAuth } from '@/contexts/auth'

export default function ProjectsPage() {
  const navigate = useNavigate()
  const { user, loading } = useAuth()

  useEffect(() => {
    if (!loading && !user) {
      navigate('/login', { replace: true })
    }
  }, [user, loading, navigate])

  if (loading || !user) {
    return null
  }

  return <ProjectsClient />
}
