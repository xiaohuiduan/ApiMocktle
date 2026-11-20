import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Modal, Table, theme, Tooltip, Typography } from 'antd'
import { HelpCircleIcon } from 'lucide-react'

import { useDynamicVariableDefs } from '@/hooks/useDynamicVariableDefs'

/**
 * 动态变量说明入口：? 图标 + 说明弹窗。
 * 展示内置动态变量表与 {{变量名}} 语法说明，供运行页 Body/Params 区域复用。
 */
export function DynamicVariablesHelp() {
  const { token } = theme.useToken()
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const dynamicDefs = useDynamicVariableDefs()

  return (
    <>
      <Tooltip title={t('api.variableHelp.title')}>
        <span
          aria-label={t('api.variableHelp.title')}
          className="inline-flex cursor-pointer items-center"
          style={{ color: token.colorTextTertiary }}
          onClick={(e) => {
            e.stopPropagation()
            setOpen(true)
          }}
        >
          <HelpCircleIcon size={14} />
        </span>
      </Tooltip>

      <Modal
        footer={null}
        open={open}
        title={t('api.variableHelp.title')}
        width={640}
        onCancel={() => {
          setOpen(false)
        }}
      >
        <Typography.Paragraph className="!mb-3" type="secondary">
          {t('api.variableHelp.introPrefix')}
          {' '}
          <Typography.Text code>{'{{'}</Typography.Text>
          {' '}
          {t('api.variableHelp.introSuffix')}
        </Typography.Paragraph>

        <Table
          columns={[
            {
              title: t('api.variableHelp.columnName'),
              dataIndex: 'name',
              width: 170,
              render: (name: string) => <Typography.Text code>{`{{${name}}}`}</Typography.Text>,
            },
            {
              title: t('common.description'),
              dataIndex: 'desc',
              width: 220,
            },
            {
              title: t('api.variableHelp.columnExample'),
              dataIndex: 'example',
              render: (example: string) => (
                <Typography.Text style={{ fontSize: 12 }} type="secondary">
                  {example}
                </Typography.Text>
              ),
            },
          ]}
          dataSource={dynamicDefs}
          pagination={false}
          rowKey="name"
          size="small"
        />

        <div
          className="mt-4 rounded-lg p-3"
          style={{ backgroundColor: token.colorFillQuaternary }}
        >
          <Typography.Text style={{ fontSize: 12 }} type="secondary">
            {t('api.variableHelp.morePrefix')}
            <Typography.Text code>{t('api.variableHelp.syntaxExample')}</Typography.Text>
            {t('api.variableHelp.moreMiddle')}
            <Typography.Text code>{'{{'}</Typography.Text>
            {' '}
            {t('api.variableHelp.moreSuffix')}
          </Typography.Text>
        </div>
      </Modal>
    </>
  )
}
