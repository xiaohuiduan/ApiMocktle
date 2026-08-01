export function AppMenuControls(props: React.PropsWithChildren) {
  return (
    <span className="ui-menu-controls ml-auto flex items-center whitespace-nowrap">
      {props.children}
    </span>
  )
}
