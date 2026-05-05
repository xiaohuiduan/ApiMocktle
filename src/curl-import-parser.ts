import { HttpMethod } from '@/enums'

const COMMON_HEADER_NAMES = new Set([
  'accept',
  'accept-encoding',
  'cache-control',
  'connection',
  'content-length',
  'host',
  'origin',
  'pragma',
  'referer',
  'user-agent',
  'postman-token',
  'sec-ch-ua',
  'sec-ch-ua-mobile',
  'sec-ch-ua-platform',
  'sec-fetch-dest',
  'sec-fetch-mode',
  'sec-fetch-site',
])

const SUPPORTED_HTTP_METHODS = new Set([
  HttpMethod.Get,
  HttpMethod.Post,
  HttpMethod.Put,
  HttpMethod.Delete,
  HttpMethod.Head,
  HttpMethod.Options,
  HttpMethod.Patch,
  HttpMethod.Trace,
])

export interface NameValuePair {
  name: string
  value: string
}

export interface CurlParseState {
  url?: string
  method?: HttpMethod
  headers: string[]
  cookies: string[]
  data: string[]
  dataUrlEncoded: string[]
  forms: string[]
  forceGet: boolean
}

function normalizeCurlText(value: string) {
  return value
    .replace(/\\\r?\n/g, ' ')
    .replace(/\^\r?\n/g, ' ')
    .replace(/\r?\n/g, ' ')
    .replace(/\^([\s\S])/g, '$1')
    .trim()
}

function tokenizeCurlCommand(command: string) {
  const tokens: string[] = []
  let current = ''
  let quote: '"' | '\'' | undefined
  let escaped = false

  for (const char of command) {
    if (escaped) {
      current += char
      escaped = false
      continue
    }

    if (char === '\\' && quote !== '\'') {
      escaped = true
      continue
    }

    if (quote) {
      if (char === quote) {
        quote = undefined
      }
      else {
        current += char
      }
      continue
    }

    if (char === '"' || char === '\'') {
      quote = char
      continue
    }

    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current)
        current = ''
      }
      continue
    }

    current += char
  }

  if (current) {
    tokens.push(current)
  }

  return tokens
}

function readOptionValue(tokens: string[], index: number, shortFlag: string, longFlag: string) {
  const token = tokens[index]

  if (token === shortFlag || token === longFlag) {
    return { nextIndex: index + 1, value: tokens[index + 1] }
  }

  if (token.startsWith(`${longFlag}=`)) {
    return { nextIndex: index, value: token.slice(longFlag.length + 1) }
  }

  if (shortFlag.length === 2 && token.startsWith(shortFlag) && token.length > shortFlag.length) {
    return { nextIndex: index, value: token.slice(shortFlag.length) }
  }

  return undefined
}

function normalizeHttpMethod(value?: string) {
  const method = value?.trim().toUpperCase() as HttpMethod | undefined

  if (!method || !SUPPORTED_HTTP_METHODS.has(method)) {
    throw new Error(`暂不支持的请求方法：${value ?? '未知'}`)
  }

  return method
}

function looksLikeUrlToken(value: string) {
  return /^https?:\/\//i.test(value)
}

function safeDecode(value: string) {
  const normalizedValue = value.replace(/\+/g, ' ')

  try {
    return decodeURIComponent(normalizedValue)
  }
  catch {
    return normalizedValue
  }
}

export function splitNameValue(value: string, separator: string) {
  const separatorIndex = value.indexOf(separator)

  if (separatorIndex < 0) {
    return { name: value.trim(), value: '' }
  }

  return {
    name: value.slice(0, separatorIndex).trim(),
    value: value.slice(separatorIndex + separator.length).trim(),
  }
}

export function parseAmpersandPairs(values: string[]) {
  return values.flatMap((item) => {
    return item
      .split('&')
      .filter(Boolean)
      .map((segment) => {
        const pair = splitNameValue(segment, '=')
        return { name: safeDecode(pair.name), value: safeDecode(pair.value) }
      })
      .filter(({ name }) => Boolean(name))
  })
}

export function parseCookiePairs(values: string[]) {
  return values.flatMap((item) => {
    return item
      .split(';')
      .map((segment) => splitNameValue(segment.trim(), '='))
      .filter(({ name }) => Boolean(name))
  })
}

export function parseFormPairs(values: string[]) {
  return values
    .map((item) => splitNameValue(item, '='))
    .filter(({ name }) => Boolean(name))
}

export function parseCurlCommand(curlText: string): CurlParseState {
  const tokens = tokenizeCurlCommand(normalizeCurlText(curlText))
  const state: CurlParseState = {
    headers: [],
    cookies: [],
    data: [],
    dataUrlEncoded: [],
    forms: [],
    forceGet: false,
  }

  for (let index = tokens[0]?.toLowerCase() === 'curl' ? 1 : 0; index < tokens.length; index += 1) {
    const token = tokens[index]
    const requestOption = readOptionValue(tokens, index, '-X', '--request')
    const headerOption = readOptionValue(tokens, index, '-H', '--header')
    const urlOption = readOptionValue(tokens, index, '', '--url')
    const cookieOption = readOptionValue(tokens, index, '-b', '--cookie')
    const dataOption = readOptionValue(tokens, index, '-d', '--data')
      ?? readOptionValue(tokens, index, '', '--data-raw')
      ?? readOptionValue(tokens, index, '', '--data-binary')
    const dataUrlEncodedOption = readOptionValue(tokens, index, '', '--data-urlencode')
    const formOption = readOptionValue(tokens, index, '-F', '--form')
      ?? readOptionValue(tokens, index, '', '--form-string')

    if (requestOption) {
      state.method = normalizeHttpMethod(requestOption.value)
      index = requestOption.nextIndex
      continue
    }

    if (headerOption?.value) {
      state.headers.push(headerOption.value)
      index = headerOption.nextIndex
      continue
    }

    if (urlOption?.value) {
      state.url = urlOption.value
      index = urlOption.nextIndex
      continue
    }

    if (cookieOption?.value) {
      state.cookies.push(cookieOption.value)
      index = cookieOption.nextIndex
      continue
    }

    if (dataOption?.value !== undefined) {
      state.data.push(dataOption.value)
      index = dataOption.nextIndex
      continue
    }

    if (dataUrlEncodedOption?.value !== undefined) {
      state.dataUrlEncoded.push(dataUrlEncodedOption.value)
      index = dataUrlEncodedOption.nextIndex
      continue
    }

    if (formOption?.value !== undefined) {
      state.forms.push(formOption.value)
      index = formOption.nextIndex
      continue
    }

    if (token === '-G' || token === '--get') {
      state.forceGet = true
      continue
    }

    if (token === '-I' || token === '--head') {
      state.method = HttpMethod.Head
      continue
    }

    if (!token.startsWith('-') && looksLikeUrlToken(token)) {
      state.url = token
    }
  }

  if (!state.url) {
    throw new Error('未识别到有效的请求 URL')
  }

  return state
}

export function looksLikeUrlEncodedBody(value: string) {
  const trimmedValue = value.trim()
  return trimmedValue.includes('=') && !trimmedValue.startsWith('{') && !trimmedValue.startsWith('<')
}

export function buildExtraQueryPairs(state: CurlParseState) {
  const queryText = [...state.data, ...state.dataUrlEncoded].join('&').trim()

  if (!queryText) {
    return [] as NameValuePair[]
  }

  if (!looksLikeUrlEncodedBody(queryText)) {
    throw new Error('GET 形式的 cURL 仅支持 URL 查询参数或 x-www-form-urlencoded 数据')
  }

  return parseAmpersandPairs([queryText])
}

export function extractHeaders(rawHeaders: string[], ignoreCommonHeaders: boolean) {
  const headerPairs: NameValuePair[] = []
  const cookiePairs: NameValuePair[] = []
  let contentType: string | undefined

  rawHeaders.forEach((headerLine) => {
    const { name, value } = splitNameValue(headerLine, ':')

    if (!name) {
      throw new Error(`Header 格式非法：${headerLine}`)
    }

    const lowerName = name.toLowerCase()

    if (lowerName === 'cookie') {
      cookiePairs.push(...parseCookiePairs([value]))
      return
    }

    if (lowerName === 'content-type') {
      contentType = value
    }

    if (ignoreCommonHeaders && COMMON_HEADER_NAMES.has(lowerName)) {
      return
    }

    headerPairs.push({ name, value })
  })

  return { contentType, cookiePairs, headerPairs }
}
