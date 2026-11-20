import { translateKey } from './translate'

/** 后端 `categorize_request_error()` 会返回的全部 `error_type`（见 `request_runner.rs`）。 */
export const NETWORK_ERROR_TYPES = [
  'dns_failure',
  'connection_refused',
  'connection_reset',
  'network_unreachable',
  'connection_failed',
  'timeout',
  'tls_error',
  'http_error',
  'redirect_error',
  'body_error',
  'unknown',
] as const

export type NetworkErrorType = (typeof NETWORK_ERROR_TYPES)[number]

/**
 * 错误类型 → i18n key 的显式映射。
 *
 * 不用模板拼接（`api.run.networkError.${type}.message`）：i18next 的严格类型
 * 不接受模板字面量 key，且拼接式 key 在改名时不会报错。显式映射可被
 * `i18n-request-errors.test.ts` 逐条校验。
 */
const MESSAGE_KEYS: Record<NetworkErrorType, string> = {
  dns_failure: 'api.run.networkError.dns_failure.message',
  connection_refused: 'api.run.networkError.connection_refused.message',
  connection_reset: 'api.run.networkError.connection_reset.message',
  network_unreachable: 'api.run.networkError.network_unreachable.message',
  connection_failed: 'api.run.networkError.connection_failed.message',
  timeout: 'api.run.networkError.timeout.message',
  tls_error: 'api.run.networkError.tls_error.message',
  http_error: 'api.run.networkError.http_error.message',
  redirect_error: 'api.run.networkError.redirect_error.message',
  body_error: 'api.run.networkError.body_error.message',
  unknown: 'api.run.networkError.unknown.message',
}

/**
 * 各错误类型的建议列表。
 *
 * 语言包里的 `suggestion` 是字符串数组，用 `returnObjects` 取回。
 * 这里把「取回的数组」按错误类型显式声明，避免运行期猜类型。
 */
const SUGGESTION_KEYS: Record<NetworkErrorType, string> = {
  dns_failure: 'api.run.networkError.dns_failure.suggestion',
  connection_refused: 'api.run.networkError.connection_refused.suggestion',
  connection_reset: 'api.run.networkError.connection_reset.suggestion',
  network_unreachable: 'api.run.networkError.network_unreachable.suggestion',
  connection_failed: 'api.run.networkError.connection_failed.suggestion',
  timeout: 'api.run.networkError.timeout.suggestion',
  tls_error: 'api.run.networkError.tls_error.suggestion',
  http_error: 'api.run.networkError.http_error.suggestion',
  redirect_error: 'api.run.networkError.redirect_error.suggestion',
  body_error: 'api.run.networkError.body_error.suggestion',
  unknown: 'api.run.networkError.unknown.suggestion',
}

function isNetworkErrorType(value: string): value is NetworkErrorType {
  return (NETWORK_ERROR_TYPES as readonly string[]).includes(value)
}

export interface LocalizedRequestError {
  message: string
  /** 多行建议，展示层按行渲染。空数组表示无建议。 */
  suggestion: string[]
}

/** 把后端用 `\n` 拼接的建议拆成数组。 */
function splitSuggestion(suggestion: string | undefined): string[] {
  return (suggestion ?? '').split('\n').map((line) => line.trim()).filter(Boolean)
}

/**
 * 把后端返回的错误信息本地化。
 *
 * 背景：`request_runner` 过去直接回中文 `error_message` / `suggestion`，
 * 导致英文界面下错误文案仍是中文。现在前端按 `errorType`（稳定错误码）取词，
 * 后端文案仅作**兜底**——后端将来新增前端还不认识的错误类型时，
 * 仍显示后端原文，而不是渲染成 i18n key。
 */
export function localizeRequestError(
  errorInfo: { errorType: string, errorMessage?: string, suggestion?: string },
  translateArray: (key: string) => unknown = getSuggestionArrayByKey,
): LocalizedRequestError {
  const type = errorInfo.errorType

  // 前端不认识的错误类型：用后端原文兜底（后端正常路径不回文案，此时显示通用文案）
  if (!isNetworkErrorType(type)) {
    const backendMessage = errorInfo.errorMessage?.trim()

    return {
      message: backendMessage && backendMessage.length > 0
        ? backendMessage
        : translateKey(MESSAGE_KEYS.unknown),
      suggestion: splitSuggestion(errorInfo.suggestion),
    }
  }

  const localizedSuggestions = toSuggestionArray(translateArray(SUGGESTION_KEYS[type]))

  return {
    // 已知类型以语言包为准；万一语言包缺该 key（translateKey 会回 key 原文），退回后端文案
    message: pickMessage(MESSAGE_KEYS[type], errorInfo.errorMessage),
    // 语言包没有建议时，退回后端可能给出的建议（当前后端正常路径为空）
    suggestion: localizedSuggestions.length > 0
      ? localizedSuggestions
      : splitSuggestion(errorInfo.suggestion),
  }
}

/** 取词；若结果仍是 key 原文（说明缺词条），用后端文案兜底。 */
function pickMessage(key: string, fallback: string | undefined): string {
  const text = translateKey(key)
  const trimmedFallback = fallback?.trim()

  if (text === key && trimmedFallback) {
    return trimmedFallback
  }

  return text
}

function toSuggestionArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.map((line) => String(line)).filter(Boolean)
}

/*
 * 数组型资源需要 returnObjects，与 translateKey（只返回 string）不同，
 * 因此单独引入 i18n 单例并直接用其 t。
 */
import { i18n } from './index'

function getSuggestionArrayByKey(key: string): unknown {
  return i18n.t(key as never, { returnObjects: true } as never)
}
