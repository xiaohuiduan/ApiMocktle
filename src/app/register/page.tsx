import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router'

import { AuthForm } from '@/components/auth/AuthForm'
import { useAuth } from '@/contexts/auth'

function resolveRedirectTarget(value: string | null | undefined) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) {
    return '/projects'
  }
  return value
}

export default function RegisterPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { user } = useAuth()

  useEffect(() => {
    if (user) {
      const target = resolveRedirectTarget(searchParams.get('redirect'))
      navigate(target, { replace: true })
    }
  }, [user, navigate, searchParams])

  return <AuthForm mode="register" />
}
