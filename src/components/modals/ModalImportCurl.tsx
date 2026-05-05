import { useEffect } from 'react'

import { create, useModal } from '@ebay/nice-modal-react'
import { Form, Input, Modal, type ModalProps, Switch, Typography } from 'antd'

import type { ApiMenuData } from '@/components/ApiMenu'
import { convertCurlToApiMenuItem } from '@/curl-import'
import { useGlobalContext } from '@/contexts/global'
import { useMenuHelpersContext } from '@/contexts/menu-helpers'
import { useMenuTabHelpers } from '@/contexts/menu-tab-settings'

interface ModalImportCurlProps extends Omit<ModalProps, 'open' | 'onOk'> {
  parentId?: string
  onImport?: (menuItem: ApiMenuData) => void
}

interface FormData {
  curlText: string
  ignoreCommonHeaders: boolean
}

export const ModalImportCurl = create(({ parentId, onImport, ...props }: ModalImportCurlProps) => {
  const modal = useModal()
  const [form] = Form.useForm<FormData>()

  const { messageApi } = useGlobalContext()
  const { addMenuItem } = useMenuHelpersContext()
  const { addTabItem } = useMenuTabHelpers()

  useEffect(() => {
    if (modal.visible) {
      form.setFieldsValue({ ignoreCommonHeaders: true })
    }
  }, [form, modal.visible])

  const handleHide = () => {
    form.resetFields()
    void modal.hide()
  }

  const handleImport = () => {
    void form.validateFields().then((values) => {
      try {
        const menuItem = convertCurlToApiMenuItem(values.curlText, {
          ignoreCommonHeaders: values.ignoreCommonHeaders,
          parentId,
        })

        if (onImport) {
          onImport(menuItem)
        }
        else {
          addMenuItem(menuItem)
          addTabItem({
            key: menuItem.id,
            label: menuItem.name,
            contentType: menuItem.type,
          })
        }
      }
      catch (error) {
        messageApi.error(error instanceof Error ? error.message : 'cURL 导入失败')
        return
      }
      handleHide()
    })
  }

  return (
    <Modal
      title="导入 cURL"
      width={560}
      {...props}
      open={modal.visible}
      onCancel={(...params) => {
        props.onCancel?.(...params)
        handleHide()
      }}
      onOk={handleImport}
    >
      <Form<FormData> form={form} layout="vertical">
        <Typography.Paragraph type="secondary">
          粘贴完整 cURL 命令，系统会自动识别 URL、Method、Query、Header、Cookie 和常见 Body。
        </Typography.Paragraph>

        <Form.Item label="粘贴 cURL 数据" name="curlText" rules={[{ required: true, message: '请输入 cURL 命令' }]}>
          <Input.TextArea
            autoSize={{ minRows: 8, maxRows: 12 }}
            placeholder="curl --request GET --url https://api.example.com/users?page=1"
          />
        </Form.Item>

        <Form.Item label="忽略通用 Header" name="ignoreCommonHeaders" valuePropName="checked">
          <Switch />
        </Form.Item>
      </Form>
    </Modal>
  )
})
