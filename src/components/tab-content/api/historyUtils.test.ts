import { describe, expect, it } from 'vitest'

import { collectEnvironmentBaseUrls, extractPathFromHistoryUrl, parseQueryFromUrl, parseQueryPairsFromUrl } from './historyUtils'

describe('parseQueryFromUrl', () => {
  it('解析绝对地址的 query', () => {
    expect(parseQueryFromUrl('https://dev.a.com/biz/sys?bizSys=1001&bizSysType=MAIN'))
      .toEqual([
        expect.objectContaining({ name: 'bizSys', example: '1001' }),
        expect.objectContaining({ name: 'bizSysType', example: 'MAIN' }),
      ])
  })

  it('解析相对路径的 query（未选环境时历史落库的就是这种形态）', () => {
    expect(parseQueryFromUrl('/biz/sys?bizSys=1001')).toEqual([expect.objectContaining({ name: 'bizSys', example: '1001' })])
    expect(parseQueryFromUrl('biz/sys?bizSys=1001')).toEqual([expect.objectContaining({ name: 'bizSys', example: '1001' })])
  })

  it('解码转义字符并保留重复参数', () => {
    const params = parseQueryFromUrl('/q?name=%E5%BC%A0&tag=a&tag=b')

    expect(params.map((p) => [p.name, p.example])).toEqual([
      ['name', '张'],
      ['tag', 'a'],
      ['tag', 'b'],
    ])
  })

  it('空值、空白与无 query 返回空数组', () => {
    expect(parseQueryFromUrl('')).toEqual([])
    expect(parseQueryFromUrl('   ')).toEqual([])
    expect(parseQueryFromUrl('/biz/sys')).toEqual([])
  })
})

describe('parseQueryPairsFromUrl', () => {
  it('相对路径也产出 name/value 对（历史详情与错误历史的展示形态）', () => {
    expect(parseQueryPairsFromUrl('/biz/sys?bizSys=1001&bizSysType=MAIN')).toEqual([
      { name: 'bizSys', value: '1001' },
      { name: 'bizSysType', value: 'MAIN' },
    ])
  })

  it('无 query 或空值时返回空数组', () => {
    expect(parseQueryPairsFromUrl('/biz/sys')).toEqual([])
    expect(parseQueryPairsFromUrl('')).toEqual([])
  })
})

describe('extractPathFromHistoryUrl', () => {
  it('剥离命中的环境 baseUrl，只保留相对路径', () => {
    expect(extractPathFromHistoryUrl('https://dev.a.com/users/1?x=1', ['https://dev.a.com'])).toBe('/users/1')
  })

  it('baseUrl 带路径前缀时按最长匹配剥离，不残留 /v1', () => {
    expect(extractPathFromHistoryUrl('https://dev.a.com/v1/users/1', ['https://dev.a.com/v1'])).toBe('/users/1')
  })

  it('多个 baseUrl 命中时取最长前缀', () => {
    const baseUrls = ['https://dev.a.com', 'https://dev.a.com/v1']

    expect(extractPathFromHistoryUrl('https://dev.a.com/v1/users', baseUrls)).toBe('/users')
    expect(extractPathFromHistoryUrl('https://dev.a.com/users', baseUrls)).toBe('/users')
  })

  it('忽略 baseUrl 尾部斜杠与大小写差异', () => {
    expect(extractPathFromHistoryUrl('https://DEV.a.com/users', ['https://dev.a.com/'])).toBe('/users')
  })

  it('未命中任何环境时保留 origin 与路径', () => {
    expect(extractPathFromHistoryUrl('https://third.com/api/x?y=1', ['https://dev.a.com'])).toBe('https://third.com/api/x')
    expect(extractPathFromHistoryUrl('https://third.com/api/x', [])).toBe('https://third.com/api/x')
  })

  it('未命中时保留端口并丢弃 hash', () => {
    expect(extractPathFromHistoryUrl('http://localhost:8080/api/users?page=1#top', [])).toBe('http://localhost:8080/api/users')
  })

  it('未命中且无路径时补根路径', () => {
    expect(extractPathFromHistoryUrl('https://third.com', ['https://dev.a.com'])).toBe('https://third.com/')
  })

  it('历史为相对路径时去掉 query 与 hash', () => {
    expect(extractPathFromHistoryUrl('/users/1?x=1', [])).toBe('/users/1')
    expect(extractPathFromHistoryUrl('/users/1#top', [])).toBe('/users/1')
  })

  it('地址恰好等于 baseUrl 时返回根路径', () => {
    expect(extractPathFromHistoryUrl('https://dev.a.com', ['https://dev.a.com'])).toBe('/')
    expect(extractPathFromHistoryUrl('https://dev.a.com/?x=1', ['https://dev.a.com'])).toBe('/')
  })

  it('空值返回空串', () => {
    expect(extractPathFromHistoryUrl(undefined, ['https://dev.a.com'])).toBe('')
    expect(extractPathFromHistoryUrl('', ['https://dev.a.com'])).toBe('')
  })
})

describe('collectEnvironmentBaseUrls', () => {
  it('汇总环境自身 url 与 baseUrls，并跳过空值', () => {
    const envs = [
      { id: '1', name: 'dev', url: 'https://dev.a.com', baseUrls: [{ id: 'a', url: 'https://dev2.a.com' }, { id: 'b', url: '' }] },
      { id: '2', name: 'prod', url: '', baseUrls: [{ id: 'c', url: 'https://prod.a.com' }] },
    ]

    expect(collectEnvironmentBaseUrls(envs, undefined)).toEqual([
      'https://dev.a.com',
      'https://dev2.a.com',
      'https://prod.a.com',
    ])
  })
})
