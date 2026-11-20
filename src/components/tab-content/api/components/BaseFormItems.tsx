import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Col, Form, Row, Select, type SelectProps } from 'antd'
import useResizeObserver from 'use-resize-observer'

import { InputDesc } from '@/components/tab-content/api/components/InputDesc'
import { API_STATUS_CONFIG } from '@/configs/static'
import { translateKey } from '@/i18n/translate'

/**
 * 接口状态下拉选项。
 *
 * 函数化而非模块顶层常量：文案随语言变化，模块顶层只会求值一次。
 */
function createStatusOptions(): SelectProps['options'] {
  return Object.entries(API_STATUS_CONFIG).map(
    ([status, { textKey, color }]) => {
      return {
        value: status,
        label: (
          <span className="flex items-center">
            <span
              className="mr-2 inline-block size-[6px] rounded-full"
              style={{ backgroundColor: `var(${color})` }}
            />
            <span>{translateKey(textKey)}</span>
          </span>
        ),
      }
    },
  )
}

export function BaseFormItems() {
  const { t } = useTranslation()
  const [containerSize, setContainerSize] = useState<'xs' | 'sm' | 'md' | 'lg'>()

  // t 作为依赖：语言切换时重新生成选项
  const statusOptions = useMemo(() => createStatusOptions(), [t])

  const { ref } = useResizeObserver<HTMLDivElement>({
    onResize: ({ width }) => {
      if (typeof width === 'number') {
        if (width >= 1000) {
          if (containerSize !== 'lg') {
            setContainerSize('lg')
          }
        }
        else if (width >= 700) {
          if (containerSize !== 'md') {
            setContainerSize('md')
          }
        }
        else if (width >= 500) {
          if (containerSize !== 'sm') {
            setContainerSize('sm')
          }
        }
        else {
          setContainerSize('xs')
        }
      }
    },
  })

  const colSpan
    = containerSize === 'lg' || containerSize === 'md' ? 6 : containerSize === 'sm' ? 12 : 24

  return (
    <div ref={ref}>
      <Row gutter={16}>
        <Col span={colSpan}>
          <Form.Item
            label={t('api.field.status')}
            labelCol={{ span: 24 }}
            name="status"
            rules={[{ required: true }]}
          >
            <Select options={statusOptions} />
          </Form.Item>
        </Col>

        <Col span={colSpan}>
          <Form.Item label={t('api.field.tags')} labelCol={{ span: 24 }} name="tags">
            <Select mode="tags" placeholder={t('api.field.tagsPlaceholder')} />
          </Form.Item>
        </Col>

        <Col span={24}>
          <Form.Item label={t('api.field.description')} labelCol={{ span: 24 }} name="description">
            <InputDesc />
          </Form.Item>
        </Col>
        {' '}

      </Row>
    </div>
  )
}
