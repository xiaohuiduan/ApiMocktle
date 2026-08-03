import { Button, type ButtonProps, theme, Tooltip } from 'antd'
import { ArrowLeftToLine, ArrowRightToLine, CircleDot, FileWarning } from 'lucide-react'

import { IconText } from '@/components/IconText'
import { useLayoutContext } from '@/contexts/layout-settings'
import { useMenuHelpersContext } from '@/contexts/menu-helpers'
import { useMenuTabContext } from '@/contexts/menu-tab-settings'

function SmallButton({ children, ...props }: React.PropsWithChildren<ButtonProps>) {
  return (
    <Button size="small" type="text" {...props}>
      {children}
    </Button>
  )
}

/**
 * 底部状态栏：折叠按钮 + 当前环境（名称/URL）+ 未保存页签数。
 * 环境与页签数据来自全局 Context，无数据时自动降级为仅折叠按钮。
 */
export function FooterBar() {
  const { token } = theme.useToken()
  const { panelRef, isSideMenuCollapsed } = useLayoutContext()
  const { projectEnvironments, currentProjectEnvironmentId } = useMenuHelpersContext()
  const { tabItems } = useMenuTabContext()

  const currentEnv = projectEnvironments.find((env) => env.id === currentProjectEnvironmentId)
  const unsavedCount = tabItems.filter((item) => item.data?.editStatus === 'changed' || item.data?.editStatus === 'error').length

  return (
    <div className="flex h-full items-center gap-3 pl-3 pr-6">
      {isSideMenuCollapsed
        ? (
            <SmallButton
              onClick={() => {
                panelRef.current?.expand()
              }}
            >
              <IconText icon={<ArrowRightToLine size={12} />} />
            </SmallButton>
          )
        : (
            <SmallButton
              onClick={() => {
                panelRef.current?.collapse()
              }}
            >
              <IconText icon={<ArrowLeftToLine size={12} />} />
            </SmallButton>
          )}

      <div className="ml-auto flex min-w-0 items-center gap-4 text-xs" style={{ color: token.colorTextSecondary }}>
        {currentEnv && (
          <Tooltip title={`${currentEnv.name} — ${currentEnv.url}`}>
            <span className="flex min-w-0 cursor-default items-center gap-1.5">
              <CircleDot size={12} style={{ color: token.colorPrimary }} />
              <span className="max-w-32 truncate font-medium" style={{ color: token.colorText }}>{currentEnv.name}</span>
              <span className="max-w-48 truncate text-[11px]" style={{ color: token.colorTextTertiary }}>{currentEnv.url}</span>
            </span>
          </Tooltip>
        )}

        {unsavedCount > 0 && (
          <Tooltip title={`${unsavedCount} 个页签有未保存的修改`}>
            <span className="flex cursor-default items-center gap-1">
              <FileWarning size={12} style={{ color: token.colorWarning }} />
              <span>{unsavedCount} 未保存</span>
            </span>
          </Tooltip>
        )}
      </div>
    </div>
  )
}
