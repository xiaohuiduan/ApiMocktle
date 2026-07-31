import { useState } from 'react'

import { Badge, Button, Empty, Popover, Table, Tag, Tooltip, Typography, theme } from 'antd'
import { VariableIcon, Trash2Icon, DatabaseIcon } from 'lucide-react'

import { useSessionVariablesContext } from '@/contexts/session-variables'
import { useMenuHelpersContext } from '@/contexts/menu-helpers'

export function SessionVariablesPanel() {
  const { token } = theme.useToken()
  const { sessionVars, removeSessionVar, clearSessionVars } = useSessionVariablesContext()
  const { projectEnvironmentConfig, currentProjectEnvironmentId } = useMenuHelpersContext()
  const [open, setOpen] = useState(false)

  const sessionEntries = Object.entries(sessionVars)
  const sessionCount = sessionEntries.length

  // 当前环境变量
  const currentEnv = projectEnvironmentConfig?.environments?.find(e => e.id === currentProjectEnvironmentId)
  const envVars = currentEnv?.variables?.filter(v => v.name && v.enable !== false) ?? []
  const globalVars = (projectEnvironmentConfig?.globalVariables ?? []).filter(v => v.name && v.enable !== false)

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
          type="text"
          size="small"
          icon={<Trash2Icon size={12} />}
          onClick={() => removeSessionVar(record.name)}
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
    <div className="w-[380px] max-h-[500px] overflow-auto">
      {/* 会话变量 */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-2">
          <Typography.Text strong className="text-sm">
            会话变量
            <Tag color="blue" className="ml-1">脚本设置</Tag>
          </Typography.Text>
          {sessionCount > 0 && (
            <Button size="small" type="text" danger onClick={clearSessionVars}>
              清空
            </Button>
          )}
        </div>
        {sessionCount > 0 ? (
          <Table
            size="small"
            columns={sessionColumns}
            dataSource={sessionEntries.map(([name, value]) => ({ name, value, key: name }))}
            pagination={false}
            scroll={{ y: 150 }}
          />
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无会话变量" />
        )}
      </div>

      {/* 环境变量 */}
      <div className="mb-3">
        <Typography.Text strong className="text-sm mb-2 block">
          <DatabaseIcon size={12} className="inline mr-1" />
          环境变量
          {currentEnv && <Tag className="ml-1">{currentEnv.name}</Tag>}
        </Typography.Text>
        {envVars.length > 0 ? (
          <Table
            size="small"
            columns={envColumns}
            dataSource={envVars.map(v => ({ name: v.name, value: v.value, key: v.id }))}
            pagination={false}
            scroll={{ y: 120 }}
          />
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无环境变量" className="py-2" />
        )}
      </div>

      {/* 全局变量 */}
      <div>
        <Typography.Text strong className="text-sm mb-2 block">
          <DatabaseIcon size={12} className="inline mr-1" />
          全局变量
        </Typography.Text>
        {globalVars.length > 0 ? (
          <Table
            size="small"
            columns={envColumns}
            dataSource={globalVars.map(v => ({ name: v.name, value: v.value, key: v.id }))}
            pagination={false}
            scroll={{ y: 120 }}
          />
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无全局变量" className="py-2" />
        )}
      </div>
    </div>
  )

  return (
    <div
      className="fixed z-50"
      style={{ left: 92, bottom: 20 }}
    >
      <Popover
        content={content}
        title="变量管理"
        trigger="click"
        open={open}
        onOpenChange={setOpen}
        placement="topLeft"
      >
        <Tooltip title="查看变量" placement="right">
          <Badge count={sessionCount} size="small" offset={[-4, 4]}>
            <Button
              type="primary"
              shape="circle"
              icon={<VariableIcon size={18} />}
              size="large"
              style={{
                boxShadow: token.boxShadowSecondary,
              }}
            />
          </Badge>
        </Tooltip>
      </Popover>
    </div>
  )
}
