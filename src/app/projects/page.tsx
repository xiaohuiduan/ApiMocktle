import { type LoaderFunctionArgs } from 'react-router'

import { ProjectsClient } from '@/components/projects/ProjectsClient'
import { requireAuthenticatedUser } from '@/router/page-auth'

export async function loader({ request }: LoaderFunctionArgs) {
  await requireAuthenticatedUser(request)
  return null
}

export default function ProjectsPage() {
  return <ProjectsClient />
}
