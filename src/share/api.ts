/** 访客只读应用的 API 封装：同源 fetch，不依赖 Tauri IPC */

const TOKEN_KEY = 'apimocktle_share_token'

export class ShareApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export function getToken(): string {
  return localStorage.getItem(TOKEN_KEY) ?? ''
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}

export interface ShareLoginResult {
  token: string
  projectName: string
  title: string
  expiresAt?: string
}

export interface ShareMenuItem {
  id: string
  parentId?: string
  name: string
  type: string
  data?: unknown
  sortOrder: number
  updatedAt: string
}

export interface ShareMenuData {
  shareId: string
  project: { id: string, name: string }
  title: string
  expiresAt?: string
  items: ShareMenuItem[]
}

export interface ShareOverview {
  apiCount: number
  docCount: number
  schemaCount: number
  folderCount: number
  itemCount: number
  updatedAt?: string
}

interface ApiEnvelope<T> {
  errcode: number
  errmsg: string
  data: T
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-Share-Token': getToken(),
    },
  })
  const json = (await res.json().catch(() => null)) as ApiEnvelope<T> | null

  if (!res.ok || !json || json.errcode !== 0) {
    throw new ShareApiError(json?.errmsg ?? `请求失败(${res.status})`, res.status)
  }

  return json.data
}

export const shareApi = {
  async login(shareId: string, password: string): Promise<ShareLoginResult> {
    return request<ShareLoginResult>('/api/share/login', {
      method: 'POST',
      body: JSON.stringify({ shareId, password }),
    })
  },

  async menu(): Promise<ShareMenuData> {
    return request<ShareMenuData>('/api/share/menu')
  },

  async item(id: string): Promise<ShareMenuItem> {
    return request<ShareMenuItem>(`/api/share/item/${encodeURIComponent(id)}`)
  },

  async overview(): Promise<ShareOverview> {
    return request<ShareOverview>('/api/share/overview')
  },
}

/** 从 URL hash 解析分享 ID：形如 #/share/xxxx 或 #/share/xxxx?pwd=yyy */
export function parseShareId(): string {
  const match = /#\/share\/([^/?#]+)/.exec(location.hash)

  return match?.[1] ?? ''
}

/** 从 URL hash 解析带密码链接的密码参数：?pwd=yyy */
export function parseSharePwd(): string {
  const match = /[?#&]pwd=([^&]+)/.exec(location.hash)

  return match ? decodeURIComponent(match[1]) : ''
}
