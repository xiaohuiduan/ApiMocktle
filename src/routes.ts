import { index, layout, route, type RouteConfig } from '@react-router/dev/routes'

export default [
  index('app/page.tsx'),
  route('favicon.ico', 'app/favicon/ico/route.ts'),
  route('login', 'app/login/page.tsx'),
  route('register', 'app/register/page.tsx'),
  route('invites/:inviteId', 'app/invites/invite-page.tsx'),
  route('projects', 'app/projects/page.tsx'),
  route('projects/:projectId', 'app/projects/[projectId]/layout.tsx', [
    layout('app/(main)/layout.tsx', [
      route('home', 'app/(main)/home/page.tsx'),
      route('settings', 'app/(main)/settings/page.tsx'),
    ]),
  ]),
  route('test', 'app/test/page.tsx'),
  route('api/v1/auth/login', 'app/api/v1/auth/login/route.ts'),
  route('api/v1/auth/register', 'app/api/v1/auth/register/route.ts'),
  route('api/v1/auth/logout', 'app/api/v1/auth/logout/route.ts'),
  route('api/v1/auth/me', 'app/api/v1/auth/me/route.ts'),
  route('api/v1/projects', 'app/api/v1/projects/route.ts'),
  route('api/v1/projects/:projectId', 'app/api/v1/projects/[projectId]/route.ts'),
  route('api/v1/projects/:projectId/state', 'app/api/v1/projects/[projectId]/state/route.ts'),
  route('api/v1/projects/:projectId/members', 'app/api/v1/projects/[projectId]/members/route.ts'),
  route(
    'api/v1/projects/:projectId/invitations',
    'app/api/v1/projects/[projectId]/invitations/route.ts',
  ),
  route(
    'api/v1/projects/:projectId/members/:userId',
    'app/api/v1/projects/[projectId]/members/[userId]/route.ts',
  ),
  route(
    'api/v1/projects/:projectId/invitations/:inviteId',
    'app/api/v1/projects/[projectId]/invitations/[inviteId]/route.ts',
  ),
  route(
    'api/v1/project-invitations/:inviteId',
    'app/api/v1/project-invitations/[inviteId]/route.ts',
  ),
  route(
    'api/v1/project-invitations/:inviteId/accept',
    'app/api/v1/project-invitations/[inviteId]/accept/route.ts',
  ),
  route('api/v1/projects/:projectId/menu-items', 'app/api/v1/projects/[projectId]/menu-items/route.ts'),
  route(
    'api/v1/projects/:projectId/environments',
    'app/api/v1/projects/[projectId]/environments/route.ts',
  ),
  route(
    'api/v1/projects/:projectId/menu-items/:menuId',
    'app/api/v1/projects/[projectId]/menu-items/[menuId]/route.ts',
  ),
  route(
    'api/v1/projects/:projectId/menu-items/move',
    'app/api/v1/projects/[projectId]/menu-items/move/route.ts',
  ),
  route(
    'api/v1/projects/:projectId/menu-items/batch-delete',
    'app/api/v1/projects/[projectId]/menu-items/batch-delete/route.ts',
  ),
  route(
    'api/v1/projects/:projectId/recycle',
    'app/api/v1/projects/[projectId]/recycle/route.ts',
  ),
  route(
    'api/v1/projects/:projectId/recycle/:recycleId/restore',
    'app/api/v1/projects/[projectId]/recycle/[recycleId]/restore/route.ts',
  ),
  route(
    'api/v1/projects/:projectId/openapi/export',
    'app/api/v1/projects/[projectId]/openapi/export/route.ts',
  ),
  route(
    'api/v1/projects/:projectId/imports',
    'app/api/v1/projects/[projectId]/imports/route.ts',
  ),
  route(
    'api/v1/projects/:projectId/requests/run',
    'app/api/v1/projects/[projectId]/requests/run/route.ts',
  ),
  route(
    'api/v1/projects/:projectId/shared-files',
    'app/api/v1/projects/[projectId]/shared-files/route.ts',
  ),
  route(
    'api/v1/projects/:projectId/shared-files/:fileId',
    'app/api/v1/projects/[projectId]/shared-files/[fileId]/route.ts',
  ),
  route(
    'api/v1/projects/:projectId/shared-files/:fileId/download',
    'app/api/v1/projects/[projectId]/shared-files/[fileId]/download/route.ts',
  ),
  route(
    'api/v1/projects/:projectId/shared-docs',
    'app/api/v1/projects/[projectId]/shared-docs/route.ts',
  ),
  route(
    'api/v1/projects/:projectId/shared-docs/:docId',
    'app/api/v1/projects/[projectId]/shared-docs/[docId]/route.ts',
  ),
  route(
    'api/v1/projects/:projectId/shared-docs/:docId/export',
    'app/api/v1/projects/[projectId]/shared-docs/[docId]/export/route.ts',
  ),
  route(
    'api/v1/projects/:projectId/shared-docs/:docId/collab',
    'app/api/v1/projects/[projectId]/shared-docs/[docId]/collab/route.ts',
  ),
  route(
    'api/v1/projects/:projectId/shared-docs/:docId/presence',
    'app/api/v1/projects/[projectId]/shared-docs/[docId]/presence/route.ts',
  ),
  route(
    'api/v1/projects/:projectId/share-links',
    'app/api/v1/projects/[projectId]/share-links/route.ts',
  ),
  route(
    'api/v1/public/shares/:shareId',
    'app/api/v1/public/shares/[shareId]/route.ts',
  ),
  route(
    'share/:shareId',
    'app/share/[shareId]/page.tsx',
  ),
] satisfies RouteConfig
