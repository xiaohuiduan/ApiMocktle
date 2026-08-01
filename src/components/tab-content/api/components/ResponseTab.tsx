import { useState } from 'react'

import { Button, Form, Popconfirm, Tabs, theme } from 'antd'
import { PlusIcon, TrashIcon } from 'lucide-react'
import { nanoid } from 'nanoid'

import { IconText } from '@/components/IconText'
import { JsonSchemaCard } from '@/components/JsonSchemaCard'
import { ModalNewResponse } from '@/components/tab-content/api/ModalNewResponse'
import { useStyles } from '@/hooks/useStyle'
import { useGlobalContext } from '@/contexts/global'
import type { ApiDetails } from '@/types'

import { css } from '@emotion/css'

function ResponseSchemaEditor({ idx }: { idx: number }) {
  return (
    <Form.Item noStyle shouldUpdate>
      {(form) => {
        const jsonSchema = form.getFieldValue(['responses', idx, 'jsonSchema'])
        return (
          <JsonSchemaCard
            editorProps={{ defaultExpandAll: true }}
            value={jsonSchema}
            onChange={(val) => form.setFieldValue(['responses', idx, 'jsonSchema'], val)}
          />
        )
      }}
    </Form.Item>
  )
}

interface ResponseTabProps {
  value?: ApiDetails['responses']
  onChange?: (value: ResponseTabProps['value']) => void
}

export function ResponseTab(props: ResponseTabProps) {
  const { value, onChange } = props
  const { messageApi } = useGlobalContext()

  const { token } = theme.useToken()

  const { styles } = useStyles(({ token }) => {
    return {
      tabWithBorder: css({
        '.ant-tabs-content-holder': {
          border: `1px solid ${token.colorBorderSecondary}`,
          borderTop: 'none',
          borderBottomLeftRadius: token.borderRadius,
          borderBottomRightRadius: token.borderRadius,
        },
      }),
    }
  })

  const [modalOpen, setModalOpen] = useState(false)
  // 仅用于新增/删除后跳转，不用于初始选中（由 antd 默认行为处理）
  const [activeResTabKey, setActiveResTabKey] = useState<string>()

  return (
    <>
      <Tabs
        activeKey={activeResTabKey}
        animated={false}
        className={styles.tabWithBorder}
        items={value?.map((resp, idx) => {
          const onlyOneRes = value.length === 1

          return {
            key: resp.id,
            label: `${resp.name}(${resp.code})`,
            children: (
              <div className="p-tabContent">
                {!onlyOneRes && (
                  <div className="mb-tabContent flex justify-end">
                    <Popconfirm
                      title={(
                        <span>
                          确定删除？确定后点击右上角
                          <strong>保存</strong>
                          按钮生效
                        </span>
                      )}
                      onConfirm={() => {
                        const newResponses = value.filter((_, i) => i !== idx)
                        onChange?.(newResponses)
                        setActiveResTabKey(newResponses.at(0)?.id)
                        messageApi.info('响应已删除，点击右上角保存后生效')
                      }}
                    >
                      <Button
                        size="small"
                        style={{ color: token.colorTextSecondary }}
                        type="text"
                      >
                        <IconText icon={<TrashIcon size={14} />} />
                      </Button>
                    </Popconfirm>
                  </div>
                )}

                <ResponseSchemaEditor idx={idx} />
              </div>
            ),
          }
        })}
        tabBarExtraContent={(
          <>
            <Button
              icon={<PlusIcon size={16} />}
              type="text"
              onClick={() => {
                setModalOpen(true)
              }}
            >
              添加
            </Button>
          </>
        )}
        type="card"
        onTabClick={(tabKey) => {
          setActiveResTabKey(tabKey)
        }}
      />

      <ModalNewResponse
        open={modalOpen}
        onCancel={() => {
          setModalOpen(false)
        }}
        onFinish={(values) => {
          setModalOpen(false)

          const newResId = nanoid(6)

          onChange?.([...(value ?? []), { ...values, id: newResId }])

          setActiveResTabKey(newResId)
        }}
      />
    </>
  )
}
