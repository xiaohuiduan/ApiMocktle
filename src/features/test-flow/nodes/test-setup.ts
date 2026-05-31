/**
 * Vitest 测试环境 setup 文件
 * 配置 @xyflow/react 和 antd 的 mock
 * 注意：只 mock UI 组件（Handle），保留纯函数导出（addEdge 等）
 */
import { vi } from 'vitest'

// Mock @xyflow/react - 只替换 Handle 组件，保留其他纯函数
vi.mock('@xyflow/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@xyflow/react')>()
  return {
    ...actual,
    Handle: (props: Record<string, unknown>) => {
      const React = require('react')
      const handleType = props.type as string
      const handlePosition = props.position as string
      const handleId = props.id as string
      const testId = `handle-${handleType}-${handleId}`
      return React.createElement('div', {
        'data-testid': testId,
        'data-handle-type': handleType,
        'data-handle-position': handlePosition,
      })
    },
  }
})

// Mock antd theme
vi.mock('antd', () => ({
  theme: {
    useToken: () => ({
      token: {
        colorPrimary: '#1677ff',
        colorSuccess: '#52c41a',
        colorError: '#ff4d4f',
        colorWarning: '#faad14',
        colorInfo: '#1677ff',
      },
    }),
  },
}))
