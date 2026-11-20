import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { show } from '@ebay/nice-modal-react'
import { Dropdown, type DropDownProps, type MenuProps, Modal, Table, Tag, theme } from 'antd'
import { CopyIcon, FolderInputIcon, FolderPlusIcon, PencilIcon, PlayIcon, TrashIcon } from 'lucide-react'
import { nanoid } from 'nanoid'

import type { ApiMenuData } from '@/components/ApiMenu/ApiMenu.type'
import { FileIcon } from '@/components/icons/FileIcon'
import { ModalImportCurl } from '@/components/modals/ModalImportCurl'
import { ModalMoveMenu } from '@/components/modals/ModalMoveMenu'
import { ModalNewCatalog } from '@/components/modals/ModalNewCatalog'
import { ModalRename } from '@/components/modals/ModalRename'
import { buildRequest } from '@/components/tab-content/api/buildRequest'
import { collectFolderApis } from '@/components/tab-content/api/collectFolderApis'
import { buildBodyExample } from '@/components/tab-content/api/requestBodyExample'
import { useApiRequestRunner } from '@/components/tab-content/api/useApiRequestRunner'
import { buildVarMaps, makeResolveVars } from '@/components/tab-content/api/useResolvedVarMap'
import { API_MENU_CONFIG } from '@/configs/static'
import { useGlobalContext } from '@/contexts/global'
import { useMenuHelpersContext } from '@/contexts/menu-helpers'
import { useMenuTabHelpers } from '@/contexts/menu-tab-settings'
import { useSessionVariablesContext } from '@/contexts/session-variables'
import { MenuItemType } from '@/enums'
import { getCatalogType, getCreateType } from '@/helpers'
import { useHelpers } from '@/hooks/useHelpers'
import { getPrimaryEnvironmentUrl } from '@/project-environment-utils'
import type { ApiDetails } from '@/types'

interface DropdownActionsProps extends DropDownProps {
  catalog: ApiMenuData
  isFolder?: boolean
}

type MenuClickInfo = Parameters<NonNullable<MenuProps['onClick']>>[0]

/**
 * 菜单的操作菜单。
 */
export function DropdownActions(props: React.PropsWithChildren<DropdownActionsProps>) {
  const { token } = theme.useToken()
  const { t } = useTranslation()

  const { children, catalog, isFolder = false, ...dropdownProps } = props

  const { modal, messageApi } = useGlobalContext()
  const {
    addMenuItem,
    removeMenuItem,
    discardDraft,
    menuRawList,
    projectEnvironmentConfig,
    currentProjectEnvironmentId,
  } = useMenuHelpersContext()
  const { addTabItem, removeTabItem } = useMenuTabHelpers()
  const { createTabItem } = useHelpers()
  const { sessionVars } = useSessionVariablesContext()
  const { run } = useApiRequestRunner()

  const currentEnv = projectEnvironmentConfig?.environments?.find((e) => e.id === currentProjectEnvironmentId)
  const envBaseUrl = currentEnv ? getPrimaryEnvironmentUrl(currentEnv) : ''

  const [batchResult, setBatchResult] = useState<{ name: string, status: number, durationMs: number, error?: string }[]>()

  const notifyDeleted = useCallback(() => {
    messageApi.success({
      type: 'success',
      content: t('api.menu.movedToRecycleBin'),
      duration: 6,
    })
  }, [messageApi, t])

  const { tipTitleKey } = API_MENU_CONFIG[getCatalogType(catalog.type)]
  const tipTitle = tipTitleKey ? t(tipTitleKey) : ''
  const createType = getCreateType(catalog.type)

  const commonActionMenuItems: MenuProps['items'] = [
    {
      key: 'rename',
      label: t('api.menu.rename'),
      icon: <PencilIcon size={14} />,
      onClick: (ev) => {
        ev.domEvent.stopPropagation()

        void show(ModalRename, {
          formData: { id: catalog.id, name: catalog.name },
        })
      },
    },
    {
      key: 'copy',
      label: t('common.copy'),
      icon: <CopyIcon size={14} />,
      onClick: (ev) => {
        ev.domEvent.stopPropagation()

        addMenuItem({ ...catalog, id: nanoid(6) })
      },
    },
    {
      key: 'move',
      label: t('api.menu.moveTo'),
      icon: <FolderInputIcon size={14} />,
      onClick: (ev) => {
        ev.domEvent.stopPropagation()

        void show(ModalMoveMenu, {
          menuItemType: catalog.type,
          formData: { id: catalog.id },
        })
      },
    },
  ]

  const folderActionMenu: MenuProps['items'] = [
    {
      key: 'create',
      label: tipTitle,
      icon: <FileIcon size={14} style={{ color: token.colorPrimary }} type={createType} />,
      onClick: (ev) => {
        ev.domEvent.stopPropagation()
        createTabItem(createType, catalog.id)
      },
    },
    ...(catalog.type === MenuItemType.ApiDetailFolder || catalog.type === MenuItemType.RequestFolder
      ? [
          {
            key: 'run-all',
            label: t('api.menu.runAll'),
            icon: <PlayIcon size={14} />,
            onClick: (ev: MenuClickInfo) => {
              ev.domEvent.stopPropagation()
              void handleRunAll()
            },
          },
        ]
      : []),
    ...(catalog.type === MenuItemType.ApiDetailFolder
      ? [
          {
            key: 'importCurl',
            label: t('api.menu.importCurl'),
            icon: <FolderInputIcon size={14} />,
            onClick: (ev: MenuClickInfo) => {
              ev.domEvent.stopPropagation()
              void show(ModalImportCurl, {
                parentId: catalog.id,
                onImport: (menuItem) => {
                  addMenuItem(menuItem)
                  addTabItem({
                    key: menuItem.id,
                    label: menuItem.name,
                    contentType: menuItem.type,
                  })
                },
              })
            },
          },
        ]
      : []),

    { type: 'divider' },

    ...commonActionMenuItems,

    { type: 'divider' },

    {
      key: 'new',
      label: t('api.menu.addSubCatalog'),
      icon: <FolderPlusIcon size={14} />,
      onClick: (ev) => {
        ev.domEvent.stopPropagation()

        void show(ModalNewCatalog, {
          formData: { parentId: catalog.id, type: catalog.type },
        })
      },
    },

    { type: 'divider' },

    {
      key: 'delete',
      label: t('common.delete'),
      icon: <TrashIcon size={14} />,
      onClick: (ev) => {
        ev.domEvent.stopPropagation()

        modal.confirm({
          title: <span className="font-normal">{t('api.menu.deleteFolderTitle', { name: catalog.name })}</span>,
          content: `${
            catalog.type === MenuItemType.ApiDetailFolder
              ? t('api.menu.deleteFolderWithApisPrefix')
              : catalog.type === MenuItemType.ApiSchemaFolder
                ? t('api.menu.deleteFolderWithSchemasPrefix')
                : ''
          }${t('api.menu.moveToRecycleBinSuffix')}`,
          okText: t('common.delete'),
          okButtonProps: { danger: true },
          maskClosable: true,
          onOk: async () => {
            const ok = await removeMenuItem({ id: catalog.id })

            if (ok) {
              discardDraft(catalog.id)
              notifyDeleted()
            }
          },
        })
      },
    },
  ]

  const fileActionMenu: MenuProps['items'] = [
    ...commonActionMenuItems,

    { type: 'divider' },

    {
      key: 'delete',
      label: t('common.delete'),
      icon: <TrashIcon size={14} />,
      onClick: (ev) => {
        ev.domEvent.stopPropagation()

        const { titleKey } = API_MENU_CONFIG[getCatalogType(catalog.type)]
        const title = titleKey ? t(titleKey) : ''

        modal.confirm({
          title: (
            <span className="font-normal">
              {t('api.menu.deleteFileTitle', { kind: title, name: catalog.name })}
            </span>
          ),
          content: `${
            catalog.type === MenuItemType.ApiDetail
              ? t('api.menu.deleteApiPrefix')
              : catalog.type === MenuItemType.Doc
                ? t('api.menu.deleteDocPrefix')
                : catalog.type === MenuItemType.ApiSchema
                  ? t('api.menu.deleteSchemaPrefix')
                  : ''
          }${t('api.menu.moveToRecycleBinSuffix')}`,
          okText: t('common.delete'),
          okButtonProps: { danger: true },
          maskClosable: true,
          onOk: async () => {
            const ok = await removeMenuItem({ id: catalog.id })

            if (ok) {
              discardDraft(catalog.id)
              notifyDeleted()
            }
          },
        })
      },
    },
  ]

  const draftActionMenu: MenuProps['items'] = [
    {
      key: 'discard-draft',
      label: t('api.menu.discardDraft'),
      icon: <TrashIcon size={14} />,
      onClick: (ev) => {
        ev.domEvent.stopPropagation()
        // 草稿仅存在于 localStorage，直接丢弃（不进回收站）并关闭其页签。
        discardDraft(catalog.id)
        removeTabItem({ key: catalog.id })
      },
    },
  ]

  const handleRunAll = async () => {
    const apis = collectFolderApis(catalog.id, menuRawList ?? [])

    if (!apis.length) {
      messageApi.warning(t('api.menu.noRunnableApi'))

      return
    }

    const { varMap } = buildVarMaps({
      globalVariables: projectEnvironmentConfig?.globalVariables,
      envVariables: currentEnv?.variables,
      sessionVars,
    })
    const resolveVars = makeResolveVars(varMap)

    const results: { name: string, status: number, durationMs: number, error?: string }[] = []

    for (const api of apis) {
      const details = api.data as ApiDetails

      if (!details) {
        results.push({ name: api.name, status: 0, durationMs: 0, error: t('api.menu.missingApiData') })
        continue
      }

      const built = await buildRequest({
        method: details.method ?? 'GET',
        baseUrl: envBaseUrl,
        path: details.path,
        query: details.parameters?.query ?? [],
        header: details.parameters?.header ?? [],
        cookie: details.parameters?.cookie ?? [],
        body: details.requestBody
          ? { type: details.requestBody.type, rawText: details.requestBody.rawText, parameters: details.requestBody.parameters ?? [] }
          : undefined,
        resolveVars,
        buildBodyExample,
        // 批量运行没有 Body 编辑界面，无法手动「一键填充」，保持按文档定义发送的旧行为
        fallbackBodyExample: true, apiDetails: details,
        menuRawList,
        insecureSkipVerify: false,
      })

      try {
        const r = await run(api.id, built.url, built.method, built.headers, built.bodyText, built.contentType, built.formDataFiles, built.bodyFile, false)

        if (r) {
          results.push({ name: api.name, status: r.status, durationMs: r.durationMs })
        }
        else {
          results.push({ name: api.name, status: 0, durationMs: 0, error: t('api.menu.runFailed') })
        }
      }
      catch (err) {
        results.push({ name: api.name, status: 0, durationMs: 0, error: err instanceof Error ? err.message : String(err) })
      }
    }

    setBatchResult(results)
  }

  return (
    <>
      <Dropdown
        menu={{
          items: catalog.__isDraft ? draftActionMenu : isFolder ? folderActionMenu : fileActionMenu,
          onContextMenu: (ev) => {
            ev.preventDefault()
            ev.stopPropagation()
          },
        }}
        {...dropdownProps}
      >
        {children}
      </Dropdown>
      <Modal
        footer={null}
        open={!!batchResult}
        title={t('api.menu.batchRunResult', { count: batchResult?.length ?? 0 })}
        width={640}
        onCancel={() => { setBatchResult(undefined) }}
      >
        {batchResult && (
          <>
            <div style={{ marginBottom: 12 }}>
              {t('api.menu.batchRunSummary', {
                success: batchResult.filter((r) => !r.error && r.status !== 0 && r.status < 400).length,
                failed: batchResult.filter((r) => r.error ?? r.status >= 400).length,
              })}
            </div>
            <Table
              columns={[
                { title: t('api.menu.columnApi'), dataIndex: 'name', key: 'name' },
                {
                  title: t('api.menu.columnStatus'),
                  dataIndex: 'status',
                  key: 'status',
                  render: (status: number, row: { error?: string }) => row.error
                    ? <Tag color="error">{t('api.menu.errorTag')}</Tag>
                    : <Tag color={status !== 0 && status < 400 ? 'success' : 'error'}>{status}</Tag>,
                },
                { title: t('api.menu.columnDuration'), dataIndex: 'durationMs', key: 'durationMs', render: (v: number) => `${v} ms` },
                { title: t('api.menu.columnInfo'), dataIndex: 'error', key: 'error', render: (v?: string) => v ?? '-' },
              ]}
              dataSource={batchResult.map((r, i) => ({ ...r, key: i }))}
              pagination={false}
              size="small"
            />
          </>
        )}
      </Modal>
    </>
  )
}
