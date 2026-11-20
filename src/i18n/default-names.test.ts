import { describe, expect, it } from 'vitest'

import type { ApiMenuData } from '@/components/ApiMenu/ApiMenu.type'
import { isDraftEmpty } from '@/contexts/menu-drafts'
import { BodyType, HttpMethod } from '@/enums'
import {
  DEFAULT_RESPONSE_NAMES,
  isDefaultResponseName,
  isSystemDefaultName,
  SYSTEM_DEFAULT_NAMES,
} from '@/i18n/default-names'
import { enUS, zhCN } from '@/i18n/resources'
import type { ApiDetails } from '@/types'

/**
 * 默认名判定是 i18n 改造里最隐蔽的一类缺陷：默认名会被**写入数据库**，
 * 但同一份数据又被用来判断「用户是否真的编辑过」。一旦判定集合只认中文，
 * 英文界面下新建的内容会被误判为「已编辑」，空草稿清理逻辑静默失效。
 */
describe('系统默认名判定（跨语种）', () => {
  it('集合同时包含中英文默认名', () => {
    expect(DEFAULT_RESPONSE_NAMES.has(zhCN.api.response.defaultName)).toBe(true)
    expect(DEFAULT_RESPONSE_NAMES.has(enUS.api.response.defaultName)).toBe(true)
  })

  it('中文默认响应名判为默认', () => {
    expect(isDefaultResponseName('成功')).toBe(true)
  })

  it('英文默认响应名同样判为默认', () => {
    // 这是本次修复的核心：改前只认 '成功'，英文界面新建的 'Success' 会被当成已命名
    expect(isDefaultResponseName('Success')).toBe(true)
  })

  it('用户自定义的响应名不判为默认', () => {
    expect(isDefaultResponseName('订单创建成功')).toBe(false)
    expect(isDefaultResponseName('Order created')).toBe(false)
    expect(isDefaultResponseName('success')).toBe(false)
  })

  it('空名与前后空白按默认处理', () => {
    expect(isDefaultResponseName('')).toBe(true)
    expect(isDefaultResponseName(undefined)).toBe(true)
    expect(isDefaultResponseName('  成功  ')).toBe(true)
  })

  it('接口 / 快捷请求的默认名同样跨语种', () => {
    expect(isSystemDefaultName(zhCN.app.defaultNames.api)).toBe(true)
    expect(isSystemDefaultName(enUS.app.defaultNames.api)).toBe(true)
    expect(isSystemDefaultName(zhCN.app.defaultNames.quickRequest)).toBe(true)
    expect(isSystemDefaultName(enUS.app.defaultNames.quickRequest)).toBe(true)
    expect(isSystemDefaultName('我的接口')).toBe(false)
  })

  it('SYSTEM_DEFAULT_NAMES 覆盖中英两套全部默认名', () => {
    for (const name of Object.values(zhCN.app.defaultNames)) {
      expect(SYSTEM_DEFAULT_NAMES.has(name)).toBe(true)
    }

    for (const name of Object.values(enUS.app.defaultNames)) {
      expect(SYSTEM_DEFAULT_NAMES.has(name)).toBe(true)
    }
  })
})

/** 构造一条「只有默认响应」的新建接口草稿。 */
function makeDraft(responseName: string): ApiMenuData {
  const data: ApiDetails = {
    id: 'draft-1',
    name: '',
    path: '',
    method: HttpMethod.Get,
    status: 'developing' as ApiDetails['status'],
    serverUrl: '',
    parameters: { query: [], header: [], path: [], cookie: [] },
    requestBody: { type: BodyType.None },
    responses: [{ id: 'r1', code: 200, name: responseName, contentType: 'json' as never, jsonSchema: { type: 'object' as never, properties: [] } }],
  }

  return { id: 'draft-1', name: '', type: 'apiDetail' as never, data } as ApiMenuData
}

describe('空草稿判定在不同语言下行为一致', () => {
  it('中文默认响应名的新建草稿为空', () => {
    expect(isDraftEmpty(makeDraft('成功'))).toBe(true)
  })

  it('英文默认响应名的新建草稿同样为空', () => {
    // 修复前：'Success' ≠ '成功' 被误判为「响应名被改过」，草稿不再为空
    expect(isDraftEmpty(makeDraft('Success'))).toBe(true)
  })

  it('改过响应名的草稿不为空', () => {
    expect(isDraftEmpty(makeDraft('创建失败'))).toBe(false)
    expect(isDraftEmpty(makeDraft('Create failed'))).toBe(false)
  })
})
