import { useEffect, useMemo, useRef, useState } from 'react'
import { useEvent } from 'react-use-event-hook'

import { Button, Form, Input, Select, type SelectProps, Space, Typography } from 'antd'
import { PencilIcon } from 'lucide-react'
import { nanoid } from 'nanoid'

import type { ApiMenuData } from '@/components/ApiMenu/ApiMenu.type'
import { PageTabStatus } from '@/components/ApiTab/ApiTab.enum'
import { useTabContentContext } from '@/components/ApiTab/TabContentContext'
import { ApiRemoveButton } from '@/components/tab-content/api/ApiRemoveButton'
import { ResponseTab } from '@/components/tab-content/api/components/ResponseTab'
import { HTTP_METHOD_CONFIG } from '@/configs/static'
import { useGlobalContext } from '@/contexts/global'
import { isDraftEmpty } from '@/contexts/menu-drafts'
import { useMenuHelpersContext } from '@/contexts/menu-helpers'
import { useMenuTabHelpers } from '@/contexts/menu-tab-settings'
import { initialCreateApiDetailsData } from '@/data/remote'
import { MenuItemType, ParamType } from '@/enums'
import { useCtrlSave } from '@/hooks/useCtrlSave'
import type { ApiDetails } from '@/types'

import { BaseFormItems } from './components/BaseFormItems'
import { GroupTitle } from './components/GroupTitle'
import { PathInput, type PathInputProps } from './components/PathInput'
import { ParamsBody } from './params/ParamsBody'
import { ParamsTab } from './params/ParamsTab'
import { useApiSubTabContext } from './Api'

const DEFAULT_NAME = '未命名接口'

const methodOptions: SelectProps['options'] = Object.entries(HTTP_METHOD_CONFIG).map(
  ([method, { color }]) => {
    return {
      value: method,
      label: (
        <span className="font-semibold" style={{ color: `var(${color})` }}>
          {method}
        </span>
      ),
    }
  },
)

/**
 * API 「修改文档」部分。
 */
export function ApiDocEditing() {
  const [form] = Form.useForm<ApiDetails>()

  const { messageApi } = useGlobalContext()
  const msgKey = useRef<string>()

  const {
    menuRawList,
    dbMenuRawList,
    addMenuItem,
    updateMenuItem,
    saveDraft,
    discardDraft,
  } = useMenuHelpersContext()
  const { setTabItemStatus, setTabItemEditStatus } = useMenuTabHelpers()
  const { tabData } = useTabContentContext()
  const isCreating = tabData.data?.tabStatus === PageTabStatus.Create
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const initialLoadKey = useRef<string | undefined>()
  const persistTimer = useRef<ReturnType<typeof setTimeout>>()
  // 是否发生过用户编辑：避免“打开已存接口后未改动即关闭”被误写覆盖层/标记为脏。
  const hasEditedRef = useRef(false)
  const subTabKey = useApiSubTabContext()

  // 新建时按 tab 的 contentType 决定入库/草稿类型（接口 or 快捷请求）。
  const createType = tabData.contentType === MenuItemType.HttpRequest
    ? MenuItemType.HttpRequest
    : MenuItemType.ApiDetail

  // 数据库原始数据（不含草稿覆盖层），用于判断已入库项是否被改动。
  const dbSavedData = useMemo(() => {
    return dbMenuRawList?.find(({ id }) => id === tabData.key)?.data as ApiDetails | undefined
  }, [dbMenuRawList, tabData.key])

  const menuApiName = useMemo(() => {
    return menuRawList?.find(({ id }) => id === tabData.key)?.name ?? DEFAULT_NAME
  }, [menuRawList, tabData.key])

  useCtrlSave(() => { form.submit() }, isCreating || subTabKey === 'docEdit')

  // 挂载/切换页签时从合并列表（含草稿）加载初值：
  // - 新建接口：加载 createApiDetails 写入的草稿（含用户之前的编辑），无草稿时退回默认模板。
  // - 已存接口：加载 DB 数据或其未保存修改覆盖层。
  // 用 initialLoadKey 保证每个 key 只灌一次，避免后续草稿写入触发的 menuRawList 变化覆盖用户输入。
  useEffect(() => {
    if (initialLoadKey.current === tabData.key) { return }

    const menuData = menuRawList?.find(({ id }) => id === tabData.key)

    if (
      menuData?.data
      && (
        menuData.type === MenuItemType.ApiDetail
        || menuData.type === MenuItemType.HttpRequest
      )
    ) {
      initialLoadKey.current = tabData.key
      hasEditedRef.current = false
      form.setFieldsValue(menuData.data as any)
    }
    else if (isCreating) {
      initialLoadKey.current = tabData.key
      hasEditedRef.current = false
      form.setFieldsValue(initialCreateApiDetailsData as any)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabData.key, isCreating, menuRawList])

  // 构造用于写草稿/入库的菜单数据。
  const buildMenuData = useEvent((values: ApiDetails): ApiMenuData => {
    const rawName = values.name?.trim() ?? ''
    const menuName = rawName.length > 0 ? rawName : DEFAULT_NAME

    return {
      id: tabData.key,
      name: menuName,
      type: createType,
      data: { ...values, name: menuName },
    } as ApiMenuData
  })

  // 将当前表单内容写入 localStorage 草稿：
  // - 新建：非空才写（空草稿由 createApiDetails 的初始写入 + ApiTab 关闭时丢弃负责）。
  // - 已存：仅在发生过编辑后，按是否与 DB 原始数据一致写覆盖层 / 清覆盖层。
  const persistDraft = useEvent(() => {
    const values = form.getFieldsValue(true) as ApiDetails
    const draftItem = buildMenuData(values)

    if (isCreating) {
      if (isDraftEmpty(draftItem)) {
        return
      }

      saveDraft(draftItem, true)

      return
    }

    if (!hasEditedRef.current) {
      return
    }

    if (dbSavedData && JSON.stringify(values) === JSON.stringify(dbSavedData)) {
      discardDraft(tabData.key)
      setTabItemEditStatus({ key: tabData.key }, 'saved')
    }
    else {
      saveDraft(draftItem, false)
      setTabItemEditStatus({ key: tabData.key }, 'changed')
    }
  })

  // 编辑防抖写草稿（~500ms）。
  const schedulePersist = useEvent(() => {
    hasEditedRef.current = true

    if (persistTimer.current) {
      clearTimeout(persistTimer.current)
    }

    persistTimer.current = setTimeout(() => { persistDraft() }, 500)
  })

  // 组件卸载（切换 tab/项目、Create→Update 翻转）时强制 flush，避免丢失未保存编辑。
  useEffect(() => {
    return () => {
      if (persistTimer.current) {
        clearTimeout(persistTimer.current)
      }

      persistDraft()
    }
  }, [persistDraft])

  const handleTitleConfirm = async () => {
    const newName = titleDraft.trim() || DEFAULT_NAME
    form.setFieldValue('name', newName)
    setEditingTitle(false)

    if (isCreating) {
      // 新建接口不入库：改名后写回草稿，使左侧树名称与红 * 即时更新。
      hasEditedRef.current = true
      persistDraft()
    }
    else {
      // 保存当前表单状态，reloadState 后会重置表单
      const currentFormData = form.getFieldsValue() as any
      await updateMenuItem({
        id: tabData.key,
        name: newName,
        data: { ...currentFormData, name: newName },
      } as any).catch(() => { /* noop */ })
      // reloadState 后恢复未保存的修改
      form.setFieldsValue(currentFormData)
    }
  }

  const handleTitleCancel = () => {
    setEditingTitle(false)
  }

  const handleFinish = async (values: ApiDetails) => {
    const rawName = values.name?.trim() ?? ''
    const menuName = rawName.length > 0 ? rawName : DEFAULT_NAME

    if (isCreating) {
      // 单一 id 原地翻转：复用当前 tab.key 作为 DB id，入库后清草稿并把页签从「新建」翻转为「已保存」。
      addMenuItem({
        id: tabData.key,
        name: menuName,
        type: createType,
        data: { ...values, name: menuName },
      })
      discardDraft(tabData.key)
      setTabItemStatus({ key: tabData.key }, PageTabStatus.Update)
      setTabItemEditStatus({ key: tabData.key }, 'saved')
      messageApi.success('保存成功')
    }
    else {
      try {
        await updateMenuItem({
          id: tabData.key,
          name: menuName,
          data: { ...values, name: menuName },
        })
        discardDraft(tabData.key)
        setTabItemEditStatus({ key: tabData.key }, 'saved')
        messageApi.success('保存成功')
      }
      catch (err) {
        messageApi.error((err as Error).message || '保存失败，请检查权限')
      }
    }
  }

  const handlePathChange: PathInputProps['onValueChange'] = (pathVal) => {
    if (typeof pathVal === 'string') {
      const regex = /\{+([^{}/]+)\}+/g
      let match: RegExpExecArray | null
      const pathParams: string[] = []

      while ((match = regex.exec(pathVal)) !== null) {
        const param = match[1]

        if (param) {
          pathParams.push(param)
        }
      }

      const oldParameters = form.getFieldValue('parameters') as ApiDetails['parameters']
      const oldPath = oldParameters?.path

      const newPath
        = pathParams.length >= (oldPath?.length ?? 0)
          ? pathParams.reduce(
              (acc, cur, curIdx) => {
                const target = oldPath?.at(curIdx)

                if (target) {
                  acc.splice(curIdx, 1, { ...target, name: cur })
                }
                else {
                  acc.push({
                    id: nanoid(4),
                    name: cur,
                    type: ParamType.String,
                    required: true,
                  })
                }

                return acc
              },
              [...(oldPath ?? [])],
            )
          : oldPath?.slice(0, pathParams.length)

      const newParameters: ApiDetails['parameters'] = { ...oldParameters, path: newPath }

      form.setFieldValue('parameters', newParameters)
    }
  }

  const handleParseQueryParams: PathInputProps['onParseQueryParams'] = (parsedParams) => {
    if (Array.isArray(parsedParams)) {
      type Param = NonNullable<ApiDetails['parameters']>['query']

      const currentParmas = form.getFieldValue(['parameters', 'query']) as Param

      let newQueryParmas: Param = parsedParams

      if (Array.isArray(currentParmas)) {
        newQueryParmas = parsedParams.reduce((acc, item) => {
          const target = acc.find(({ name }) => name === item.name)

          if (!target) {
            acc.push(item)
          }

          return acc
        }, currentParmas)
      }

      form.setFieldValue(['parameters', 'query'], newQueryParmas)

      msgKey.current ??= '__'

      messageApi.info({
        key: msgKey.current,
        content: (
          <span>
            路径中&nbsp;Query&nbsp;参数已自动提取，并填充到下方
            <strong>请求参数</strong>
            的&nbsp;
            <strong>Param</strong>
  &nbsp;中
          </span>
        ),
        duration: 3,
        onClose: () => {
          msgKey.current = undefined
        },
      })
    }
  }

  return (
    <Form<ApiDetails>
      className="flex h-full flex-col"
      form={form}
      onFinish={(values) => {
        handleFinish(values)
      }}
      onValuesChange={() => {
        schedulePersist()
      }}
    >
      {/* 保持 name 字段在表单中注册，确保 onFinish 能读取到 */}
      <Form.Item hidden name="name">
        <Input />
      </Form.Item>

      {/* 标题栏 */}
      <div className="flex items-center gap-2 px-tabContent py-1.5" style={{ borderBottom: '1px solid var(--ant-color-border-secondary)' }}>
        {editingTitle
          ? (
              <>
                <Input
                  autoFocus
                  className="max-w-[300px]"
                  size="small"
                  value={titleDraft}
                  onChange={(e) => { setTitleDraft(e.target.value) }}
                  onPressEnter={() => { void handleTitleConfirm() }}
                />
                <Button size="small" type="primary" onClick={() => { void handleTitleConfirm() }}>确认</Button>
                <Button size="small" onClick={handleTitleCancel}>取消</Button>
              </>
            )
          : (
              <>
                <Typography.Text strong className="text-base">{menuApiName}</Typography.Text>
                <Button
                  icon={<PencilIcon size={14} />}
                  size="small"
                  type="text"
                  onClick={() => { setTitleDraft(menuApiName); setEditingTitle(true) }}
                />
              </>
            )}
      </div>

      <div className="flex items-center px-tabContent py-3">
        <Space.Compact className="flex-1">
          <Form.Item noStyle name="method">
            <Select
              showSearch
              className="min-w-[110px]"
              options={methodOptions}
              popupClassName="!min-w-[120px]"
            />
          </Form.Item>
          <Form.Item noStyle name="path">
            <PathInput
              onParseQueryParams={handleParseQueryParams}
              onValueChange={handlePathChange}
            />
          </Form.Item>
        </Space.Compact>

        <Space className="ml-auto pl-2">
          <Button htmlType="submit" type="primary">
            保存
          </Button>

          {!isCreating && (
            <ApiRemoveButton tabKey={tabData.key} />
          )}
        </Space>
      </div>

      <div className="flex-1 overflow-y-auto p-tabContent">
        <div className="pt-2">
          <BaseFormItems />
        </div>

        <GroupTitle className="mt-2">请求参数</GroupTitle>
        <Form.Item noStyle name="parameters">
          <ParamsTab exampleColumnTitle="示例值" />
        </Form.Item>

        <div className="mt-4">
          <Typography.Text strong className="mb-2 block text-sm">Body</Typography.Text>
          <Form.Item noStyle name="requestBody">
            <ParamsBody />
          </Form.Item>
        </div>

        <GroupTitle className="mb-3 mt-8">返回响应</GroupTitle>
        <Form.Item noStyle name="responses">
          <ResponseTab />
        </Form.Item>
      </div>
    </Form>
  )
}
