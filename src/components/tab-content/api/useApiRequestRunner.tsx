import { useCallback, useState } from 'react'
import { useParams } from 'react-router'

import { api } from '@/api-client'
import { useAuth } from '@/contexts/auth'
import { useTabContentContext } from '@/components/ApiTab/TabContentContext'
import { SERVER_INHERIT } from '@/configs/static'
import { useGlobalContext } from '@/contexts/global'
import { useMenuHelpersContext } from '@/contexts/menu-helpers'
import { findFolders } from '@/helpers'
import { getPrimaryEnvironmentUrl } from '@/project-environment-utils'
import type { ApiDetails, ApiEnvironment, ApiFolder, ApiRunResult } from '@/types'

const ABSOLUTE_URL_REGEX = /^https?:\/\//i

function normalizeBaseUrl(value: string) {
  const normalized = value.trim()

  if (!ABSOLUTE_URL_REGEX.test(normalized)) {
    throw new Error('前置 URL 必须以 http:// 或 https:// 开头')
  }

  return normalized
}

function resolveInlineBaseUrl(value?: string) {
  if (!value?.trim()) {
    return undefined
  }

  return ABSOLUTE_URL_REGEX.test(value.trim())
    ? normalizeBaseUrl(value)
    : undefined
}

function getEnvironmentBaseUrl(projectEnvironments: ApiEnvironment[], environmentId: string) {
  const environment = projectEnvironments.find(({ id }) => id === environmentId)

  if (!environment) {
    throw new Error(`环境不存在：${environmentId}`)
  }

  return normalizeBaseUrl(getPrimaryEnvironmentUrl(environment))
}

function getExplicitEnvironmentId(serverId?: string) {
  const normalized = serverId?.trim() ?? SERVER_INHERIT

  if (!normalized || normalized === SERVER_INHERIT || normalized === 'default') {
    return undefined
  }

  return normalized
}

export function useApiRequestRunner(apiId?: string) {
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<ApiRunResult>()
  const [error, setError] = useState<string>()

  const { projectId } = useParams()
  const { sessionId } = useAuth()
  const { tabData } = useTabContentContext()
  const { messageApi } = useGlobalContext()
  const {
    menuRawList,
    projectEnvironments,
    currentProjectEnvironmentId,
  } = useMenuHelpersContext()

  const resolveParentFolders = useCallback(() => {
    const currentMenuId = apiId ?? tabData.key
    const currentMenu = menuRawList?.find(({ id }) => id === currentMenuId)

    return currentMenu?.parentId
      ? findFolders(menuRawList ?? [], [], currentMenu.parentId)
      : []
  }, [menuRawList, tabData.key, apiId])

  const resolveEnvironmentId = useCallback((apiDetails: ApiDetails) => {
    const explicitEnvironmentId = getExplicitEnvironmentId(apiDetails.serverId)

    if (explicitEnvironmentId) {
      return explicitEnvironmentId
    }

    const parentFolders = resolveParentFolders()

    for (let index = parentFolders.length - 1; index >= 0; index -= 1) {
      const folderData = parentFolders[index]?.data as ApiFolder | undefined
      const folderEnvironmentId = getExplicitEnvironmentId(folderData?.serverId)

      if (folderEnvironmentId) {
        return folderEnvironmentId
      }
    }

    return currentProjectEnvironmentId
  }, [currentProjectEnvironmentId, resolveParentFolders])

  const resolveBaseUrlOverride = useCallback((apiDetails: ApiDetails, environmentId?: string) => {
    const path = apiDetails.path?.trim() ?? ''
    const usesAbsoluteUrl = ABSOLUTE_URL_REGEX.test(path)
    const inlineBaseUrl = resolveInlineBaseUrl(apiDetails.serverUrl)
    const explicitEnvironmentId = getExplicitEnvironmentId(apiDetails.serverId)

    if (explicitEnvironmentId) {
      return usesAbsoluteUrl
        ? undefined
        : getEnvironmentBaseUrl(projectEnvironments, explicitEnvironmentId)
    }

    if (inlineBaseUrl) {
      return usesAbsoluteUrl ? undefined : inlineBaseUrl
    }

    const parentFolders = resolveParentFolders()

    for (let index = parentFolders.length - 1; index >= 0; index -= 1) {
      const folderData = parentFolders[index]?.data as ApiFolder | undefined
      const folderEnvironmentId = getExplicitEnvironmentId(folderData?.serverId)
      const folderInlineBaseUrl = resolveInlineBaseUrl(folderData?.serverUrl)

      if (folderEnvironmentId) {
        return usesAbsoluteUrl
          ? undefined
          : getEnvironmentBaseUrl(projectEnvironments, folderEnvironmentId)
      }

      if (folderInlineBaseUrl) {
        return usesAbsoluteUrl ? undefined : folderInlineBaseUrl
      }
    }

    if (environmentId) {
      return usesAbsoluteUrl ? undefined : getEnvironmentBaseUrl(projectEnvironments, environmentId)
    }

    if (usesAbsoluteUrl) {
      return undefined
    }

    throw new Error('请先在顶部选择环境，或到“管理环境”中配置前置 URL')
  }, [projectEnvironments, resolveParentFolders])

  const run = useCallback(async (apiDetails: ApiDetails) => {
    if (!projectId || !sessionId) {
      const msg = '当前不在项目页面，无法运行请求'
      messageApi.error(msg)
      setError(msg)

      return
    }

    setRunning(true)
    setError(undefined)
    setResult(undefined)

    try {
      const environmentId = resolveEnvironmentId(apiDetails)
      const baseUrlOverride = resolveBaseUrlOverride(apiDetails, environmentId)
      const payload = await api<ApiRunResult>('run_api_request', {
        sessionId,
        projectId,
        payload: { apiDetails, environmentId },
      })

      setResult(payload)
    }
    catch (err) {
      const msg = err instanceof Error ? err.message : '运行失败'
      messageApi.error(msg)
      setError(msg)
    }
    finally {
      setRunning(false)
    }
  }, [messageApi, projectId, sessionId, resolveBaseUrlOverride, resolveEnvironmentId])

  const resetResult = useCallback(() => {
    setResult(undefined)
    setError(undefined)
  }, [])

  return {
    run,
    running,
    result,
    error,
    resetResult,
  }
}
