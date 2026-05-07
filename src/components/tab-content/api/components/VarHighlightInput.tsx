import { Input, Tag, theme } from 'antd'
import type { InputRef } from 'antd'
import { useCallback, useMemo, useRef, useState } from 'react'

interface VarHighlightInputProps {
  value?: string
  onChange?: (value: string) => void
  varMap: Map<string, string>
  placeholder?: string
  disabled?: boolean
  readOnly?: boolean
}

const VAR_REGEX = /\{\{(\w+)\}\}/g

function extractVarNames(text: string): string[] {
  const names: string[] = []
  let match: RegExpExecArray | null
  VAR_REGEX.lastIndex = 0
  while ((match = VAR_REGEX.exec(text)) !== null) {
    if (!names.includes(match[1])) names.push(match[1])
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

  const referencedVars = useMemo(() => extractVarNames(value), [value])
  const definedVars = referencedVars.filter((n) => varMap.has(n))
  const undefinedVars = referencedVars.filter((n) => !varMap.has(n))

  const matchingVars = useMemo(() => {
    if (!dropdownFilter) return Array.from(varMap.keys()).slice(0, 10)
    const filter = dropdownFilter.toLowerCase()
    return Array.from(varMap.keys())
      .filter((k) => k.toLowerCase().includes(filter))
      .slice(0, 10)
  }, [varMap, dropdownFilter])

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
          if (showDropdown && ev.key === 'Escape') setShowDropdown(false)
        }}
      />

      {referencedVars.length > 0 && (
        <div className="mt-0.5 flex flex-wrap items-center gap-1">
          {definedVars.map((v) => (
            <Tag key={v} className="text-[10px] leading-none" color="blue">
              {v}={varMap.get(v)}
            </Tag>
          ))}
          {undefinedVars.map((v) => (
            <Tag key={v} className="text-[10px] leading-none" color="orange">
              {v} 未定义
            </Tag>
          ))}
        </div>
      )}

      {showDropdown && matchingVars.length > 0 && (
        <div
          className="absolute z-50 mt-1 w-max min-w-[160px] rounded-lg border bg-white py-1 shadow-lg"
          style={{ borderColor: token.colorBorderSecondary }}
        >
          {matchingVars.map((v) => (
            <div
              key={v}
              className="cursor-pointer px-3 py-1.5 text-sm hover:bg-gray-50"
              style={{ color: token.colorText }}
              onMouseDown={(e) => {
                e.preventDefault()
                selectVariable(v)
              }}
            >
              <span className="font-medium" style={{ color: token.colorPrimary }}>
                {v}
              </span>
              <span className="ml-2" style={{ color: token.colorTextSecondary }}>
                {varMap.get(v)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
