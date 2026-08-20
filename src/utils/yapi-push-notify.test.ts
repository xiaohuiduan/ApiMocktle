import { describe, expect, it } from 'vitest'

import {
  buildYapiPushNotificationContent,
  getYapiPushNotificationKey,
  mergeYapiPushCounts,
  shouldShowRefreshButton,
  YAPI_PUSH_DEBOUNCE_MS,
  YAPI_PUSH_EVENT,
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

  it('buildYapiPushNotificationContent returns title/description', () => {
    const c1 = buildYapiPushNotificationContent('我的项目', 1)
    expect(c1.title).toBe('项目 我的项目 有更新')
    expect(c1.description).toBe('检测到 1 个接口已推送，点击刷新后可见')

    const c5 = buildYapiPushNotificationContent('测试项目', 5)
    expect(c5.description).toContain('5 个接口')
  })

  it('shouldShowRefreshButton compares active vs push project', () => {
    expect(shouldShowRefreshButton('p1', 'p1')).toBe(true)
    expect(shouldShowRefreshButton('p1', 'p2')).toBe(false)
    expect(shouldShowRefreshButton(null, 'p1')).toBe(false)
  })

  it('mergeYapiPushCounts merges counts for same project', () => {
    const prev = new Map<string, { projectName: string, count: number }>()
    const m1 = mergeYapiPushCounts(prev, { projectId: 'p1', projectName: '项目A', count: 1 })
    expect(m1.get('p1')?.count).toBe(1)
    expect(m1.get('p1')?.projectName).toBe('项目A')

    const m2 = mergeYapiPushCounts(m1, { projectId: 'p1', projectName: '项目A', count: 3 })
    expect(m2.get('p1')?.count).toBe(4)

    const m3 = mergeYapiPushCounts(m2, { projectId: 'p2', projectName: '项目B', count: 2 })
    expect(m3.get('p1')?.count).toBe(4)
    expect(m3.get('p2')?.count).toBe(2)
    expect(m3.size).toBe(2)
  })

  it('mergeYapiPushCounts fallback projectName to projectId', () => {
    const prev = new Map<string, { projectName: string, count: number }>()
    const m = mergeYapiPushCounts(prev, { projectId: 'p1', projectName: '', count: 1 })
    expect(m.get('p1')?.projectName).toBe('p1')
  })

  it('mergeYapiPushCounts does not mutate original map', () => {
    const prev = new Map<string, { projectName: string, count: number }>([['p1', { projectName: 'A', count: 1 }]])
    const next = mergeYapiPushCounts(prev, { projectId: 'p1', projectName: 'A', count: 1 })
    expect(prev.get('p1')?.count).toBe(1)
    expect(next.get('p1')?.count).toBe(2)
    expect(prev).not.toBe(next)
  })

  it('mergeYapiPushCounts handles count fallback to 1', () => {
    const prev = new Map<string, { projectName: string, count: number }>()
    const m = mergeYapiPushCounts(prev, { projectId: 'p1', projectName: 'A' } as unknown as { projectId: string, projectName: string, count: number })
    expect(m.get('p1')?.count).toBe(1)
  })

  it('handles batch aggregation simulation (debounce merge)', () => {
    // Simulate 5 rapid pushes debounced into one flush
    let map = new Map<string, { projectName: string, count: number }>()

    for (let i = 0; i < 5; i++) {
      map = mergeYapiPushCounts(map, { projectId: 'p1', projectName: '批量项目', count: 1 })
    }

    expect(map.get('p1')?.count).toBe(5)
  })
})
