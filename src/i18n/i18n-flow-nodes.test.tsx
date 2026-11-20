import { render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { i18n } from '@/i18n'

/**
 * 流程图节点摘要的中英双语渲染验证。
 *
 * 这两个节点（ConditionNode / LoopNode）的 summary 是拼接出来的动态文案，
 * 且必须随语言切换：中文「待配置表达式」/ 英文 "Expression not configured"。
 * 它们是 i18n 改造中最容易「看起来改好了、实际切语言不刷新」的一类。
 */

// @xyflow/react 的 NodeProps 依赖真实画布上下文，这里只替换该边界
vi.mock('@xyflow/react', () => ({
  Handle: () => null,
  Position: { Left: 'left', Right: 'right' },
}))

// BaseNode 依赖设计风格上下文取样式变量，这里提供最小可用值
vi.mock('@/hooks/useDesignStyle', () => ({
  useDesignStyle: () => ({
    isGlassStyle: false,
    isNeumorphism: false,
    isSkeuomorphism: false,
    designStyle: 'default',
  }),
}))

import ConditionNode from '@/features/test-flow/nodes/ConditionNode'
import LoopNode from '@/features/test-flow/nodes/LoopNode'
import { FlowNodeType } from '@/features/test-flow/types/flow.types'

const baseProps: Record<string, unknown> = {
  id: 'n1',
  type: FlowNodeType.Condition,
  selected: false,
  isConnectable: true,
  zIndex: 0,
  dragging: false,
  xPos: 0,
  yPos: 0,
  dragHandle: undefined,
  width: 220,
  height: 60,
  positionAbsoluteX: 0,
  positionAbsoluteY: 0,
}

function renderCondition(data: Record<string, unknown>) {
  const merged = Object.assign({}, baseProps, { data: Object.assign({}, data, { label: 'x' }) })
  const Node = ConditionNode as unknown as (props: Record<string, unknown>) => React.JSX.Element

  return render(<Node {...merged} />).container.textContent ?? ''
}

function renderLoop(data: Record<string, unknown>) {
  const merged = Object.assign({}, baseProps, { data: Object.assign({}, data, { label: 'x' }) })
  const Node = LoopNode as unknown as (props: Record<string, unknown>) => React.JSX.Element

  return render(<Node {...merged} />).container.textContent ?? ''
}

afterEach(() => {
  void i18n.changeLanguage('zh-CN')
})

describe('条件节点摘要随语言切换', () => {
  it('中文：未配置表达式显示「待配置表达式」', () => {
    void i18n.changeLanguage('zh-CN')
    expect(renderCondition({ conditionType: 'expression' })).toContain('待配置表达式')
  })

  it('英文：未配置表达式显示英文而非中文', () => {
    void i18n.changeLanguage('en-US')

    const text = renderCondition({ conditionType: 'expression' })

    expect(text).not.toContain('待配置表达式')
    expect(text).toMatch(/not configured|Pending/i)
  })

  it('中文：未配置状态码显示「待配置状态码」', () => {
    void i18n.changeLanguage('zh-CN')
    expect(renderCondition({ conditionType: 'status_code' })).toContain('待配置状态码')
  })

  it('英文：未配置状态码不残留中文', () => {
    void i18n.changeLanguage('en-US')
    expect(renderCondition({ conditionType: 'status_code' })).not.toContain('待配置')
  })

  it('变量存在判断使用参数化模板', () => {
    void i18n.changeLanguage('zh-CN')

    const text = renderCondition({ conditionType: 'variable_check', operator: 'exists', variableName: 'token' })

    expect(text).toContain('token')
    expect(text).toContain('存在')
  })

  it('英文下变量存在判断为英文', () => {
    void i18n.changeLanguage('en-US')

    const text = renderCondition({ conditionType: 'variable_check', operator: 'exists', variableName: 'token' })

    expect(text).toContain('token')
    expect(text).not.toContain('存在')
  })
})

describe('循环节点摘要随语言切换', () => {
  it('中文：固定次数显示「循环 N 次」', () => {
    void i18n.changeLanguage('zh-CN')
    expect(renderLoop({ loopType: 'count', count: 3 })).toContain('循环 3 次')
  })

  it('英文：固定次数不残留中文', () => {
    void i18n.changeLanguage('en-US')

    const text = renderLoop({ loopType: 'count', count: 3 })

    expect(text).toContain('3')
    expect(text).not.toContain('循环')
    expect(text).not.toContain('次')
  })

  it('中文：遍历集合使用「每轮」措辞', () => {
    void i18n.changeLanguage('zh-CN')
    expect(renderLoop({ loopType: 'for_each', collectionVariable: 'list', iteratorVariable: 'item' }))
      .toContain('每轮')
  })

  it('英文：遍历集合不残留中文', () => {
    void i18n.changeLanguage('en-US')
    expect(renderLoop({ loopType: 'for_each', collectionVariable: 'list', iteratorVariable: 'item' }))
      .not.toContain('每轮')
  })

  it('两种语言下都保留变量名（用户数据不翻译）', () => {
    void i18n.changeLanguage('zh-CN')
    const zh = renderLoop({ loopType: 'for_each', collectionVariable: 'orderList', iteratorVariable: 'order' })

    void i18n.changeLanguage('en-US')
    const en = renderLoop({ loopType: 'for_each', collectionVariable: 'orderList', iteratorVariable: 'order' })

    expect(zh).toContain('orderList')
    expect(en).toContain('orderList')
  })
})
