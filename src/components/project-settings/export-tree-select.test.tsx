import { describe, expect, it } from 'vitest'
import { useState } from 'react'

import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Tree } from 'antd'

import type { DataNode } from 'antd/es/tree'

// antd 在 jsdom 下需要 matchMedia
if (!window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  })
}

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

function Harness({ onKeysChange }: { onKeysChange: (keys: React.Key[]) => void }) {
  const [checkedKeys, setCheckedKeys] = useState<React.Key[]>([])

  return (
    <Tree
      checkable
      blockNode
      checkedKeys={checkedKeys}
      defaultExpandAll
      treeData={treeData}
      onCheck={(keys) => {
        const next = Array.isArray(keys) ? keys : keys.checked
        setCheckedKeys(next)
        onKeysChange(next)
      }}
    />
  )
}

function renderTree(onKeysChange: (keys: React.Key[]) => void) {
  return render(
    <Harness onKeysChange={onKeysChange} />,
  )
}

describe('选择性导出接口树勾选', () => {
  it('勾选单个接口时只返回该接口 key（不含文件夹）', async () => {
    const user = userEvent.setup()
    let lastKeys: React.Key[] = []

    const { container } = renderTree((keys) => {
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

    const { container } = renderTree((keys) => {
      lastKeys = keys
    })

    const checkboxes = container.querySelectorAll('.ant-tree-checkbox')
    await user.click(checkboxes[0])
    await user.click(checkboxes[0])

    expect(lastKeys).toEqual([])
  })
})
