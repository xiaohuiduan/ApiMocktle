import { nanoid } from 'nanoid'

import { t } from '@/i18n'
import type {
  ApiEnvironment,
  ApiEnvironmentBaseUrl,
  ApiEnvironmentGlobalParameters,
  ApiEnvironmentValue,
  ProjectEnvironmentConfig,
} from '@/types'

export function createGlobalParameters(): ApiEnvironmentGlobalParameters {
  return {
    header: [],
    cookie: [],
    query: [],
    body: [],
  }
}

export const EMPTY_PROJECT_ENVIRONMENT_CONFIG: ProjectEnvironmentConfig = {
  globalVariables: [],
  globalParameters: createGlobalParameters(),
  legacyGlobalParameters: [],
  environments: [],
}

export function createEnvironmentValue(): ApiEnvironmentValue {
  return {
    id: nanoid(6),
    name: '',
    value: '',
    enable: true,
  }
}

export function createEnvironmentBaseUrl(): ApiEnvironmentBaseUrl {
  return {
    id: nanoid(6),
    url: '',
  }
}

export function createEnvironment(): ApiEnvironment {
  return {
    id: nanoid(6),
    name: t('app.environment.newEnvironment'),
    url: '',
    baseUrls: [createEnvironmentBaseUrl()],
    variables: [],
    parameters: createGlobalParameters(),
  }
}

export function getPrimaryEnvironmentUrl(environment: ApiEnvironment) {
  return environment.baseUrls?.find(({ url }) => url.trim())?.url ?? environment.url
}

export type BaseUrlProtocol = 'http' | 'https'

/** 空 host 时协议选择的本地草稿，按环境 id 隔离 */
export interface BaseUrlProtocolDraft {
  envId: string
  protocol: BaseUrlProtocol
}

/**
 * 前置 URL 协议与域名拆分：url 仍存完整地址（如 https://api.example.com），仅用于输入展示。
 * 空值/无协议默认 https（保持既有展示习惯）。
 */
export function parseBaseUrl(url: string): { protocol: BaseUrlProtocol, host: string } {
  const trimmed = url.trim()

  if (/^http:\/\//i.test(trimmed)) {
    return { protocol: 'http', host: trimmed.replace(/^http:\/\//i, '') }
  }

  return { protocol: 'https', host: trimmed.replace(/^https?:\/\//i, '') }
}

/** 拼接前置 URL；host 为空时返回空串，避免把半截 `http://` 写进环境配置 */
export function serializeBaseUrl(protocol: BaseUrlProtocol, host: string): string {
  const h = host.trim()

  return h ? `${protocol}://${h}` : ''
}

/**
 * 解析前置 URL 输入区当前应展示的协议。
 *
 * 协议没有独立的存储位，只能从 url 反推；而 host 为空时 url 会被序列化成空串，
 * 反推会退回默认 https，导致「空 host 时选 http 立刻弹回 https」。此时用按环境隔离的
 * 本地草稿兜底。
 */
export function resolveBaseUrlProtocol(
  url: string,
  draft: BaseUrlProtocolDraft | null | undefined,
  envId: string,
): BaseUrlProtocol {
  const { protocol, host } = parseBaseUrl(url)

  if (host) { return protocol }

  return draft && draft.envId === envId ? draft.protocol : protocol
}
