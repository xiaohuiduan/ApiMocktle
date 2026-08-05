import { Button, Divider, Popconfirm, Popover, Select, Space, Tooltip } from 'antd'
import {
  Download,
  LayoutGrid,
  MoreHorizontal,
  Play,
  Redo2,
  Save,
  ShieldCheck,
  Square,
  Trash2,
  Undo2,
  Upload,
} from 'lucide-react'

import { css } from '@emotion/css'

// ==================== Props ====================

export interface FlowToolbarProps {
  taskName?: string
  onRun: () => void
  onAbort: () => void
  onAutoLayout: () => void
  onUndo: () => void
  onRedo: () => void
  onSave: () => void
  onExport: () => void
  onImport: () => void
  onValidate: () => void
  onClear: () => void
  canUndo: boolean
  canRedo: boolean
  isRunning: boolean
  isDirty: boolean
  /** 保存进行中（按钮 loading 态） */
  isSaving?: boolean
  // Mock Agent 地址
  agentUrl: string
  onAgentUrlChange: (url: string) => void
  // 可选的环境列表（用户从系统环境配置中手动粘贴 Agent URL，不依赖环境选择）
  environments?: { name: string, agentUrl?: string }[]
}

// ==================== 样式 ====================

const toolbarClass = css`
  display: flex;
  align-items: center;
  gap: var(--ds-gap-sm);
  padding: var(--ds-toolbar-pad-y) var(--ds-toolbar-pad-x);
  border-bottom: var(--ds-toolbar-border, 1px solid #f0f0f0);
  background: var(--ds-toolbar-bg);
`

const dividerClass = css`
  width: 1px;
  height: 20px;
  background: var(--ds-divider-color);
  margin: 0 var(--ds-pad-xs);
`

const popoverPanelClass = css`
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 300px;
`

// ==================== 组件 ====================

export default function FlowToolbar({
  taskName,
  onRun,
  onAbort,
  onAutoLayout,
  onUndo,
  onRedo,
  onSave,
  onExport,
  onImport,
  onValidate,
  onClear,
  canUndo,
  canRedo,
  isRunning,
  isDirty,
  isSaving = false,
  agentUrl,
  onAgentUrlChange,
  environments = [],
}: FlowToolbarProps) {
  // 从环境列表提取有 agentUrl 的地址，供快速选择
  const agentUrlOptions = environments
    .filter((e) => e.agentUrl)
    .map((e) => ({
      value: e.agentUrl!,
      label: `${e.name} (${e.agentUrl})`,
    }))

  return (
    <div className={toolbarClass} data-testid="flow-toolbar">
      {taskName && (
        <Tooltip title={taskName}>
          <span
            style={{
              maxWidth: 200,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontWeight: 600,
              fontSize: 14,
              color: 'var(--ds-node-text-primary)',
              marginRight: 4,
              flexShrink: 0,
            }}
          >
            {taskName}
          </span>
        </Tooltip>
      )}
      <div className={dividerClass} />
      <Space size={4}>
        {/* 主操作：运行 / 中止 / 保存 */}
        <Tooltip title="运行">
          <Button
            data-testid="toolbar-run"
            disabled={isRunning}
            icon={<Play size={14} />}
            size="small"
            type="primary"
            onClick={onRun}
          >
            运行
          </Button>
        </Tooltip>
        <Tooltip title="中止">
          <Button
            danger
            data-testid="toolbar-abort"
            disabled={!isRunning}
            icon={<Square size={14} />}
            size="small"
            onClick={onAbort}
          >
            中止
          </Button>
        </Tooltip>
        <div className={dividerClass} />
        <Tooltip title={isDirty ? '保存 (Ctrl+S)' : '已保存'}>
          <Button
            data-testid="toolbar-save"
            disabled={!isDirty}
            icon={<Save size={14} />}
            loading={isSaving}
            size="small"
            type={isDirty ? 'primary' : 'default'}
            onClick={onSave}
          />
        </Tooltip>
      </Space>

      {/* 右侧：更多操作（高级功能收进弹出层） */}
      <div style={{ flex: 1 }} />
      <Popover
        placement="bottomRight"
        trigger="click"
        content={(
          <div className={popoverPanelClass}>
            <Space size={4} wrap>
              <Tooltip title="撤销">
                <Button
                  data-testid="toolbar-undo"
                  disabled={!canUndo}
                  icon={<Undo2 size={14} />}
                  size="small"
                  onClick={onUndo}
                />
              </Tooltip>
              <Tooltip title="重做">
                <Button
                  data-testid="toolbar-redo"
                  disabled={!canRedo}
                  icon={<Redo2 size={14} />}
                  size="small"
                  onClick={onRedo}
                />
              </Tooltip>
              <Tooltip title="自动布局">
                <Button
                  data-testid="toolbar-auto-layout"
                  icon={<LayoutGrid size={14} />}
                  size="small"
                  onClick={onAutoLayout}
                />
              </Tooltip>
              <Tooltip title="校验流程">
                <Button
                  data-testid="toolbar-validate"
                  icon={<ShieldCheck size={14} />}
                  size="small"
                  onClick={onValidate}
                />
              </Tooltip>
              <Tooltip title="导出">
                <Button
                  data-testid="toolbar-export"
                  icon={<Download size={14} />}
                  size="small"
                  onClick={onExport}
                />
              </Tooltip>
              <Tooltip title="导入">
                <Button
                  data-testid="toolbar-import"
                  icon={<Upload size={14} />}
                  size="small"
                  onClick={onImport}
                />
              </Tooltip>
              <Tooltip title="清空画布">
                <Popconfirm
                  cancelText="取消"
                  description="将删除所有节点和连线，且不可撤销。确定清空？"
                  okButtonProps={{ danger: true }}
                  okText="清空"
                  title="清空画布"
                  onConfirm={onClear}
                >
                  <Button
                    danger
                    data-testid="toolbar-clear"
                    icon={<Trash2 size={14} />}
                    size="small"
                  />
                </Popconfirm>
              </Tooltip>
            </Space>
            <Divider style={{ margin: 0 }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--ds-node-text-secondary)', whiteSpace: 'nowrap' }}>
                Mock Agent 地址
              </span>
              <Select
                allowClear
                options={agentUrlOptions}
                placeholder="选择或粘贴 Agent 地址"
                size="small"
                style={{ minWidth: 180, flex: 1 }}
                value={agentUrl || undefined}
                onChange={onAgentUrlChange}
              />
            </div>
          </div>
        )}
      >
        <Button data-testid="toolbar-more" icon={<MoreHorizontal size={14} />}>
          更多
        </Button>
      </Popover>
    </div>
  )
}
