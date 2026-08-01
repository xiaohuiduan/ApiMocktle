import { buildSchemaExample } from '@/components/JsonSchema/schema-normalizer'
import { BodyType } from '@/enums'
import type { ApiDetails } from '@/types'

/** 生成 Body 示例文本：优先 jsonSchema，其次 rawText */
export function buildBodyExample(apiDetails: ApiDetails, menuRawList?: unknown): string {
  const body = apiDetails.requestBody

  if (!body || body.type === BodyType.None) { return '' }

  if (body.jsonSchema) {
    const example = buildSchemaExample(body.jsonSchema as never, menuRawList as never)

    return JSON.stringify(example, null, 2)
  }

  if (body.rawText?.trim()) { return body.rawText }

  return ''
}
