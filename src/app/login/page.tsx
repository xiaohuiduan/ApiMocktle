import { type LoaderFunctionArgs } from 'react-router'

import { AuthForm } from '@/components/auth/AuthForm'
import { redirectIfAuthenticated } from '@/router/page-auth'

export async function loader({ request }: LoaderFunctionArgs) {
  await redirectIfAuthenticated(request)
  return null
}

export default function LoginPage() {
  return <AuthForm mode="login" />
}
