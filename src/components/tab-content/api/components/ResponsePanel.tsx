'use client'

import { ReactNode } from 'react'

import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'

import { Typography, theme } from 'antd'

import { useStyles } from '@/hooks/useStyle'

import { css } from '@emotion/css'

interface ResponsePanelProps {
  paramsArea: ReactNode
  resultArea: ReactNode
  hasResult: boolean
  autoSaveId: string
}

export function ResponsePanel({ paramsArea, resultArea, hasResult, autoSaveId }: ResponsePanelProps) {
  const { token } = theme.useToken()

  const { styles } = useStyles(({ token }) => ({
    resizeHandle: css({
      height: 2,
      backgroundColor: token.colorBorderSecondary,
      cursor: 'row-resize',
      transition: 'background-color 0.2s',
      '&:hover, &[data-resize-handle-state="hover"], &[data-resize-handle-state="drag"]': {
        backgroundColor: token.colorPrimary,
      },
    }),
  }))

  return (
    <PanelGroup
      direction="vertical"
      autoSaveId={autoSaveId}
      className="flex-1 min-w-0 overflow-hidden"
    >
      <Panel
        defaultSize={hasResult ? 50 : 85}
        minSize={15}
        maxSize={85}
        className="flex flex-col overflow-hidden min-w-0"
      >
        <div className="flex-1 overflow-auto min-w-0" style={{ maxWidth: '100%' }}>
          {paramsArea}
        </div>
      </Panel>

      <PanelResizeHandle className={styles.resizeHandle} />

      <Panel
        defaultSize={hasResult ? 50 : 0}
        minSize={15}
        className="flex flex-col overflow-hidden min-w-0"
      >
        <div className="flex flex-col flex-1 overflow-hidden px-2 py-1.5">
          {hasResult ? (
            resultArea
          ) : (
            <Typography.Text type="secondary" className="text-xs">
              运行请求后将在此处显示结果
            </Typography.Text>
          )}
        </div>
      </Panel>
    </PanelGroup>
  )
}
