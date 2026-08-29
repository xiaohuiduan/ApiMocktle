'use client'

import { useLayoutEffect, useMemo, useState } from 'react'
import {
  getPanelGroupElement,
  Panel,
  PanelGroup,
  type PanelProps,
  PanelResizeHandle,
} from 'react-resizable-panels'

import { theme } from 'antd'
import { throttle } from 'lodash-es'
import { ChevronRightIcon } from 'lucide-react'
import useResizeObserver from 'use-resize-observer'

import { useLayoutContext } from '@/contexts/layout-settings'
import { useDesignStyle } from '@/hooks/useDesignStyle'
import { useStyles } from '@/hooks/useStyle'

import { FooterBar } from '../components/FooterBar'

import { css } from '@emotion/css'

const SIDE_PANEL_DEFAULT_WIDTH = 280
const SIDE_PANEL_MIN_WIDTH = 200
const SIDE_PANEL_MAX_WIDTH = 600

interface PanelLayoutProps {
  layoutName?: string
  left?: React.ReactNode
  right?: React.ReactNode
}

export function PanelLayout(props: PanelLayoutProps) {
  const { token } = theme.useToken()
  const { isGlassStyle, isNeumorphism } = useDesignStyle()

  const { layoutName, left, right } = props

  const { panelRef, isSideMenuCollapsed, setIsSideMenuCollapsed } = useLayoutContext()

  const { styles } = useStyles(({ token }) => {
    const resizeHandleInner = css({
      backgroundColor: isNeumorphism ? 'transparent' : token.colorBorderSecondary,
    })

    return {
      resizeHandle: css({
        [`&:hover > .${resizeHandleInner}, &[data-resize-handle-state="hover"] > .${resizeHandleInner}, &[data-resize-handle-state="drag"] > .${resizeHandleInner}`]:
          {
            backgroundColor: token.colorPrimary,
          },
      }),

      resizeHandleInner,

      expandTrigger: css({
        color: token.colorPrimary,
        backgroundColor: isGlassStyle ? 'rgba(255,255,255,0.15)' : token.colorFillAlter,
        backdropFilter: isGlassStyle ? 'blur(8px)' : undefined,
        boxShadow: isNeumorphism
          ? 'var(--ds-shadow-sm)'
          : '1px 0 4px rgba(16 24 40 / 0.08)',
        '&:hover': {
          backgroundColor: isGlassStyle ? 'rgba(255,255,255,0.25)' : token.colorFillSecondary,
        },
      }),
    }
  })

  const [defaultSize, setDefaultSize] = useState<PanelProps['defaultSize']>(20)
  const [minSize, setMinSize] = useState<PanelProps['minSize']>(15)
  const [maxSize, setMaxSize] = useState<PanelProps['maxSize']>(50)

  useLayoutEffect(() => {
    const panelGroup = getPanelGroupElement('panel-group')

    if (panelGroup instanceof HTMLElement) {
      setDefaultSize((SIDE_PANEL_DEFAULT_WIDTH / panelGroup.offsetWidth) * 100)
      setMinSize((SIDE_PANEL_MIN_WIDTH / panelGroup.offsetWidth) * 100)
      setMaxSize((SIDE_PANEL_MAX_WIDTH / panelGroup.offsetWidth) * 100)
    }
  }, [])

  // 当 PanelGroup 的宽度不再变化时，将 minSize 和 maxSize 恢复设置为默认值。
  const handlePanelGroupResizeEnd = useMemo(() => {
    return throttle(
      (panelGroupWidth: number) => {
        setMinSize((SIDE_PANEL_MIN_WIDTH / panelGroupWidth) * 100)
        setMaxSize((SIDE_PANEL_MAX_WIDTH / panelGroupWidth) * 100)
      },
      500,
      {
        leading: false,
        trailing: true,
      },
    )
  }, [])

  useResizeObserver<HTMLDivElement>({
    ref: getPanelGroupElement('panel-group') as HTMLDivElement | null,
    onResize: ({ width: panelGroupWidth }) => {
      if (typeof panelGroupWidth === 'number') {
        const sidePanelSize = (SIDE_PANEL_DEFAULT_WIDTH / panelGroupWidth) * 100

        setDefaultSize(sidePanelSize)

        // 当 PanelGroup 的宽度发生变化时，将 minSize 和 maxSize 设置为固定值，防止 SidePanel 随着 PanelGroup 的宽度变化而变化。
        setMinSize(sidePanelSize)
        setMaxSize(sidePanelSize)

        handlePanelGroupResizeEnd(panelGroupWidth)
      }
    },
  })

  return (
    <>
      <PanelGroup direction="horizontal" id="panel-group">
        {!!defaultSize && !!minSize && (
          <>
            <Panel
              ref={panelRef}
              collapsible
              className="flex h-full flex-col overflow-hidden"
              defaultSize={defaultSize}
              id="panel-left"
              maxSize={maxSize}
              minSize={minSize}
              order={1}
              onCollapse={() => {
                setIsSideMenuCollapsed(true)
              }}
              onExpand={() => {
                setIsSideMenuCollapsed(false)
              }}
            >
              <div className="p-2">
                <span className="px-2 text-lg font-semibold">{layoutName}</span>
              </div>

              {left}
            </Panel>

            <PanelResizeHandle className={`relative basis-px ${styles.resizeHandle}`}>
              <div className={`h-full w-px ${styles.resizeHandleInner}`} />
            </PanelResizeHandle>
          </>
        )}

        <Panel
          className="relative flex h-full flex-1 flex-col overflow-y-auto overflow-x-hidden"
          id="panel-right"
          order={2}
        >
          <div className="flex-1 overflow-auto">{right}</div>

          <div
            className="shrink-0 basis-9"
            style={{ borderTop: `1px solid ${token.colorBorderSecondary}` }}
          >
            <FooterBar />
          </div>
        </Panel>
      </PanelGroup>

      {isSideMenuCollapsed && (
        <button
          type="button"
          aria-label="展开目录面板"
          className={`absolute left-0 top-1/2 z-50 flex h-16 w-4 -translate-y-1/2 cursor-pointer items-center justify-center rounded-r-lg border-none bg-transparent p-0 ${styles.expandTrigger}`}
          onClick={() => {
            panelRef.current?.expand()
          }}
        >
          <ChevronRightIcon size={12} strokeWidth={3} />
        </button>
      )}
    </>
  )
}
