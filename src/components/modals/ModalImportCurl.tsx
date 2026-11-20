import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import { create, useModal } from '@ebay/nice-modal-react'
import { Form, Input, Modal, type ModalProps, Switch, Typography } from 'antd'

import type { ApiMenuData } from '@/components/ApiMenu'
import { useGlobalContext } from '@/contexts/global'
import { convertCurlToApiMenuItem } from '@/curl-import'

interface ModalImportCurlProps extends Omit<ModalProps, 'open' | 'onOk'> {
  parentId?: string
  onImport: (menuItem: ApiMenuData) => void
}

interface FormData {
  curlText: string
  ignoreCommonHeaders: boolean
}

export const ModalImportCurl = create(({ parentId, onImport, ...props }: ModalImportCurlProps) => {
  const { t } = useTranslation()
  const modal = useModal()
  const [form] = Form.useForm<FormData>()

  const { messageApi } = useGlobalContext()

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

        onImport(menuItem)
      }
      catch (error) {
        messageApi.error(error instanceof Error ? error.message : t('settings.modal.importCurl.failed'))

        return
      }

      handleHide()
    })
  }

  return (
    <Modal
      title={t('settings.modal.importCurl.title')}
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
          {t('settings.modal.importCurl.description')}
        </Typography.Paragraph>

        <Form.Item
          label={t('settings.modal.importCurl.pasteLabel')}
          name="curlText"
          rules={[{ required: true, message: t('settings.modal.importCurl.pasteRequired') }]}
        >
          <Input.TextArea
            autoSize={{ minRows: 8, maxRows: 12 }}
            placeholder="curl --request GET --url https://api.example.com/users?page=1"
          />
        </Form.Item>

        <Form.Item label={t('settings.modal.importCurl.ignoreCommonHeaders')} name="ignoreCommonHeaders" valuePropName="checked">
          <Switch />
        </Form.Item>
      </Form>
    </Modal>
  )
})
