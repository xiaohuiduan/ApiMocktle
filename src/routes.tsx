import { Route } from 'react-router'

import HomePage from '@/app/(main)/home/page'
import MainLayout from '@/app/(main)/layout'
import SettingsPage from '@/app/(main)/settings/page'
import TestTaskDetailPage from '@/app/(main)/tests/[taskId]/page'
import TestTaskListPage from '@/app/(main)/tests/page'
import LoginPage from '@/app/login/page'
import RootPage from '@/app/page'
import ProjectLayout from '@/app/projects/[projectId]/layout'
import ProjectsPage from '@/app/projects/page'
import RegisterPage from '@/app/register/page'

import Root from './root'

export const appRoutes = (
  <Route element={<Root />}>
    <Route index element={<RootPage />} />
    <Route element={<LoginPage />} path="login" />
    <Route element={<RegisterPage />} path="register" />
    <Route element={<ProjectsPage />} path="projects" />
    <Route element={<ProjectLayout />} path="projects/:projectId">
      <Route element={<MainLayout />}>
        <Route index element={<HomePage />} />
        <Route element={<HomePage />} path="home" />
        <Route element={<SettingsPage />} path="settings" />
        <Route element={<TestTaskListPage />} path="tests" />
        <Route element={<TestTaskDetailPage />} path="tests/:taskId" />
      </Route>
    </Route>
  </Route>
)
