import { useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { Button, Form, Input } from 'antd'

import { useTabContentContext } from '@/components/ApiTab/TabContentContext'
import { SelectorCatalog } from '@/components/SelectorCatalog'
import { ROOT_CATALOG } from '@/configs/static'
import { useMenuHelpersContext } from '@/contexts/menu-helpers'
import { MenuItemType } from '@/enums'
import { useCtrlSave } from '@/hooks/useCtrlSave'
import { useTabSaveBridge } from '@/hooks/useTabSaveBridge'
import type { ApiFolder } from '@/types'

export function FolderSetting() {
  const { t } = useTranslation()
  const { menuRawList, updateMenuItem } = useMenuHelpersContext()
  const { tabData } = useTabContentContext()

  const [form] = Form.useForm<ApiFolder>()

  useCtrlSave(() => { form.submit() })
  useTabSaveBridge(tabData.key, () => { form.submit() })

  const apiFolder = useMemo(() => {
    if (menuRawList) {
      return menuRawList.find(({ id }) => id === tabData.key)
    }
  }, [menuRawList, tabData.key])

  useEffect(() => {
    if (apiFolder && apiFolder.type === MenuItemType.ApiDetailFolder) {
      form.setFieldsValue({
        name: apiFolder.name,
        parentId: apiFolder.parentId ?? ROOT_CATALOG,
      })
    }
  }, [form, apiFolder])

  return (
    <div className="max-w-2xl">
      <Form
        colon={false}
        form={form}
        labelCol={{ span: 6 }}
        onFinish={(values) => {
          if (apiFolder) {
            updateMenuItem({ ...values, id: apiFolder.id })
          }
        }}
      >
        <Form.Item
          label={t('api.folder.name')}
          name="name"
          rules={[{ required: true, message: t('api.folder.nameRequired') }]}
        >
          <Input />
        </Form.Item>

        <Form.Item label={t('api.folder.parent')} name="parentId" required={false} rules={[{ required: true }]}>
          <SelectorCatalog
            exclued={apiFolder?.id ? [apiFolder.id] : undefined}
            type={MenuItemType.ApiDetailFolder}
          />
        </Form.Item>

        <Form.Item wrapperCol={{ offset: 6 }}>
          <Button htmlType="submit" type="primary">
            {t('common.save')}
          </Button>
        </Form.Item>
      </Form>
    </div>
  )
}
