import { Button, Tooltip, Space } from 'antd'
import { css } from '@emotion/css'
import {
  Play,
  Square,
  LayoutGrid,
  Undo2,
  Redo2,
  Save,
  Download,
  Upload,
  Trash2,
  ShieldCheck,
} from 'lucide-react'

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
}

// ==================== 样式 ====================

const toolbarClass = css`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-bottom: 1px solid #f0f0f0;
  background: #fff;
`

const dividerClass = css`
  width: 1px;
  height: 20px;
  background: #e5e7eb;
  margin: 0 4px;
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
}: FlowToolbarProps) {
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
              color: '#1f2937',
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
        {/* 执行组 */}
        <Tooltip title="运行">
          <Button
            type="primary"
            size="small"
            icon={<Play size={14} />}
            onClick={onRun}
            disabled={isRunning}
            data-testid="toolbar-run"
          >
            运行
          </Button>
        </Tooltip>
        <Tooltip title="中止">
          <Button
            danger
            size="small"
            icon={<Square size={14} />}
            onClick={onAbort}
            disabled={!isRunning}
            data-testid="toolbar-abort"
          >
            中止
          </Button>
        </Tooltip>
        <Tooltip title="自动布局">
          <Button
            size="small"
            icon={<LayoutGrid size={14} />}
            onClick={onAutoLayout}
            data-testid="toolbar-auto-layout"
          />
        </Tooltip>

        <div className={dividerClass} />

        {/* 历史组 */}
        <Tooltip title="撤销">
          <Button
            size="small"
            icon={<Undo2 size={14} />}
            onClick={onUndo}
            disabled={!canUndo}
            data-testid="toolbar-undo"
          />
        </Tooltip>
        <Tooltip title="重做">
          <Button
            size="small"
            icon={<Redo2 size={14} />}
            onClick={onRedo}
            disabled={!canRedo}
            data-testid="toolbar-redo"
          />
        </Tooltip>
        <Tooltip title={isDirty ? '保存 (Ctrl+S)' : '已保存'}>
          <Button
            size="small"
            type={isDirty ? 'primary' : 'default'}
            icon={<Save size={14} />}
            onClick={onSave}
            disabled={!isDirty}
            data-testid="toolbar-save"
          />
        </Tooltip>

        <div className={dividerClass} />

        {/* 文件组 */}
        <Tooltip title="导出">
          <Button
            size="small"
            icon={<Download size={14} />}
            onClick={onExport}
            data-testid="toolbar-export"
          />
        </Tooltip>
        <Tooltip title="导入">
          <Button
            size="small"
            icon={<Upload size={14} />}
            onClick={onImport}
            data-testid="toolbar-import"
          />
        </Tooltip>
        <Tooltip title="校验流程">
          <Button
            size="small"
            icon={<ShieldCheck size={14} />}
            onClick={onValidate}
            data-testid="toolbar-validate"
          />
        </Tooltip>
        <Tooltip title="清空">
          <Button
            size="small"
            danger
            icon={<Trash2 size={14} />}
            onClick={onClear}
            data-testid="toolbar-clear"
          />
        </Tooltip>
      </Space>
    </div>
  )
}
