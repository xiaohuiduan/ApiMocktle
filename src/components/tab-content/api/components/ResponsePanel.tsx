'use client'

import { ReactNode, useEffect, useRef } from 'react'

import { Panel, PanelGroup, PanelResizeHandle, type ImperativePanelHandle } from 'react-resizable-panels'

import { Typography, theme } from 'antd'
import { TerminalIcon } from 'lucide-react'

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
  const resultPanelRef = useRef<ImperativePanelHandle>(null)
  const prevHasResultRef = useRef(hasResult)

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

  useEffect(() => {
    if (hasResult && !prevHasResultRef.current) {
      requestAnimationFrame(() => {
        resultPanelRef.current?.resize(50)
      })
    }
    prevHasResultRef.current = hasResult
  }, [hasResult])

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
        ref={resultPanelRef}
        defaultSize={hasResult ? 50 : 0}
        minSize={15}
        className="flex flex-col overflow-hidden min-w-0"
      >
        <div className="flex flex-col flex-1 overflow-hidden px-2 py-1.5">
          {hasResult ? (
            resultArea
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2">
              <TerminalIcon size={22} style={{ color: token.colorTextTertiary }} />
              <Typography.Text type="secondary" className="text-xs">
                填写请求后点击“运行”查看响应
              </Typography.Text>
            </div>
          )}
        </div>
      </Panel>
    </PanelGroup>
  )
}
