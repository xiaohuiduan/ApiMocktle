import { useCallback, useMemo, useRef, useState } from 'react'

import { Input, type InputRef, Popover, Tag, theme, Tooltip } from 'antd'

import { useDynamicVariableDefs } from '@/hooks/useDynamicVariableDefs'

interface VarHighlightInputProps {
  value?: string
  onChange?: (value: string) => void
  varMap: Map<string, string>
  placeholder?: string
  disabled?: boolean
  readOnly?: boolean
}

const VAR_REGEX = /\{\{(\w+)\}\}/g

/** 动态变量补全项：label 为 $xxx 名称，detail 为说明 */
interface CompletionItem {
  label: string
  detail?: string
  isDynamic: boolean
}

function extractVarNames(text: string): string[] {
  const names: string[] = []
  let match: RegExpExecArray | null
  VAR_REGEX.lastIndex = 0

  while ((match = VAR_REGEX.exec(text)) !== null) {
    if (!names.includes(match[1])) { names.push(match[1]) }
  }

  return names
}

export function VarHighlightInput(props: VarHighlightInputProps) {
  const { value = '', onChange, varMap, placeholder, disabled, readOnly } = props
  const { token } = theme.useToken()
  const inputRef = useRef<InputRef>(null)
  const cursorRef = useRef<number>(value.length)

  const [showDropdown, setShowDropdown] = useState(false)
  const [dropdownFilter, setDropdownFilter] = useState('')

  const dynamicDefs = useDynamicVariableDefs()
  const referencedVars = useMemo(() => extractVarNames(value), [value])
  const definedVars = referencedVars.filter((n) => varMap.has(n))
  const undefinedVars = referencedVars.filter((n) => !varMap.has(n))

  /** 动态变量补全项（全部，过滤在下方） */
  const dynamicItems: CompletionItem[] = useMemo(() => {
    return dynamicDefs.map((d) => ({
      label: d.name,
      detail: d.desc,
      isDynamic: true,
    }))
  }, [dynamicDefs])

  /** 用户变量补全项（已定义的，带当前值） */
  const userItems: CompletionItem[] = useMemo(() => {
    return Array.from(varMap.entries())
      .filter(([k]) => k.startsWith('$'))
      .map(([k, v]) => ({ label: k, detail: v, isDynamic: false }))
  }, [varMap])

  /** 匹配补全项：动态变量 + 已定义用户变量（最多 10 个） */
  const matchingItems = useMemo(() => {
    if (!showDropdown) { return [] }

    const filter = dropdownFilter.toLowerCase()

    const dyn = dynamicItems.filter((it) => {
      // 输入 $ 开头时按 $ 前缀过滤；输入普通字符时按名称包含匹配
      return filter.startsWith('$')
        ? it.label.toLowerCase().startsWith(filter)
        : it.label.toLowerCase().includes(filter)
    })

    const users = userItems.filter((it) => {
      return filter.startsWith('$')
        ? it.label.toLowerCase().startsWith(filter)
        : it.label.toLowerCase().includes(filter)
    })

    return [...dyn, ...users.slice(0, 10)]
  }, [showDropdown, dropdownFilter, dynamicItems, userItems])

  const handleChange = useCallback(
    (ev: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = ev.target.value
      onChange?.(newValue)

      const cursorPos = ev.target.selectionStart ?? 0
      cursorRef.current = cursorPos
      const textBefore = newValue.slice(0, cursorPos)
      const lastOpen = textBefore.lastIndexOf('{{')

      if (lastOpen >= 0) {
        const afterOpen = textBefore.slice(lastOpen + 2)

        if (!afterOpen.includes('}}')) {
          setDropdownFilter(afterOpen)
          setShowDropdown(true)

          return
        }
      }

      setShowDropdown(false)
    },
    [onChange],
  )

  const selectVariable = useCallback(
    (varName: string) => {
      const cursorPos = cursorRef.current
      const beforeCursor = value.slice(0, cursorPos)
      const afterCursor = value.slice(cursorPos)
      const lastOpen = beforeCursor.lastIndexOf('{{')
      const newValue = value.slice(0, lastOpen) + `{{${varName}}}` + afterCursor
      onChange?.(newValue)
      setShowDropdown(false)
      // restore focus and cursor position after replacement
      requestAnimationFrame(() => {
        const pos = lastOpen + varName.length + 4
        inputRef.current?.input?.setSelectionRange(pos, pos)
        inputRef.current?.focus()
      })
    },
    [value, onChange],
  )

  return (
    // Popover 通过 portal 渲染补全列表，避免被表格单元格 overflow:hidden 裁剪
    <Popover
      arrow={false}
      content={(
        <div className="min-w-[200px] py-1">
          {matchingItems.map((it) => (
            <div
              key={it.label}
              className="cursor-pointer px-3 py-1.5 text-sm"
              style={{ color: token.colorText }}
              onMouseDown={(e) => {
                e.preventDefault()
                selectVariable(it.label)
              }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = token.colorFillTertiary }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '' }}
            >
              <span className="font-medium" style={{ color: it.isDynamic ? token.colorPrimary : token.colorText }}>
                {it.label}
              </span>
              <span className="ml-2" style={{ color: token.colorTextSecondary }}>
                {it.detail}
              </span>
            </div>
          ))}
        </div>
      )}
      open={showDropdown && matchingItems.length > 0}
      placement="bottomLeft"
      styles={{ body: { padding: 0, maxHeight: 240, overflowY: 'auto' } }}
      onOpenChange={(v) => {
        if (!v) { setShowDropdown(false) }
      }}
    >
      <div className="relative" style={{ minWidth: 0 }}>
        <Input
          ref={inputRef}
          disabled={disabled}
          placeholder={placeholder}
          readOnly={readOnly}
          value={value}
          variant="borderless"
          onChange={handleChange}
          onKeyDown={(ev) => {
            if (showDropdown && ev.key === 'Escape') { setShowDropdown(false) }
          }}
        />

        {referencedVars.length > 0 && (
          <div className="mt-0.5 flex flex-wrap items-center gap-1">
            {definedVars.map((v) => (
              <Tooltip key={v} title={`实际生效值：${varMap.get(v) ?? '—'}`}>
                <Tag className="text-[10px] leading-none" color="blue">
                  {v}={varMap.get(v)}
                </Tag>
              </Tooltip>
            ))}
            {undefinedVars.map((v) => (
              <Tag key={v} className="text-[10px] leading-none" color="orange">
                {v} 未定义
              </Tag>
            ))}
          </div>
        )}
      </div>
    </Popover>
  )
}
