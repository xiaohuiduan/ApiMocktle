import { Button, type ButtonProps } from 'antd'
import { ArrowLeftToLine, ArrowRightToLine } from 'lucide-react'

import { IconText } from '@/components/IconText'
import { useLayoutContext } from '@/contexts/layout-settings'

function SmallButton({ children, ...props }: React.PropsWithChildren<ButtonProps>) {
  return (
    <Button size="small" type="text" {...props}>
      {children}
    </Button>
  )
}

export function FooterBar() {
  const { panelRef, isSideMenuCollapsed } = useLayoutContext()

  return (
    <div className="flex h-full items-center pl-3 pr-6">
      {isSideMenuCollapsed
        ? (
            <SmallButton
              onClick={() => {
                panelRef.current?.expand()
              }}
            >
              <IconText icon={<ArrowRightToLine size={14} />} />
            </SmallButton>
          )
        : (
            <SmallButton
              onClick={() => {
                panelRef.current?.collapse()
              }}
            >
              <IconText icon={<ArrowLeftToLine size={14} />} />
            </SmallButton>
          )}

    </div>
  )
}
