export type ProjectRole = 'owner' | 'editor' | 'viewer'
export type ProjectPermission = 'viewer' | 'editor' | 'owner'
export type AssignableProjectRole = Exclude<ProjectRole, 'owner'>
export type ProjectInvitationStatus = 'pending' | 'accepted' | 'revoked'

export interface ApiSuccessResponse<T> {
  ok: true
  data: T
  error: null
}

export interface ApiErrorResponse {
  ok: false
  data: null
  error: string
}

export interface SessionUser {
  id: string
  username: string
}

export interface ProjectItem {
  id: string
  name: string
  role: ProjectRole
  ownerId: string
  createdAt: string
  icon?: string
}

export interface ProjectInvitationItem {
  id: string
  projectId: string
  projectName: string
  inviterUserId: string
  inviterUsername: string
  role: AssignableProjectRole
  status: ProjectInvitationStatus
  createdAt: string
  expiresAt: string
  acceptedAt?: string
  acceptedByUserId?: string
  isExpired: boolean
}
