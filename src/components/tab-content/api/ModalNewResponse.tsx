import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { Form, Input, Modal, type ModalProps, Select, type SelectProps } from 'antd'

import { SchemaType } from '@/components/JsonSchema'
import { HTTP_CODE_CONFIG } from '@/configs/static'
import { ContentType } from '@/enums'
import { translateKey } from '@/i18n/translate'
import type { ApiDetailsResponse } from '@/types'

/**
 * HTTP 状态码下拉选项。
 *
 * 必须是函数而非模块顶层常量：文案要随语言变化，模块顶层只会在加载时求值一次，
 * 切换语言后永不刷新。
 */
export function createHttpCodeOptions(): SelectProps['options'] {
  return Object.entries(HTTP_CODE_CONFIG).map(([, { textKey, descKey, value }]) => {
    return {
      label: value,
      value,
      text: translateKey(textKey),
      desc: translateKey(descKey),
    }
  })
}

/** 组件内使用的状态码选项（随语言变化重新计算）。 */
export function useHttpCodeOptions(): SelectProps['options'] {
  const { t } = useTranslation()

  // t 作为依赖：语言切换时 t 引用变化，触发重算
  return useMemo(() => createHttpCodeOptions(), [t])
}

export const contentTypeOptions: SelectProps['options'] = [
  { label: 'JSON', value: ContentType.JSON },
  { label: 'XML', value: ContentType.XML },
  { label: 'HTML', value: ContentType.HTML },
  { label: 'Raw', value: ContentType.Raw },
  { label: 'Binary', value: ContentType.Binary },
]

type FormData = Pick<ApiDetailsResponse, 'name' | 'code' | 'contentType' | 'jsonSchema'>

interface ModalNewResponseProps extends ModalProps {
  onFinish?: (data: FormData) => void
}

export function ModalNewResponse(props: ModalNewResponseProps) {
  const { onFinish, ...rest } = props
  const { t } = useTranslation()
  const httpCodeOptions = useHttpCodeOptions()

  const [form] = Form.useForm<FormData>()

  return (
    <Modal
      {...rest}
      title={t('api.response.addTitle')}
      onOk={() => {
        void form.validateFields().then((values) => {
          onFinish?.(values)
        })
      }}
    >
      <Form<FormData>
        form={form}
        initialValues={{
          name: t('api.response.defaultName'),
          code: 200,
          contentType: ContentType.JSON,
          jsonSchema: {
            type: SchemaType.Object,
            properties: [],
          },
        }}
        layout="vertical"
      >
        <Form.Item label={t('api.response.name')} name="name" rules={[{ required: true }]}>
          <Input />
        </Form.Item>

        <Form.Item label={t('api.response.statusCode')} name="code" rules={[{ required: true }]}>
          <Select options={httpCodeOptions} />
        </Form.Item>

        <Form.Item label={t('api.response.contentType')} name="contentType">
          <Select options={contentTypeOptions} />
        </Form.Item>

        <Form.Item hidden name="jsonSchema">
          <Input />
        </Form.Item>
      </Form>
    </Modal>
  )
}
