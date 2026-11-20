import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Viewer } from '@bytemd/react'
import { Button, Space, theme } from 'antd'
import { nanoid } from 'nanoid'

import { PageTabStatus } from '@/components/ApiTab/ApiTab.enum'
import { useTabContentContext } from '@/components/ApiTab/TabContentContext'
import { InputUnderline } from '@/components/InputUnderline'
import { MarkdownEditor } from '@/components/MarkdownEditor'
import { useGlobalContext } from '@/contexts/global'
import { useMenuHelpersContext } from '@/contexts/menu-helpers'
import { useMenuTabHelpers } from '@/contexts/menu-tab-settings'
import { MenuItemType } from '@/enums'
import { useCtrlSave } from '@/hooks/useCtrlSave'
import { useTabSaveBridge } from '@/hooks/useTabSaveBridge'
import type { ApiDoc } from '@/types'

export function Doc() {
  const { token } = theme.useToken()
  const { t } = useTranslation()

  const { messageApi } = useGlobalContext()
  const { menuRawList, addMenuItem, updateMenuItem } = useMenuHelpersContext()
  const { addTabItem } = useMenuTabHelpers()
  const { tabData } = useTabContentContext()

  const { docValue } = useMemo(() => {
    const apiDocValue = menuRawList?.find(({ id }) => id === tabData.key)?.data as
      | ApiDoc
      | undefined

    return { docValue: apiDocValue }
  }, [menuRawList, tabData.key])

  const [name, setName] = useState<ApiDoc['name']>('')
  const [content, setContent] = useState('')

  useEffect(() => {
    if (docValue) {
      setName(docValue.name)
      setContent(docValue.content ?? '')
    }
  }, [docValue])

  const handleDocSave = () => {
    const values: ApiDoc = { id: nanoid(6), name: name ?? t('api.markdown.defaultName'), content }

    if (isCreating) {
      const menuItemId = nanoid(6)

      addMenuItem({
        id: menuItemId,
        name: name ?? t('api.markdown.defaultName'),
        type: MenuItemType.Doc,
        parentId: tabData.data?.parentId as string | undefined,
        data: values,
      })

      addTabItem(
        {
          key: menuItemId,
          label: name,
          contentType: MenuItemType.Doc,
        },
        { replaceTab: tabData.key },
      )
      messageApi.success(t('api.markdown.saved'))
    }
    else {
      updateMenuItem({
        id: tabData.key,
        name: name,
        data: values,
      })

      messageApi.success(t('api.markdown.saved'))
    }
  }

  useCtrlSave(handleDocSave)
  useTabSaveBridge(tabData.key, handleDocSave)

  const isCreating = tabData.data?.tabStatus === PageTabStatus.Create
  const [editing, setEditing] = useState(isCreating)

  if (editing) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center px-tabContent py-2" style={{ gap: `${token.padding}px` }}>
          <InputUnderline
            placeholder={t('api.markdown.defaultName')}
            style={{ fontWeight: 'bold', fontSize: '18px' }}
            value={name ?? ''}
            onChange={(ev) => {
              setName(ev.target.value)
            }}
          />

          <Space>
            {!isCreating && (
              <Button
                onClick={() => {
                  setEditing(false)
                }}
              >
                {t('api.markdown.exitEditing')}
              </Button>
            )}

            <Button type="primary" onClick={handleDocSave}>{t('common.save')}</Button>
          </Space>
        </div>

        <div className="flex-1 overflow-y-auto">
          <MarkdownEditor
            value={content}
            onChange={(v) => {
              setContent(v)
            }}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center px-tabContent py-2">
        <div className="flex-1 text-lg font-bold">{docValue?.name}</div>

        <Button
          onClick={() => {
            setEditing(true)
          }}
        >
          {t('common.edit')}
        </Button>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="mx-auto" style={{ maxWidth: '1512px', padding: `${token.padding}px` }}>
          <Viewer value={docValue?.content ?? ''} />
        </div>
      </div>
    </div>
  )
}
