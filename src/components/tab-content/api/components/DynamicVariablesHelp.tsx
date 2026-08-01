import { useState } from 'react'

import { Modal, Table, Tooltip, Typography, theme } from 'antd'
import { HelpCircleIcon } from 'lucide-react'

import { DYNAMIC_VARIABLE_DEFS } from '@/utils/dynamic-variables'

/**
 * 动态变量说明入口：? 图标 + 说明弹窗。
 * 展示内置动态变量表与 {{变量名}} 语法说明，供运行页 Body/Params 区域复用。
 */
export function DynamicVariablesHelp() {
  const { token } = theme.useToken()
  const [open, setOpen] = useState(false)

  return (
    <>
      <Tooltip title="变量使用说明">
        <span
          className="inline-flex cursor-pointer items-center"
          style={{ color: token.colorTextTertiary }}
          onClick={(e) => {
            e.stopPropagation()
            setOpen(true)
          }}
          aria-label="变量使用说明"
        >
          <HelpCircleIcon size={14} />
        </span>
      </Tooltip>

      <Modal
        title="变量使用说明"
        open={open}
        footer={null}
        width={640}
        onCancel={() => {
          setOpen(false)
        }}
      >
        <Typography.Paragraph type="secondary" className="!mb-3">
          在请求参数、Header、Body 中输入 <Typography.Text code>{'{{'}</Typography.Text>
          {' '}
          即可触发自动补全；内置动态变量每次请求时重新生成，无需定义。
        </Typography.Paragraph>

        <Table
          size="small"
          rowKey="name"
          pagination={false}
          dataSource={DYNAMIC_VARIABLE_DEFS}
          columns={[
            {
              title: '动态变量',
              dataIndex: 'name',
              width: 170,
              render: (name: string) => <Typography.Text code>{`{{${name}}}`}</Typography.Text>,
            },
            {
              title: '说明',
              dataIndex: 'desc',
              width: 220,
            },
            {
              title: '示例',
              dataIndex: 'example',
              render: (example: string) => (
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {example}
                </Typography.Text>
              ),
            },
          ]}
        />

        <div
          className="mt-4 rounded-lg p-3"
          style={{ backgroundColor: token.colorFillQuaternary }}
        >
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            此外，
            <Typography.Text code>{'{{变量名}}'}</Typography.Text>
            可引用环境/全局/会话中已定义的变量（优先级：会话变量 &gt; 环境变量 &gt; 全局变量），在输入框输入
            <Typography.Text code>{'{{'}</Typography.Text>
            {' '}
            时同样会出现在补全列表（带当前值）。
          </Typography.Text>
        </div>
      </Modal>
    </>
  )
}
