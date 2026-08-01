import { nanoid } from 'nanoid'

import { ParamType } from '@/enums'
import type { Parameter } from '@/types'

export function parseQueryFromUrl(url: string): Parameter[] {
  try {
    const parsed = new URL(url)
    const params: Parameter[] = []
    parsed.searchParams.forEach((value, name) => {
      params.push({
        id: nanoid(6),
        name,
        example: value,
        enable: true,
        type: ParamType.String,
      } as Parameter)
    })

    return params
  }
  catch {
    return []
  }
}

export function parseHistoryParams(
  headers: { name: string, value: string }[],
  url: string,
): { query: Parameter[], header: Parameter[], cookie: Parameter[] } {
  const query = parseQueryFromUrl(url)
  const header: Parameter[] = []
  const cookie: Parameter[] = []

  for (const h of headers) {
    if (h.name.toLowerCase() === 'cookie') {
      h.value.split(';').forEach((pair) => {
        const eqIdx = pair.indexOf('=')

        if (eqIdx > 0) {
          cookie.push({
            id: nanoid(6),
            name: pair.slice(0, eqIdx).trim(),
            example: pair.slice(eqIdx + 1).trim(),
            enable: true,
            type: ParamType.String,
          } as Parameter)
        }
      })
    }
    else {
      header.push({
        id: nanoid(6),
        name: h.name,
        example: h.value,
        enable: true,
        type: ParamType.String,
      } as Parameter)
    }
  }

  return { query, header, cookie }
}
