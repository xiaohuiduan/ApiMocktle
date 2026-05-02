import type { SchemaType } from './constants'

export interface BaseSchema {
  name?: string
  displayName?: string
  description?: string
  /** 标准 JSON Schema 扩展：字段标题 */
  title?: string
  /** 标准 JSON Schema 扩展：是否必填（从父级 required[] 提取） */
  required?: boolean
  /** 标准 JSON Schema 扩展：枚举值 */
  enum?: string[]
  /** 标准 JSON Schema 扩展：格式（如 int64, date-time） */
  format?: string
  /** 标准 JSON Schema 扩展：最小值 */
  minimum?: number
  /** 标准 JSON Schema 扩展：最大值 */
  maximum?: number
  /** 标准 JSON Schema 扩展：默认值 */
  default?: unknown
  /** 标准 JSON Schema 扩展：示例值 */
  example?: unknown
}

export interface PrimitiveSchema extends BaseSchema {
  type:
    | SchemaType.Boolean
    | SchemaType.Number
    | SchemaType.Integer
    | SchemaType.String
    | SchemaType.Null
    | SchemaType.Any
}

export interface ObjectSchema extends BaseSchema {
  type: SchemaType.Object
  properties?: JsonSchema[]
}

export interface ArraySchema extends BaseSchema {
  type: SchemaType.Array
  items: PrimitiveSchema | ObjectSchema | ArraySchema | RefSchema
}

export interface RefSchema extends BaseSchema {
  type: SchemaType.Refer
  $ref: string
}

export type JsonSchema = PrimitiveSchema | ObjectSchema | ArraySchema | RefSchema

export type FieldPath = string

export interface ColumnType {
  key: string
  colClassName?: string
  colStyle?: React.CSSProperties

  render?: (
    text: React.ReactNode,
    record: JsonSchema,
    extraData: {
      disabled?: boolean
      fieldPath: FieldPath[]
    }
  ) => React.ReactNode
}
