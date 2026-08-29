import { beforeEach, describe, expect, it } from 'vitest'

import type { ApiMenuData } from '@/components/ApiMenu'
import {
  mergeDraftsIntoList,
  readDrafts,
  upsertDraft,
} from './menu-drafts'

const PROJECT = 'p1'

function makeItem(id: string, name: string, type = 'apiDetail'): ApiMenuData {
  return { id, parentId: undefined, name, type } as unknown as ApiMenuData
}

beforeEach(() => {
  window.localStorage.clear()
})

describe('mergeDraftsIntoList', () => {
  it('新建未入库草稿（isNew）在数据库无对应项时作为草稿节点追加', () => {
    upsertDraft(PROJECT, makeItem('draft-1', '新接口'), true)

    const merged = mergeDraftsIntoList(PROJECT, [makeItem('db-1', '已有接口')])

    expect(merged.map((m) => m.id)).toEqual(['db-1', 'draft-1'])
    expect(merged.at(-1)?.__isDraft).toBe(true)
  })

  it('已入库项的覆盖层草稿覆盖同名节点的数据', () => {
    upsertDraft(PROJECT, { ...makeItem('db-1', '本地改名') }, false)

    const merged = mergeDraftsIntoList(PROJECT, [makeItem('db-1', '数据库名')])

    expect(merged).toHaveLength(1)
    expect(merged[0].name).toBe('本地改名')
    expect(merged[0].__isDraft).toBe(false)
  })

  it('接口删除后残留的覆盖层草稿被清理,不再以幽灵节点复活', () => {
    // 先编辑已存接口产生覆盖层草稿
    upsertDraft(PROJECT, makeItem('db-1', '有未保存修改'), false)

    // 接口随后被删除:数据库列表中不再存在 db-1
    const merged = mergeDraftsIntoList(PROJECT, [])

    expect(merged).toHaveLength(0)
    expect(readDrafts(PROJECT)).toHaveLength(0)
  })

  it('无草稿时原样返回数据库列表', () => {
    const db = [makeItem('db-1', 'A'), makeItem('db-2', 'B')]

    const merged = mergeDraftsIntoList(PROJECT, db)

    expect(merged.map((m) => m.id)).toEqual(['db-1', 'db-2'])
    expect(merged.every((m) => m.__isDraft === false)).toBe(true)
  })
})
