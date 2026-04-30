import { redirect, type LoaderFunctionArgs } from 'react-router'

export async function loader({ request }: LoaderFunctionArgs) {
  const { getSessionUserFromRequest } = await import('@/server/auth')
  const { user } = getSessionUserFromRequest(request)

  if (!user) {
    return redirect('/login')
  }

  return redirect('/projects')
}

export default function RootPage() {
  return null
}
