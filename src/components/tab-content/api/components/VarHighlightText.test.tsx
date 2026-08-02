import { renderToStaticMarkup } from 'react-dom/server'

import { describe, expect, it } from 'vitest'

import { renderVarHighlight } from './VarHighlightText'

describe('renderVarHighlight', () => {
  it('无变量时返回原文本', () => {
    expect(renderVarHighlight('plain text', [], 'k')).toBe('plain text')
  })

  it('单个变量替换为高亮 span（hover 显示原变量名）', () => {
    // text 为解析后文本（替换值即原位置内容）
    const html = renderToStaticMarkup(
      renderVarHighlight('pre1750000000post', [{ name: '$timestamp', value: '1750000000', start: 3, end: 13 }], 'u'),
    )
    expect(html).toContain('pre')
    expect(html).toContain('post')
    expect(html).toContain('title="{{$timestamp}}"')
    expect(html).toContain('class="var-highlight"')
    expect(html).toContain('>1750000000<')
  })

  it('多个变量按位置渲染（输入乱序也正确）', () => {
    const vars = [
      { name: '$b', value: 'B', start: 4, end: 5 },
      { name: '$a', value: 'A', start: 1, end: 2 },
    ]
    const html = renderToStaticMarkup(renderVarHighlight('xAyBz', vars, 'm'))
    expect(html.indexOf('x') < html.indexOf('var-highlight')).toBe(true)
    expect(html.indexOf('A') < html.indexOf('B')).toBe(true)
  })

  it('重叠/嵌套变量被保护（只渲染外层，不重复切分）', () => {
    // text 为解析后文本；两个 vars 区间重叠（内层起始在外层已消费区域内）
    const vars = [
      { name: '$outer', value: 'OO', start: 2, end: 4 },
      { name: '$inner', value: 'II', start: 3, end: 5 },
    ]
    const html = renderToStaticMarkup(renderVarHighlight('abOOcd', vars, 'ov'))
    expect(html).toContain('>OO<')
    expect(html).not.toContain('II')
    expect(html).not.toContain('Oc') // 未被内层错误切分
  })

  it('变量片段取文本实际内容（替换值即原位置内容）', () => {
    const html = renderToStaticMarkup(
      renderVarHighlight('x-abc-y', [{ name: '$v', value: 'abc', start: 2, end: 5 }], 'c'),
    )
    expect(html).toContain('>abc<')
  })
})
