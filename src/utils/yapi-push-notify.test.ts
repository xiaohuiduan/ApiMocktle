import { describe, expect, it } from 'vitest'

import {
  buildYapiPushNotificationContent,
  countYapiPushKind,
  getYapiPushNotificationKey,
  mergeYapiPushCounts,
  shouldShowRefreshButton,
  YAPI_PUSH_DEBOUNCE_MS,
  YAPI_PUSH_EVENT,
  type YapiPushStats,
} from './yapi-push-notify'

describe('yapi-push-notify utils', () => {
  it('constants are correct', () => {
    expect(YAPI_PUSH_EVENT).toBe('yapi:api-pushed')
    expect(YAPI_PUSH_DEBOUNCE_MS).toBe(1000)
  })

  it('getYapiPushNotificationKey stable per project', () => {
    expect(getYapiPushNotificationKey('proj-1')).toBe('yapi-push-proj-1')
    expect(getYapiPushNotificationKey('abc')).toBe('yapi-push-abc')
  })

  it('buildYapiPushNotificationContent 同时给出推送次数、新增与合并', () => {
    const c = buildYapiPushNotificationContent('我的项目', { created: 46, merged: 8 })
    expect(c.title).toBe('项目 我的项目 有更新')
    expect(c.description).toBe('已接收 54 次推送：新增 46 条，合并 8 条，点击刷新后可见')
  })

  it('只有新增时不出现「合并 0 条」', () => {
    const c = buildYapiPushNotificationContent('项目A', { created: 3, merged: 0 })
    expect(c.description).toBe('已接收 3 次推送：新增 3 条，点击刷新后可见')
    expect(c.description).not.toContain('合并')
  })

  it('只有合并时不出现「新增 0 条」', () => {
    const c = buildYapiPushNotificationContent('项目B', { created: 0, merged: 5 })
    expect(c.description).toBe('已接收 5 次推送：合并 5 条，点击刷新后可见')
    expect(c.description).not.toContain('新增')
  })

  it('两者都为 0 时不出现悬空的冒号', () => {
    const c = buildYapiPushNotificationContent('项目C', { created: 0, merged: 0 })
    expect(c.description).toBe('已接收 0 次推送，点击刷新后可见')
    expect(c.description).not.toContain('：')
  })

  it('shouldShowRefreshButton compares active vs push project', () => {
    expect(shouldShowRefreshButton('p1', 'p1')).toBe(true)
    expect(shouldShowRefreshButton('p1', 'p2')).toBe(false)
    expect(shouldShowRefreshButton(null, 'p1')).toBe(false)
  })

  it('countYapiPushKind 按 kind 拆分，缺省 kind 计入合并', () => {
    expect(countYapiPushKind({ projectId: 'p1', projectName: 'A', count: 1, kind: 'created' }))
      .toEqual({ created: 1, merged: 0 })
    expect(countYapiPushKind({ projectId: 'p1', projectName: 'A', count: 1, kind: 'merged' }))
      .toEqual({ created: 0, merged: 1 })
    expect(countYapiPushKind({ projectId: 'p1', projectName: 'A', count: 1 }))
      .toEqual({ created: 0, merged: 1 })
  })

  it('mergeYapiPushCounts 分别累加 created / merged', () => {
    const prev = new Map<string, YapiPushStats>()
    const m1 = mergeYapiPushCounts(prev, { projectId: 'p1', projectName: '项目A', count: 1, kind: 'created' })
    expect(m1.get('p1')).toEqual({ projectName: '项目A', created: 1, merged: 0 })

    const m2 = mergeYapiPushCounts(m1, { projectId: 'p1', projectName: '项目A', count: 1, kind: 'merged' })
    expect(m2.get('p1')).toEqual({ projectName: '项目A', created: 1, merged: 1 })

    const m3 = mergeYapiPushCounts(m2, { projectId: 'p1', projectName: '项目A', count: 1, kind: 'created' })
    expect(m3.get('p1')).toEqual({ projectName: '项目A', created: 2, merged: 1 })

    const m4 = mergeYapiPushCounts(m3, { projectId: 'p2', projectName: '项目B', count: 2, kind: 'merged' })
    expect(m4.get('p2')).toEqual({ projectName: '项目B', created: 0, merged: 2 })
    expect(m4.size).toBe(2)
  })

  it('mergeYapiPushCounts 缺省 kind 计入合并', () => {
    const prev = new Map<string, YapiPushStats>()
    const m = mergeYapiPushCounts(prev, { projectId: 'p1', projectName: 'A', count: 1 })
    expect(m.get('p1')).toEqual({ projectName: 'A', created: 0, merged: 1 })

    const mergedStats = m.get('p1') ?? { projectName: '', created: 0, merged: 0 }
    const onlyMerged = buildYapiPushNotificationContent(mergedStats.projectName, mergedStats)
    expect(onlyMerged.description).toBe('已接收 1 次推送：合并 1 条，点击刷新后可见')
  })

  it('mergeYapiPushCounts fallback projectName to projectId', () => {
    const prev = new Map<string, YapiPushStats>()
    const m = mergeYapiPushCounts(prev, { projectId: 'p1', projectName: '', count: 1 })
    expect(m.get('p1')?.projectName).toBe('p1')
  })

  it('mergeYapiPushCounts does not mutate original map', () => {
    const prev = new Map<string, YapiPushStats>([['p1', { projectName: 'A', created: 0, merged: 1 }]])
    const next = mergeYapiPushCounts(prev, { projectId: 'p1', projectName: 'A', count: 1, kind: 'created' })
    expect(prev.get('p1')).toEqual({ projectName: 'A', created: 0, merged: 1 })
    expect(next.get('p1')).toEqual({ projectName: 'A', created: 1, merged: 1 })
    expect(prev).not.toBe(next)
  })

  it('mergeYapiPushCounts handles count fallback to 1', () => {
    const prev = new Map<string, YapiPushStats>()
    const m = mergeYapiPushCounts(prev, { projectId: 'p1', projectName: 'A' } as unknown as { projectId: string, projectName: string, count: number })
    expect(m.get('p1')).toEqual({ projectName: 'A', created: 0, merged: 1 })
  })

  it('handles batch aggregation simulation (debounce merge)', () => {
    // 模拟 54 次推送被防抖窗口聚成一次 flush：46 条新增 + 8 条合并
    let map = new Map<string, YapiPushStats>()

    for (let i = 0; i < 46; i++) {
      map = mergeYapiPushCounts(map, { projectId: 'p1', projectName: '批量项目', count: 1, kind: 'created' })
    }

    for (let i = 0; i < 8; i++) {
      map = mergeYapiPushCounts(map, { projectId: 'p1', projectName: '批量项目', count: 1, kind: 'merged' })
    }

    expect(map.get('p1')).toEqual({ projectName: '批量项目', created: 46, merged: 8 })
    const batchStats = map.get('p1') ?? { projectName: '', created: 0, merged: 0 }
    const content = buildYapiPushNotificationContent(batchStats.projectName, batchStats)
    expect(content.description).toBe('已接收 54 次推送：新增 46 条，合并 8 条，点击刷新后可见')
  })
})
