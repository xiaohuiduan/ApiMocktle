export const YAPI_PUSH_EVENT = 'yapi:api-pushed'
export const YAPI_PUSH_DEBOUNCE_MS = 1000

export interface YapiPushPayload {
  projectId: string
  projectName: string
  count: number
}

export function getYapiPushNotificationKey(projectId: string): string {
  return `yapi-push-${projectId}`
}

export function buildYapiPushNotificationContent(projectName: string, count: number): { title: string, description: string } {
  return {
    title: `项目 ${projectName} 有更新`,
    description: `检测到 ${count} 个接口已推送，点击刷新后可见`,
  }
}

export function mergeYapiPushCounts(
  prev: Map<string, { projectName: string, count: number }>,
  payload: YapiPushPayload,
): Map<string, { projectName: string, count: number }> {
  const next = new Map(prev)
  const existing = next.get(payload.projectId)

  if (existing) {
    next.set(payload.projectId, {
      projectName: payload.projectName || existing.projectName,
      count: existing.count + (payload.count || 1),
    })
  }
  else {
    next.set(payload.projectId, {
      projectName: payload.projectName || payload.projectId,
      count: payload.count || 1,
    })
  }

  return next
}

export function shouldShowRefreshButton(activeProjectId: string | null, pushProjectId: string): boolean {
  return activeProjectId === pushProjectId
}
