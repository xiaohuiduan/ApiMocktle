import { useState } from 'react'
import { show } from '@ebay/nice-modal-react'
import { Dropdown, type DropDownProps, type MenuProps, Modal, Table, Tag, theme } from 'antd'
import { CopyIcon, FolderInputIcon, FolderPlusIcon, PencilIcon, PlayIcon, TrashIcon } from 'lucide-react'
import { nanoid } from 'nanoid'

import type { ApiMenuData } from '@/components/ApiMenu/ApiMenu.type'
import type { ApiDetails } from '@/types'
import { FileIcon } from '@/components/icons/FileIcon'
import { ModalImportCurl } from '@/components/modals/ModalImportCurl'
import { ModalMoveMenu } from '@/components/modals/ModalMoveMenu'
import { ModalNewCatalog } from '@/components/modals/ModalNewCatalog'
import { ModalRename } from '@/components/modals/ModalRename'
import { API_MENU_CONFIG } from '@/configs/static'
import { useGlobalContext } from '@/contexts/global'
import { useMenuHelpersContext } from '@/contexts/menu-helpers'
import { useMenuTabHelpers } from '@/contexts/menu-tab-settings'
import { MenuItemType } from '@/enums'
import { getCatalogType, getCreateType } from '@/helpers'
import { useHelpers } from '@/hooks/useHelpers'
import { useApiRequestRunner } from '@/components/tab-content/api/useApiRequestRunner'
import { buildRequest } from '@/components/tab-content/api/buildRequest'
import { buildVarMaps, makeResolveVars } from '@/components/tab-content/api/useResolvedVarMap'
import { collectFolderApis } from '@/components/tab-content/api/collectFolderApis'
import { buildBodyExample } from '@/components/tab-content/api/requestBodyExample'
import { getPrimaryEnvironmentUrl } from '@/project-environment-utils'
import { useSessionVariablesContext } from '@/contexts/session-variables'

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

  const currentEnv = projectEnvironmentConfig?.environments?.find(e => e.id === currentProjectEnvironmentId)
  const envBaseUrl = currentEnv ? getPrimaryEnvironmentUrl(currentEnv) : ''

  const [batchResult, setBatchResult] = useState<Array<{ name: string; status: number; durationMs: number; error?: string }>>()

  const { tipTitle } = API_MENU_CONFIG[getCatalogType(catalog.type)]
  const createType = getCreateType(catalog.type)

  const commonActionMenuItems: MenuProps['items'] = [
    {
      key: 'rename',
      label: '重命名',
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
      label: '复制',
      icon: <CopyIcon size={14} />,
      onClick: (ev) => {
        ev.domEvent.stopPropagation()

        addMenuItem({ ...catalog, id: nanoid(6) })
      },
    },
    {
      key: 'move',
      label: '移动到',
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
        createTabItem(createType)
      },
    },
    ...(catalog.type === MenuItemType.ApiDetailFolder || catalog.type === MenuItemType.RequestFolder
      ? [{
          key: 'run-all',
          label: '运行全部',
          icon: <PlayIcon size={14} />,
          onClick: (ev: MenuClickInfo) => {
            ev.domEvent.stopPropagation()
            void handleRunAll()
          },
        }]
      : []),
    ...(catalog.type === MenuItemType.ApiDetailFolder
      ? [{
          key: 'importCurl',
          label: '导入 cURL',
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
        }]
      : []),

    { type: 'divider' },

    ...commonActionMenuItems,

    { type: 'divider' },

    {
      key: 'new',
      label: '添加子目录',
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
      label: '删除',
      icon: <TrashIcon size={14} />,
      onClick: (ev) => {
        ev.domEvent.stopPropagation()

        modal.confirm({
          title: <span className="font-normal">删除目录“{catalog.name}”？</span>,
          content: `${
            catalog.type === MenuItemType.ApiDetailFolder
              ? '该目录及该目录下的接口和用例都'
              : catalog.type === MenuItemType.ApiSchemaFolder
                ? '该目录及该目录下的数据模型都'
                : ''
          }将移至回收站，30 天后自动彻底删除。`,
          okText: '删除',
          okButtonProps: { danger: true },
          maskClosable: true,
          onOk: () => {
            removeMenuItem({ id: catalog.id })
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
      label: '删除',
      icon: <TrashIcon size={14} />,
      onClick: (ev) => {
        ev.domEvent.stopPropagation()

        const { title } = API_MENU_CONFIG[getCatalogType(catalog.type)]

        modal.confirm({
          title: (
            <span className="font-normal">
              删除{title}“{catalog.name}”？
            </span>
          ),
          content: `${
            catalog.type === MenuItemType.ApiDetail
              ? '该接口和该接口下的用例都'
              : catalog.type === MenuItemType.Doc
                ? '文档'
                : catalog.type === MenuItemType.ApiSchema
                  ? '该数据模型'
                  : ''
          }将移至回收站，30 天后自动彻底删除。`,
          okText: '删除',
          okButtonProps: { danger: true },
          maskClosable: true,
          onOk: () => {
            removeMenuItem({ id: catalog.id })
          },
        })
      },
    },
  ]

  const draftActionMenu: MenuProps['items'] = [
    {
      key: 'discard-draft',
      label: '删除草稿',
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
      messageApi.warning('该目录下没有可运行的接口')
      return
    }

    const { varMap } = buildVarMaps({
      globalVariables: projectEnvironmentConfig?.globalVariables,
      vaultSecrets: projectEnvironmentConfig?.vaultSecrets,
      envVariables: currentEnv?.variables,
      sessionVars,
    })
    const resolveVars = makeResolveVars(varMap)

    const results: Array<{ name: string; status: number; durationMs: number; error?: string }> = []
    for (const api of apis) {
      const details = api.data as ApiDetails
      if (!details) {
        results.push({ name: api.name, status: 0, durationMs: 0, error: '缺少接口数据' })
        continue
      }
      const built = buildRequest({
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
        apiDetails: details,
        menuRawList,
        insecureSkipVerify: false,
      })
      try {
        const r = await run(api.id, built.url, built.method, built.headers, built.bodyText, built.contentType, built.formDataFiles, false)
        if (r) {
          results.push({ name: api.name, status: r.status, durationMs: r.durationMs })
        } else {
          results.push({ name: api.name, status: 0, durationMs: 0, error: '运行失败' })
        }
      } catch (err) {
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
        title={`批量运行结果（${batchResult?.length ?? 0}）`}
        open={!!batchResult}
        footer={null}
        onCancel={() => setBatchResult(undefined)}
        width={640}
      >
        {batchResult && (
          <>
            <div style={{ marginBottom: 12 }}>
              成功 {batchResult.filter(r => !r.error && r.status !== 0 && r.status < 400).length} / 失败{' '}
              {batchResult.filter(r => r.error || r.status >= 400).length}
            </div>
            <Table
              size="small"
              pagination={false}
              dataSource={batchResult.map((r, i) => ({ ...r, key: i }))}
              columns={[
                { title: '接口', dataIndex: 'name', key: 'name' },
                {
                  title: '状态',
                  dataIndex: 'status',
                  key: 'status',
                  render: (status: number, row: { error?: string }) => row.error
                    ? <Tag color="error">错误</Tag>
                    : <Tag color={status !== 0 && status < 400 ? 'success' : 'error'}>{status}</Tag>,
                },
                { title: '耗时', dataIndex: 'durationMs', key: 'durationMs', render: (v: number) => `${v} ms` },
                { title: '信息', dataIndex: 'error', key: 'error', render: (v?: string) => v ?? '-' },
              ]}
            />
          </>
        )}
      </Modal>
    </>
  )
}
