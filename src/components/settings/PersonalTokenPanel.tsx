import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { invoke } from '@tauri-apps/api/core'
import { Button, Form, Input, List, message, Popconfirm, Space, Typography } from 'antd'
import { CopyIcon, TrashIcon } from 'lucide-react'

import { api } from '@/api-client'
import { useAuth } from '@/contexts/auth'

interface PersonalToken {
  id: string
  token: string
  name: string
  createdAt: string
}

export function PersonalTokenPanel() {
  const { t } = useTranslation()
  const { sessionId } = useAuth()
  const [tokens, setTokens] = useState<PersonalToken[]>([])
  const [loadingTokens, setLoadingTokens] = useState(false)
  const [yapiPort, setYapiPort] = useState<number>(0)

  const loadTokens = useCallback(async () => {
    if (!sessionId) { return }

    setLoadingTokens(true)

    try {
      setTokens(await api<PersonalToken[]>('list_personal_tokens', { sessionId }))
    }
    catch {
      // ignore
    }
    finally {
      setLoadingTokens(false)
    }
  }, [sessionId])

  useEffect(() => {
    void loadTokens()
    void invoke<number>('get_yapi_port').then(setYapiPort).catch(() => undefined)
  }, [loadTokens])

  const handleCreateToken = async (values: { name: string }) => {
    if (!sessionId) { return }

    try {
      await api('create_personal_token', { sessionId, name: values.name })
      message.success(t('settings.token.created'))
      await loadTokens()
    }
    catch (err) {
      message.error((err as Error).message)
    }
  }

  const handleDeleteToken = async (tokenId: string) => {
    if (!sessionId) { return }

    try {
      await api('delete_personal_token', { sessionId, tokenId })
      message.success(t('settings.action.deleted'))
      await loadTokens()
    }
    catch (err) {
      message.error((err as Error).message)
    }
  }

  return (
    <div>
      {yapiPort > 0 && (
        <Typography.Paragraph
          className="mb-3"
          copyable={{ text: `http://127.0.0.1:${yapiPort}` }}
          type="secondary"
        >
          {t('settings.token.serviceAddress', { port: yapiPort })}
        </Typography.Paragraph>
      )}

      <Form
        className="mb-4"
        layout="inline"
        onFinish={(values) => void handleCreateToken(values)}
      >
        <Form.Item name="name" rules={[{ required: true, message: t('settings.token.nameRequired') }]}>
          <Input placeholder={t('settings.token.namePlaceholder')} style={{ width: 200 }} />
        </Form.Item>
        <Form.Item>
          <Button htmlType="submit" type="primary">{t('settings.action.create')}</Button>
        </Form.Item>
        <Form.Item>
          <Button onClick={() => void loadTokens()}>{t('common.refresh')}</Button>
        </Form.Item>
      </Form>

      <List
        dataSource={tokens}
        loading={loadingTokens}
        locale={{ emptyText: t('settings.token.empty') }}
        renderItem={(item) => (
          <List.Item
            actions={[
              <Popconfirm
                key="del"
                title={t('settings.token.confirmDelete')}
                onConfirm={() => void handleDeleteToken(item.id)}
              >
                <Button danger icon={<TrashIcon size={14} />} size="small" type="text" />
              </Popconfirm>,
            ]}
          >
            <List.Item.Meta
              description={(
                <Space>
                  <Typography.Text code>{item.token}</Typography.Text>
                  <Button
                    icon={<CopyIcon size={12} />}
                    size="small"
                    type="text"
                    onClick={() => {
                      void navigator.clipboard.writeText(item.token).then(() => message.success(t('common.copied')))
                    }}
                  />
                </Space>
              )}
              title={item.name}
            />
          </List.Item>
        )}
      />
    </div>
  )
}
