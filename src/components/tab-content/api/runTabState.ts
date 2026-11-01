import type { ApiDetails, ApiRequestBody, RunTabInfo } from '@/types'

const STORAGE_PREFIX = 'run_tab_'

/** 运行 Tab 本地副本的存储键（按接口 id） */
export function getRunTabStorageKey(apiId: string): string {
  return `${STORAGE_PREFIX}${apiId}`
}

export function cloneApiDetails(source: ApiDetails): ApiDetails {
  return JSON.parse(JSON.stringify(source)) as ApiDetails
}

/** 把「保存到文档」时落库的运行时信息合并进文档定义 */
export function mergeRunTabInfo(docValue: ApiDetails, runTabInfo: RunTabInfo): ApiDetails {
  const base = cloneApiDetails(docValue)
  const hasBodyChanges = runTabInfo.bodyType !== undefined
    || runTabInfo.bodyParameters !== undefined
    || runTabInfo.bodyRawText !== undefined

  return {
    ...base,
    parameters: runTabInfo.parameters ?? base.parameters,
    requestBody: hasBodyChanges
      ? {
          type: runTabInfo.bodyType ?? base.requestBody?.type ?? 'none',
          parameters: runTabInfo.bodyParameters ?? base.requestBody?.parameters,
          rawText: runTabInfo.bodyRawText ?? base.requestBody?.rawText,
        } as ApiRequestBody
      : base.requestBody,
    preScript: runTabInfo.preScript ?? base.preScript,
    postScript: runTabInfo.postScript ?? base.postScript,
  }
}

/**
 * 运行 Tab 的本地副本。
 *
 * `docUpdatedAt` 记录写入时的文档版本（菜单行 `updatedAt`）。旧版本直接存了裸
 * `ApiDetails`，读取时按「无版本戳」兼容，视为未过期以保留用户内容。
 *
 * `v` 是载荷版本：v2 起 Body 正文只认用户输入。旧载荷（无 `v`）里若正文与文档
 * rawText 完全一致，视为历史自动填充留下的回显，一次性丢弃。
 */
export interface LocalRunCopy {
  v?: number
  docUpdatedAt?: string
  workCopy: ApiDetails
}

const LOCAL_COPY_VERSION = 2

function isApiDetailsLike(value: unknown): value is ApiDetails {
  return !!value && typeof value === 'object' && typeof (value as ApiDetails).id === 'string' && (value as ApiDetails).id.length > 0
}

export function readLocalRunCopy(storageKey: string): LocalRunCopy | undefined {
  if (!storageKey) { return undefined }

  try {
    const raw = window.localStorage.getItem(storageKey)

    if (!raw) { return undefined }

    const parsed: unknown = JSON.parse(raw)

    if (!parsed || typeof parsed !== 'object') { return undefined }

    const payload = parsed as { workCopy?: unknown, docUpdatedAt?: unknown, v?: unknown }

    if (isApiDetailsLike(payload.workCopy)) {
      return {
        v: typeof payload.v === 'number' ? payload.v : undefined,
        docUpdatedAt: typeof payload.docUpdatedAt === 'string' ? payload.docUpdatedAt : undefined,
        workCopy: payload.workCopy,
      }
    }

    // 旧格式：裸 ApiDetails
    if (isApiDetailsLike(parsed)) {
      return { workCopy: parsed }
    }

    return undefined
  }
  catch {
    return undefined
  }
}

export function writeLocalRunCopy(
  storageKey: string,
  docUpdatedAt: string | undefined,
  workCopy: ApiDetails,
): void {
  if (!storageKey) { return }

  try {
    const payload: LocalRunCopy = { v: LOCAL_COPY_VERSION, docUpdatedAt, workCopy }
    window.localStorage.setItem(storageKey, JSON.stringify(payload))
  }
  catch {
    // 存储不可用（隐私模式 / 配额）时静默降级：运行 Tab 仍可工作，只是不跨会话恢复
  }
}

export interface ResolveInitialWorkCopyInput {
  docValue: ApiDetails
  savedRunTabInfo?: RunTabInfo
  localCopy?: LocalRunCopy
  docUpdatedAt?: string
}

/**
 * 决定运行 Tab 首次渲染时的 `workCopy`。
 *
 * 纯函数：只依赖入参，不读存储、不看渲染时序，因此「菜单数据早到/晚到」不会
 * 改变结果（这是 Body 二次进入变空白的根因之一）。
 *
 * 决策：
 * 1. 无本地副本 → 文档定义 + 保存点，但 **Body 正文不取文档 rawText**（见下）；
 * 2. 本地副本无版本戳（旧格式）或版本一致 → 本地副本（保留用户填写的 Body）；
 * 3. 文档版本已变化 → 文档定义 + 保存点；正文仍取用户自己的输入。
 *
 * Body 正文策略（「只认用户自己的输入」）：编辑器的初始正文只来自
 * 本地副本或「保存到文档」时显式保存的 `bodyRawText`，绝不取
 * `docValue.requestBody.rawText`。文档里那段 rawText 可能是一段 JSON Schema
 * 源码（把 schema 粘进 Body 编辑器留下的），自动写进编辑器会让用户
 * 「明明没填内容，第二次进入却被填充」。需要示例时由「一键填充」显式生成。
 */
export function resolveInitialWorkCopy(input: ResolveInitialWorkCopyInput): ApiDetails {
  const { docValue, savedRunTabInfo, localCopy, docUpdatedAt } = input

  // 用户自己的正文：本地副本优先，其次是显式保存过的运行时正文
  const localBodyRawText = localCopy?.workCopy.requestBody?.rawText
  const docBodyRawText = docValue.requestBody?.rawText

  // 旧载荷（无 v 标记）里若正文与文档 rawText 完全相同，判定为历史自动填充的回显，丢弃一次
  const localBodyIsDocEcho = localCopy?.v !== LOCAL_COPY_VERSION
    && !!localBodyRawText
    && localBodyRawText === docBodyRawText

  const userBodyRawText = localBodyIsDocEcho
    ? savedRunTabInfo?.bodyRawText
    : (localBodyRawText ?? savedRunTabInfo?.bodyRawText)

  const withUserBody = (details: ApiDetails): ApiDetails => {
    if (!details.requestBody) { return details }

    const rawText = userBodyRawText ?? ''

    if (details.requestBody.rawText === rawText) { return details }

    return { ...details, requestBody: { ...details.requestBody, rawText } }
  }

  const fromDoc = (): ApiDetails => withUserBody(
    savedRunTabInfo ? mergeRunTabInfo(docValue, savedRunTabInfo) : cloneApiDetails(docValue),
  )

  if (!localCopy) { return fromDoc() }

  const localIsCurrent = !localCopy.docUpdatedAt || !docUpdatedAt
    ? true
    : localCopy.docUpdatedAt === docUpdatedAt

  if (localIsCurrent) {
    const copy = cloneApiDetails(localCopy.workCopy)

    return localBodyIsDocEcho ? withUserBody(copy) : copy
  }

  return fromDoc()
}
