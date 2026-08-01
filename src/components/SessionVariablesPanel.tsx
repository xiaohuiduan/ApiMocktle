import { useState } from 'react'

import { Badge, Button, Empty, Popover, Table, Tag, theme, Tooltip, Typography } from 'antd'
import { DatabaseIcon, Trash2Icon, VariableIcon } from 'lucide-react'

import { useMenuHelpersContext } from '@/contexts/menu-helpers'
import { useSessionVariablesContext } from '@/contexts/session-variables'

export function SessionVariablesPanel() {
  const { token } = theme.useToken()
  const { sessionVars, removeSessionVar, clearSessionVars } = useSessionVariablesContext()
  const { projectEnvironmentConfig, currentProjectEnvironmentId } = useMenuHelpersContext()
  const [open, setOpen] = useState(false)

  const sessionEntries = Object.entries(sessionVars)
  const sessionCount = sessionEntries.length

  // 当前环境变量
  const currentEnv = projectEnvironmentConfig?.environments?.find((e) => e.id === currentProjectEnvironmentId)
  const envVars = currentEnv?.variables?.filter((v) => v.name && v.enable !== false) ?? []
  const globalVars = (projectEnvironmentConfig?.globalVariables ?? []).filter((v) => v.name && v.enable !== false)

  const sessionColumns = [
    {
      title: '变量名',
      dataIndex: 'name',
      key: 'name',
      render: (name: string) => <code className="text-xs">{name}</code>,
    },
    {
      title: '值',
      dataIndex: 'value',
      key: 'value',
      ellipsis: true,
      render: (value: string) => <span className="text-xs opacity-70">{value}</span>,
    },
    {
      title: '',
      key: 'action',
      width: 32,
      render: (_: unknown, record: { name: string }) => (
        <Button
          icon={<Trash2Icon size={12} />}
          size="small"
          type="text"
          onClick={() => { removeSessionVar(record.name) }}
        />
      ),
    },
  ]

  const envColumns = [
    {
      title: '变量名',
      dataIndex: 'name',
      key: 'name',
      render: (name: string) => <code className="text-xs">{name}</code>,
    },
    {
      title: '值',
      dataIndex: 'value',
      key: 'value',
      ellipsis: true,
      render: (value: string) => <span className="text-xs opacity-70">{value}</span>,
    },
  ]

  const content = (
    <div className="max-h-[500px] w-[380px] overflow-auto">
      {/* 会话变量 */}
      <div className="mb-3">
        <div className="mb-2 flex items-center justify-between">
          <Typography.Text strong className="text-sm">
            会话变量
            <Tag className="ml-1" color="blue">脚本设置</Tag>
          </Typography.Text>
          {sessionCount > 0 && (
            <Button danger size="small" type="text" onClick={clearSessionVars}>
              清空
            </Button>
          )}
        </div>
        {sessionCount > 0
          ? (
              <Table
                columns={sessionColumns}
                dataSource={sessionEntries.map(([name, value]) => ({ name, value, key: name }))}
                pagination={false}
                scroll={{ y: 150 }}
                size="small"
              />
            )
          : (
              <Empty description="暂无会话变量" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            )}
      </div>

      {/* 环境变量 */}
      <div className="mb-3">
        <Typography.Text strong className="mb-2 block text-sm">
          <DatabaseIcon className="mr-1 inline" size={12} />
          环境变量
          {currentEnv && <Tag className="ml-1">{currentEnv.name}</Tag>}
        </Typography.Text>
        {envVars.length > 0
          ? (
              <Table
                columns={envColumns}
                dataSource={envVars.map((v) => ({ name: v.name, value: v.value, key: v.id }))}
                pagination={false}
                scroll={{ y: 120 }}
                size="small"
              />
            )
          : (
              <Empty className="py-2" description="暂无环境变量" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            )}
      </div>

      {/* 全局变量 */}
      <div>
        <Typography.Text strong className="mb-2 block text-sm">
          <DatabaseIcon className="mr-1 inline" size={12} />
          全局变量
        </Typography.Text>
        {globalVars.length > 0
          ? (
              <Table
                columns={envColumns}
                dataSource={globalVars.map((v) => ({ name: v.name, value: v.value, key: v.id }))}
                pagination={false}
                scroll={{ y: 120 }}
                size="small"
              />
            )
          : (
              <Empty className="py-2" description="暂无全局变量" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            )}
      </div>
    </div>
  )

  return (
    <div>
      <Popover
        content={content}
        open={open}
        placement="right"
        title="变量管理"
        trigger="click"
        onOpenChange={setOpen}
      >
        <Tooltip placement="right" title="查看变量">
          <Badge count={sessionCount} offset={[-4, 4]} size="small">
            <Button
              icon={<VariableIcon size={18} />}
              shape="circle"
              size="large"
              style={{
                boxShadow: token.boxShadowSecondary,
              }}
              type="primary"
            />
          </Badge>
        </Tooltip>
      </Popover>
    </div>
  )
}
