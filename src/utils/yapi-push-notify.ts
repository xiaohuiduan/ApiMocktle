export const YAPI_PUSH_EVENT = 'yapi:api-pushed'
export const YAPI_PUSH_DEBOUNCE_MS = 1000

export interface YapiPushPayload {
  projectId: string
  projectName: string
  count: number
  /** 后端标注的动作类型；老客户端不带该字段 */
  kind?: 'created' | 'merged'
}

/** 单个项目已累计的推送明细 */
export interface YapiPushStats {
  projectName: string
  created: number
  merged: number
}

/** 载荷里的明细计数：只有显式 created 才算新增，缺省一律按合并处理，避免虚报新增 */
export function countYapiPushKind(payload: YapiPushPayload): { created: number, merged: number } {
  const count = payload.count || 1

  return payload.kind === 'created'
    ? { created: count, merged: 0 }
    : { created: 0, merged: count }
}

export function getYapiPushNotificationKey(projectId: string): string {
  return `yapi-push-${projectId}`
}

export function buildYapiPushNotificationContent(
  projectName: string,
  stats: Pick<YapiPushStats, 'created' | 'merged'>,
): { title: string, description: string } {
  const { created, merged } = stats
  const details: string[] = []

  if (created > 0) {
    details.push(`新增 ${created} 条`)
  }

  if (merged > 0) {
    details.push(`合并 ${merged} 条`)
  }

  const summary = created + merged
  // 明细全为 0 时不留下悬空的「：」，退化成一句完整的话
  const description = details.length > 0
    ? `已接收 ${summary} 次推送：${details.join('，')}，点击刷新后可见`
    : `已接收 ${summary} 次推送，点击刷新后可见`

  return {
    title: `项目 ${projectName} 有更新`,
    description,
  }
}

export function mergeYapiPushCounts(
  prev: Map<string, YapiPushStats>,
  payload: YapiPushPayload,
): Map<string, YapiPushStats> {
  const next = new Map(prev)
  const existing = next.get(payload.projectId)
  const delta = countYapiPushKind(payload)

  if (existing) {
    next.set(payload.projectId, {
      projectName: payload.projectName || existing.projectName,
      created: existing.created + delta.created,
      merged: existing.merged + delta.merged,
    })
  }
  else {
    next.set(payload.projectId, {
      projectName: payload.projectName || payload.projectId,
      created: delta.created,
      merged: delta.merged,
    })
  }

  return next
}

export function shouldShowRefreshButton(activeProjectId: string | null, pushProjectId: string): boolean {
  return activeProjectId === pushProjectId
}
