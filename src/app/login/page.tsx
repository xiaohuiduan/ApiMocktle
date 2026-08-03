import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router'

import { AuthForm } from '@/components/auth/AuthForm'
import { useAuth } from '@/contexts/auth'
import { resolveAuthRedirectTarget } from '@/router/auth-redirect'

export default function LoginPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { user } = useAuth()

  useEffect(() => {
    if (user) {
      const target = resolveAuthRedirectTarget(searchParams.get('redirect'))
      navigate(target, { replace: true })
    }
  }, [user, navigate, searchParams])

  return <AuthForm mode="login" />
}
