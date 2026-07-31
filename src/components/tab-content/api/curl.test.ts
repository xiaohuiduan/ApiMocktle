import { describe, expect, it } from 'vitest'

import { BodyType } from '@/enums'
import { generateCurl, type CurlInput } from './curl'

function buildInput(overrides: Partial<CurlInput> = {}): CurlInput {
  return {
    method: 'GET',
    url: 'https://echo.apifox.com/post',
    ...overrides,
  }
}

describe('generateCurl', () => {
  it('GET 无参数：只输出方法名和 URL', () => {
    const { linux } = generateCurl(buildInput())
    expect(linux).toBe('curl -X GET "https://echo.apifox.com/post"')
  })

  it('GET 带 query：参数拼到 URL', () => {
    const { linux } = generateCurl(buildInput({
      query: [
        { name: 'a', example: '1' },
        { name: 'b', example: 'hello world' },
      ],
    }))
    expect(linux).toBe('curl -X GET "https://echo.apifox.com/post?a=1&b=hello%20world"')
  })

  it('query 中禁用的参数不拼入 URL', () => {
    const { linux } = generateCurl(buildInput({
      query: [
        { name: 'a', example: '1', enable: true },
        { name: 'b', example: '2', enable: false },
        { name: '', example: '3' },
      ],
    }))
    expect(linux).toBe('curl -X GET "https://echo.apifox.com/post?a=1"')
  })

  it('URL 已有 query 时用 & 追加', () => {
    const { linux } = generateCurl(buildInput({
      url: 'https://example.com/api?x=1',
      query: [{ name: 'a', example: '2' }],
    }))
    expect(linux).toBe('curl -X GET "https://example.com/api?x=1&a=2"')
  })

  it('headers 输出 -H', () => {
    const { linux } = generateCurl(buildInput({
      headers: [
        { name: 'X-Token', example: 'abc' },
        { name: 'X-Disabled', example: 'no', enable: false },
      ],
    }))
    expect(linux).toBe(`curl -X GET -H 'X-Token: abc' "https://echo.apifox.com/post"`)
  })

  it('cookie 输出 -b（URL 编码后拼接）', () => {
    const { linux } = generateCurl(buildInput({
      cookie: [
        { name: 'sid', example: 'abc' },
        { name: 'lang', example: 'zh' },
        { name: 'off', example: 'x', enable: false },
      ],
    }))
    expect(linux).toBe(`curl -X GET -b 'sid=abc; lang=zh' "https://echo.apifox.com/post"`)
  })

  it('POST json：有 rawText 时输出 Content-Type 和 -d', () => {
    const { linux } = generateCurl(buildInput({
      method: 'POST',
      body: {
        type: BodyType.Json,
        rawText: '{"d":"string","dd":{"sdfsdafas":"string"}}',
      },
    }))
    expect(linux).toBe(`curl -X POST -H 'Content-Type: application/json' -d '{"d":"string","dd":{"sdfsdafas":"string"}}' "https://echo.apifox.com/post"`)
  })

  it('POST json：rawText 为空时完全不带 body 参数（不生成 schema 示例）', () => {
    const { linux } = generateCurl(buildInput({
      method: 'POST',
      body: {
        type: BodyType.Json,
        rawText: '',
        parameters: [],
      },
    }))
    expect(linux).toBe('curl -X POST "https://echo.apifox.com/post"')
  })

  it('POST json：rawText 为空白字符时也视为空', () => {
    const { linux } = generateCurl(buildInput({
      method: 'POST',
      body: { type: BodyType.Json, rawText: '   \n  ' },
    }))
    expect(linux).toBe('curl -X POST "https://echo.apifox.com/post"')
  })

  it('POST form-data：每个启用字段输出 -F', () => {
    const { linux } = generateCurl(buildInput({
      method: 'POST',
      body: {
        type: BodyType.FormData,
        parameters: [
          { name: 'username', example: 'turtle' },
          { name: 'avatar', example: 'me.png' },
          { name: 'disabled', example: 'x', enable: false },
        ],
      },
    }))
    expect(linux).toBe(`curl -X POST -F 'username=turtle' -F 'avatar=me.png' "https://echo.apifox.com/post"`)
  })

  it('POST form-data：字段全禁用或为空时不输出 -F', () => {
    const { linux } = generateCurl(buildInput({
      method: 'POST',
      body: {
        type: BodyType.FormData,
        parameters: [
          { name: 'a', example: '1', enable: false },
          { name: '', example: '2' },
        ],
      },
    }))
    expect(linux).toBe('curl -X POST "https://echo.apifox.com/post"')
  })

  it('POST form-data：无参数时输出纯净命令', () => {
    const { linux } = generateCurl(buildInput({
      method: 'POST',
      body: { type: BodyType.FormData, parameters: [] },
    }))
    expect(linux).toBe('curl -X POST "https://echo.apifox.com/post"')
  })

  it('POST url-encoded：字段拼成 k=v& 输出 -d', () => {
    const { linux } = generateCurl(buildInput({
      method: 'POST',
      body: {
        type: BodyType.UrlEncoded,
        parameters: [
          { name: 'a', example: '1' },
          { name: 'b', example: '2' },
        ],
      },
    }))
    expect(linux).toBe(`curl -X POST -H 'Content-Type: application/x-www-form-urlencoded' -d 'a=1&b=2' "https://echo.apifox.com/post"`)
  })

  it('POST url-encoded：无字段时不输出 -d', () => {
    const { linux } = generateCurl(buildInput({
      method: 'POST',
      body: { type: BodyType.UrlEncoded, parameters: [] },
    }))
    expect(linux).toBe('curl -X POST "https://echo.apifox.com/post"')
  })

  it('POST xml：rawText 有内容时输出 -d 与 Content-Type', () => {
    const { linux } = generateCurl(buildInput({
      method: 'POST',
      body: { type: BodyType.Xml, rawText: '<a>1</a>' },
    }))
    expect(linux).toBe(`curl -X POST -H 'Content-Type: application/xml' -d '<a>1</a>' "https://echo.apifox.com/post"`)
  })

  it('POST raw：rawText 有内容时输出 -d 与 Content-Type', () => {
    const { linux } = generateCurl(buildInput({
      method: 'POST',
      body: { type: BodyType.Raw, rawText: 'plain text' },
    }))
    expect(linux).toBe(`curl -X POST -H 'Content-Type: text/plain' -d 'plain text' "https://echo.apifox.com/post"`)
  })

  it('body type 为 none：不带任何 body 参数', () => {
    const { linux } = generateCurl(buildInput({
      method: 'POST',
      body: { type: BodyType.None },
    }))
    expect(linux).toBe('curl -X POST "https://echo.apifox.com/post"')
  })

  it('body type 为 binary：不带任何 body 参数', () => {
    const { linux } = generateCurl(buildInput({
      method: 'POST',
      body: { type: BodyType.Binary },
    }))
    expect(linux).toBe('curl -X POST "https://echo.apifox.com/post"')
  })

  it('未传 body：不带任何 body 参数', () => {
    const { linux } = generateCurl(buildInput({ method: 'POST' }))
    expect(linux).toBe('curl -X POST "https://echo.apifox.com/post"')
  })

  it('-d 内容含单引号时正确转义', () => {
    const { linux } = generateCurl(buildInput({
      method: 'POST',
      body: { type: BodyType.Raw, rawText: "it's" },
    }))
    expect(linux).toBe(`curl -X POST -H 'Content-Type: text/plain' -d 'it'\\''s' "https://echo.apifox.com/post"`)
  })

  it('-F 内容含特殊字符时原样输出（不做 URL 编码，与 curl 行为一致）', () => {
    const { linux } = generateCurl(buildInput({
      method: 'POST',
      body: {
        type: BodyType.FormData,
        parameters: [{ name: 'name', example: 'a b&c' }],
      },
    }))
    expect(linux).toBe(`curl -X POST -F 'name=a b&c' "https://echo.apifox.com/post"`)
  })

  it('method 小写时转大写', () => {
    const { linux } = generateCurl(buildInput({ method: 'put' }))
    expect(linux).toBe('curl -X PUT "https://echo.apifox.com/post"')
  })

  it('method 缺失时默认 GET', () => {
    const { linux } = generateCurl(buildInput({ method: '' }))
    expect(linux).toBe('curl -X GET "https://echo.apifox.com/post"')
  })

  it('完整组合：query + headers + cookie + form-data', () => {
    const { linux } = generateCurl(buildInput({
      method: 'POST',
      url: 'https://example.com/api/form',
      query: [{ name: 'page', example: '2' }],
      headers: [{ name: 'X-Token', example: 'abc' }],
      cookie: [{ name: 'sid', example: 's1' }],
      body: {
        type: BodyType.FormData,
        parameters: [{ name: 'name', example: 'turtle' }],
      },
    }))
    expect(linux).toBe(`curl -X POST -H 'X-Token: abc' -b 'sid=s1' -F 'name=turtle' "https://example.com/api/form?page=2"`)
  })

  it('windows 与 linux 输出一致', () => {
    const input = buildInput({
      method: 'POST',
      body: { type: BodyType.Json, rawText: '{}' },
    })
    const { windows, linux } = generateCurl(input)
    expect(windows).toBe(linux)
  })
})
