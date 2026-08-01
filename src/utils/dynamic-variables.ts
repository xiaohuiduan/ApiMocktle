/**
 * 内置动态变量（{{$xxx}}），与 Postman 核心集对齐。
 * 前端同步求值；$processEnv（系统环境变量）仅在 Rust 测试引擎侧支持。
 */
const DYNAMIC_VARIABLE_PATTERN = /\{\{(\$[\w:.]+)\}\}/g

/** 动态变量定义（补全提示与说明弹窗共用） */
export interface DynamicVariableDef {
  /** 变量名（含 $ 前缀，不含 {{}}） */
  name: string
  /** 简要说明 */
  desc: string
  /** 示例值 */
  example: string
}

export const DYNAMIC_VARIABLE_DEFS: DynamicVariableDef[] = [
  { name: '$timestamp', desc: '秒级时间戳', example: '1750000000' },
  { name: '$timestampISO', desc: 'ISO 8601 时间', example: '2026-08-01T09:00:00.000Z' },
  { name: '$guid', desc: 'UUID（带横线）', example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' },
  { name: '$randomUUID', desc: 'UUID（32 位无横线）', example: 'a1b2c3d4e5f67890abcdef1234567890' },
  { name: '$randomInt', desc: '0-1000 随机整数', example: '742' },
  { name: '$randomEmail', desc: '随机邮箱', example: 'xqkzmpab@example.com' },
  { name: '$randomIP', desc: '随机 IPv4 地址', example: '192.168.1.1' },
  { name: '$randomMobile', desc: '11 位随机手机号', example: '13812345678' },
  { name: '$randomString', desc: '8 位随机字母字符串', example: 'AbCdEfGh' },
]

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function randomLowerString(len: number): string {
  let s = ''

  for (let i = 0; i < len; i++) { s += String.fromCharCode(randomInt(97, 122)) }

  return s
}

function resolveDynamicVariable(name: string): string | null {
  switch (name) {
    case '$timestamp':
      return String(Math.floor(Date.now() / 1000))

    case '$timestampISO':
      return new Date().toISOString()

    case '$guid':
      return crypto.randomUUID()

    case '$randomUUID':
      return crypto.randomUUID().replace(/-/g, '')

    case '$randomInt':
      return String(randomInt(0, 1000))

    case '$randomEmail':
      return `${randomLowerString(8)}@example.com`

    case '$randomIP':
      return `${randomInt(1, 255)}.${randomInt(0, 255)}.${randomInt(0, 255)}.${randomInt(1, 255)}`

    case '$randomMobile': {
      const tail = Array.from({ length: 8 }, () => randomInt(0, 9)).join('')

      return `${randomInt(130, 199)}${tail}`
    }

    case '$randomString': {
      let s = ''

      for (let i = 0; i < 8; i++) {
        const c = String.fromCharCode(randomInt(97, 122))
        s += Math.random() < 0.5 ? c : c.toUpperCase()
      }

      return s
    }

    default:
      return null
  }
}

/** 替换文本中的内置动态变量；未知变量原样保留 */
export function resolveDynamicVariables(text: string): string {
  return text.replace(DYNAMIC_VARIABLE_PATTERN, (_, name: string) => {
    return resolveDynamicVariable(name) ?? `{{${name}}}`
  })
}
