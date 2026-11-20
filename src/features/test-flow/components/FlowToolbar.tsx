import { useTranslation } from 'react-i18next'

import { Button, Popconfirm, Select, Space, Tooltip } from 'antd'
import {
  Download,
  LayoutGrid,
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
  const { t } = useTranslation()

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
        {/* 执行组 */}
        <Tooltip title={t('flow.toolbar.run')}>
          <Button
            data-testid="toolbar-run"
            disabled={isRunning}
            icon={<Play size={14} />}
            size="small"
            type="primary"
            onClick={onRun}
          >
            {t('flow.toolbar.run')}
          </Button>
        </Tooltip>
        <Tooltip title={t('flow.toolbar.abort')}>
          <Button
            danger
            data-testid="toolbar-abort"
            disabled={!isRunning}
            icon={<Square size={14} />}
            size="small"
            onClick={onAbort}
          >
            {t('flow.toolbar.abort')}
          </Button>
        </Tooltip>
        <Tooltip title={t('flow.toolbar.autoLayout')}>
          <Button
            data-testid="toolbar-auto-layout"
            icon={<LayoutGrid size={14} />}
            size="small"
            onClick={onAutoLayout}
          />
        </Tooltip>

        <div className={dividerClass} />

        {/* 历史组 */}
        <Tooltip title={t('flow.toolbar.undo')}>
          <Button
            data-testid="toolbar-undo"
            disabled={!canUndo}
            icon={<Undo2 size={14} />}
            size="small"
            onClick={onUndo}
          />
        </Tooltip>
        <Tooltip title={t('flow.toolbar.redo')}>
          <Button
            data-testid="toolbar-redo"
            disabled={!canRedo}
            icon={<Redo2 size={14} />}
            size="small"
            onClick={onRedo}
          />
        </Tooltip>
        <Tooltip title={isDirty ? t('flow.toolbar.save') : t('flow.toolbar.saved')}>
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

        <div className={dividerClass} />

        {/* 文件组 */}
        <Tooltip title={t('flow.toolbar.export')}>
          <Button
            data-testid="toolbar-export"
            icon={<Download size={14} />}
            size="small"
            onClick={onExport}
          />
        </Tooltip>
        <Tooltip title={t('flow.toolbar.import')}>
          <Button
            data-testid="toolbar-import"
            icon={<Upload size={14} />}
            size="small"
            onClick={onImport}
          />
        </Tooltip>
        <Tooltip title={t('flow.toolbar.validate')}>
          <Button
            data-testid="toolbar-validate"
            icon={<ShieldCheck size={14} />}
            size="small"
            onClick={onValidate}
          />
        </Tooltip>
        <Tooltip title={t('flow.toolbar.clear')}>
          <Popconfirm
            cancelText={t('common.cancel')}
            description={t('flow.toolbar.clearDescription')}
            okButtonProps={{ danger: true }}
            okText={t('flow.toolbar.clearOk')}
            title={t('flow.toolbar.clear')}
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

      {/* 右侧：Mock Agent 地址 */}
      <div style={{ flex: 1 }} />
      <Select
        allowClear
        options={agentUrlOptions}
        placeholder={t('flow.toolbar.agentUrlPlaceholder')}
        size="small"
        style={{ minWidth: 240 }}
        value={agentUrl || undefined}
        onChange={onAgentUrlChange}
      />
    </div>
  )
}
