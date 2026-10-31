import { useState } from 'react'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Tree } from 'antd'
import type { DataNode } from 'antd/es/tree'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ApiMenuData } from '@/components/ApiMenu'
import { ExportTreeSelect } from '@/components/project-settings/ExportTreeSelect'
import { ApiStatus, HttpMethod, MenuItemType } from '@/enums'

// antd 在 jsdom 下需要 matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  }),
})

let mockMenuRawList: ApiMenuData[] = []

vi.mock('@/contexts/menu-helpers', () => ({
  useMenuHelpersContext: () => ({ menuRawList: mockMenuRawList }),
}))

function makeApi(
  id: string,
  name: string,
  method: HttpMethod,
  path: string,
  parentId?: string,
): ApiMenuData {
  return {
    id,
    name,
    parentId,
    type: MenuItemType.ApiDetail,
    data: { id, name, method, path, status: ApiStatus.Testing },
  }
}

function makeFolder(id: string, name: string): ApiMenuData {
  return { id, name, type: MenuItemType.ApiDetailFolder }
}

beforeEach(() => {
  mockMenuRawList = [
    makeFolder('f1', '用户管理'),
    makeApi('a1', '查询用户', HttpMethod.Get, '/api/user/list', 'f1'),
    makeApi('a2', 'UserList', HttpMethod.Get, '/api/user/detail', 'f1'),
    makeApi('a3', '创建订单', HttpMethod.Post, '/api/order/create'),
  ]
})

function Harness({ initial }: { initial: string[] }) {
  const [checkedApiIds, setCheckedApiIds] = useState(new Set(initial))

  return <ExportTreeSelect checkedApiIds={checkedApiIds} onChange={setCheckedApiIds} />
}

function renderTree(initial = ['a1', 'a2', 'a3']) {
  return render(<Harness initial={initial} />)
}

async function search(keyword: string) {
  const user = userEvent.setup()
  const input = screen.getByPlaceholderText('搜索接口名称、路径或请求方法')

  await user.type(input, keyword)

  return user
}

describe('导出接口选择树', () => {
  it('按接口名过滤，只保留命中的接口', async () => {
    renderTree()

    await search('订单')

    expect(screen.getByText('创建订单')).toBeTruthy()
    expect(screen.queryByText('查询用户')).toBeNull()
    expect(screen.queryByText('用户管理')).toBeNull()
  })

  it('名称匹配不区分大小写', async () => {
    renderTree()

    await search('userlist')

    expect(screen.getByText('UserList')).toBeTruthy()
    expect(screen.queryByText('创建订单')).toBeNull()
  })

  it('按请求方法匹配', async () => {
    renderTree()

    await search('post')

    expect(screen.getByText('创建订单')).toBeTruthy()
    expect(screen.queryByText('查询用户')).toBeNull()
  })

  it('按接口路径匹配', async () => {
    renderTree()

    await search('order/create')

    expect(screen.getByText('创建订单')).toBeTruthy()
    expect(screen.queryByText('UserList')).toBeNull()
  })

  it('目录名命中时展开该目录下的全部接口', async () => {
    renderTree()

    await search('用户管理')

    expect(screen.getByText('查询用户')).toBeTruthy()
    expect(screen.getByText('UserList')).toBeTruthy()
    expect(screen.queryByText('创建订单')).toBeNull()
  })

  it('没有匹配结果时给出提示', async () => {
    renderTree()

    await search('不存在的关键字')

    expect(screen.getByText('没有匹配的接口')).toBeTruthy()
  })

  it('已选数量随勾选变化', async () => {
    const user = userEvent.setup()
    renderTree()

    expect(screen.getByText('已选 3 / 共 3')).toBeTruthy()

    const node = screen.getByText('查询用户').closest('.ant-tree-treenode')
    const checkbox = node?.querySelector('.ant-tree-checkbox')

    await user.click(checkbox!)

    expect(screen.getByText('已选 2 / 共 3')).toBeTruthy()
  })

  it('搜索时提示导出范围以已选数量为准，清空搜索后提示消失', async () => {
    const user = userEvent.setup()
    renderTree()

    expect(screen.queryByText(/导出范围以/)).toBeNull()

    await user.type(screen.getByPlaceholderText('搜索接口名称、路径或请求方法'), '订单')

    expect(screen.getByText(/导出范围以「已选 3」为准/)).toBeTruthy()

    await user.clear(screen.getByPlaceholderText('搜索接口名称、路径或请求方法'))

    expect(screen.queryByText(/导出范围以/)).toBeNull()
  })

  it('搜索状态下取消勾选可见接口，被隐藏的已选项仍保留在导出范围里', async () => {
    const user = userEvent.setup()
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    renderTree()

    await user.type(screen.getByPlaceholderText('搜索接口名称、路径或请求方法'), '订单')

    const node = screen.getByText('创建订单').closest('.ant-tree-treenode')
    const checkbox = node?.querySelector('.ant-tree-checkbox')

    await user.click(checkbox!)

    // 「查询用户」「UserList」被搜索隐藏，仍在已选集合内
    expect(screen.getByText('已选 2 / 共 3')).toBeTruthy()
    expect(errorSpy).not.toHaveBeenCalled()

    errorSpy.mockRestore()
  })

  it('「全选 / 取消全选」作用于全部接口，不随搜索词变化', async () => {
    const user = userEvent.setup()
    const { container } = renderTree()

    await user.type(screen.getByPlaceholderText('搜索接口名称、路径或请求方法'), '订单')

    const checkbox = container.querySelector('.ant-checkbox-input')!

    await user.click(checkbox)
    expect(screen.getByText('已选 0 / 共 3')).toBeTruthy()

    await user.click(checkbox)
    expect(screen.getByText('已选 3 / 共 3')).toBeTruthy()
  })

  it('取消全选后在过滤出的树里勾选接口，已选数量只统计勾选的接口', async () => {
    const user = userEvent.setup()
    const { container } = renderTree()

    await user.type(screen.getByPlaceholderText('搜索接口名称、路径或请求方法'), '用户')

    await user.click(container.querySelector('.ant-checkbox-input')!)
    expect(screen.getByText('已选 0 / 共 3')).toBeTruthy()

    const node = screen.getByText('查询用户').closest('.ant-tree-treenode')
    const checkbox = node?.querySelector('.ant-tree-checkbox')

    await user.click(checkbox!)
    expect(screen.getByText('已选 1 / 共 3')).toBeTruthy()
  })
})

// --- 以下为 antd Tree 勾选回调的回归用例 ---

const treeData: DataNode[] = [
  {
    key: 'folder1',
    title: '分组一',
    selectable: false,
    checkable: false,
    children: [
      { key: 'api1', title: 'GET /a' },
      { key: 'api2', title: 'GET /b' },
    ],
  },
]

function TreeHarness({ onKeysChange }: { onKeysChange: (keys: React.Key[]) => void }) {
  const [checkedKeys, setCheckedKeys] = useState<React.Key[]>([])

  return (
    <Tree
      blockNode
      checkable
      defaultExpandAll
      checkedKeys={checkedKeys}
      treeData={treeData}
      onCheck={(keys) => {
        const next = Array.isArray(keys) ? keys : keys.checked
        setCheckedKeys(next)
        onKeysChange(next)
      }}
    />
  )
}

function renderTreeHarness(onKeysChange: (keys: React.Key[]) => void) {
  return render(
    <TreeHarness onKeysChange={onKeysChange} />,
  )
}

describe('选择性导出接口树勾选', () => {
  it('勾选单个接口时只返回该接口 key（不含文件夹）', async () => {
    const user = userEvent.setup()
    let lastKeys: React.Key[] = []

    const { container } = renderTreeHarness((keys) => {
      lastKeys = keys
    })

    const checkboxes = container.querySelectorAll('.ant-tree-checkbox')
    expect(checkboxes.length).toBeGreaterThanOrEqual(2)
    await user.click(checkboxes[0])

    expect(lastKeys).toEqual(['api1'])
  })

  it('取消勾选单个接口后返回空', async () => {
    const user = userEvent.setup()
    let lastKeys: React.Key[] = []

    const { container } = renderTreeHarness((keys) => {
      lastKeys = keys
    })

    const checkboxes = container.querySelectorAll('.ant-tree-checkbox')
    await user.click(checkboxes[0])
    await user.click(checkboxes[0])

    expect(lastKeys).toEqual([])
  })
})
