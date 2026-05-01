import { Route } from 'react-router'

import RootPage from '@/app/page'
import LoginPage from '@/app/login/page'
import RegisterPage from '@/app/register/page'
import ProjectsPage from '@/app/projects/page'
import ProjectLayout from '@/app/projects/[projectId]/layout'
import MainLayout from '@/app/(main)/layout'
import HomePage from '@/app/(main)/home/page'
import SettingsPage from '@/app/(main)/settings/page'
import TestPage from '@/app/test/page'
import ProjectInvitePage from '@/app/invites/invite-page'

import Root from './root'

export const appRoutes = (
  <Route element={<Root />}>
    <Route index element={<RootPage />} />
    <Route path="login" element={<LoginPage />} />
    <Route path="register" element={<RegisterPage />} />
    <Route path="invites/:inviteId" element={<ProjectInvitePage />} />
    <Route path="projects" element={<ProjectsPage />} />
    <Route path="projects/:projectId" element={<ProjectLayout />}>
      <Route element={<MainLayout />}>
        <Route index element={<HomePage />} />
        <Route path="home" element={<HomePage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
    </Route>
    <Route path="test" element={<TestPage />} />
  </Route>
)
