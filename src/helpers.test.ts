import { describe, expect, it } from 'vitest'

import type { ApiMenuData } from '@/components/ApiMenu'
import { ApiStatus, HttpMethod, MenuItemType } from '@/enums'
import { getAllApiIds, menuItemMatchesSearch } from '@/helpers'

function makeApi(id: string, name: string, method: HttpMethod, path: string): ApiMenuData {
  return {
    id,
    name,
    type: MenuItemType.ApiDetail,
    data: { id, name, method, path, status: ApiStatus.Testing },
  }
}

const userList = makeApi('a1', 'UserList', HttpMethod.Get, '/api/user/list')
const createOrder = makeApi('a2', '创建订单', HttpMethod.Post, '/api/order/create')

describe('menuItemMatchesSearch', () => {
  it('接口名匹配不区分大小写', () => {
    expect(menuItemMatchesSearch(userList, 'user')).toBe(true)
    expect(menuItemMatchesSearch(userList, 'USERLIST')).toBe(true)
    expect(menuItemMatchesSearch(userList, 'order')).toBe(false)
  })

  it('接口路径匹配不区分大小写', () => {
    expect(menuItemMatchesSearch(createOrder, '/API/ORDER')).toBe(true)
  })

  it('HTTP 方法匹配不区分大小写且要求完全相等', () => {
    expect(menuItemMatchesSearch(createOrder, 'post')).toBe(true)
    expect(menuItemMatchesSearch(createOrder, 'POST')).toBe(true)
    expect(menuItemMatchesSearch(createOrder, 'pos')).toBe(false)
  })

  it('粘贴完整 URL 时按 path + search 匹配', () => {
    expect(menuItemMatchesSearch(createOrder, 'http://127.0.0.1:8080/api/order/create')).toBe(true)
    expect(menuItemMatchesSearch(createOrder, 'http://127.0.0.1:8080/api/other')).toBe(false)
  })

  it('目录只按名称匹配，不参与路径与方法匹配', () => {
    const folder: ApiMenuData = { id: 'f1', name: '用户管理', type: MenuItemType.ApiDetailFolder }

    expect(menuItemMatchesSearch(folder, '用户管理')).toBe(true)
    expect(menuItemMatchesSearch(folder, 'get')).toBe(false)
  })
})

describe('getAllApiIds', () => {
  it('只返回接口项的 id，不含目录', () => {
    const folder: ApiMenuData = { id: 'f1', name: '用户管理', type: MenuItemType.ApiDetailFolder }

    expect(getAllApiIds([userList, folder, createOrder])).toEqual(['a1', 'a2'])
  })
})
