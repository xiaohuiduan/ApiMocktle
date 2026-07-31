import { CloseCircleFilled } from '@ant-design/icons'
import { Button, Input, Select, Switch, theme, Tooltip } from 'antd'
import { PlusCircleIcon, XCircleIcon } from 'lucide-react'
import { open } from '@tauri-apps/plugin-dialog'
import { nanoid } from 'nanoid'
import { useEffect, useMemo, useRef, useState } from 'react'

import { DoubleCheckRemoveBtn } from '@/components/DoubleCheckRemoveBtn'
import { EditableTable, type EditableTableProps } from '@/components/EditableTable'
import { ParamsEditableCell } from '@/components/tab-content/api/components/ParamsEditableCell'
import { PARAMS_CONFIG } from '@/configs/static'
import { ParamType } from '@/enums'
import { useStyles } from '@/hooks/useStyle'
import type { Parameter, UnsafeAny } from '@/types'

import { VarHighlightInput } from './VarHighlightInput'

import { css } from '@emotion/css'

const transformExampleValue = ({ type, example }: Pick<Parameter, 'type' | 'example'>) => {
  return type === ParamType.Array && !Array.isArray(example)
    ? [example ?? '']
    : Array.isArray(example)
      ? example.join(',')
      : example
}

interface ParamsEditableTableProps extends Pick<EditableTableProps, 'autoNewRow'> {
  value?: Parameter[]
  onChange?: (value: ParamsEditableTableProps['value']) => void
  removable?: boolean
  isPathParamsTable?: boolean
  varMap?: Map<string, string>
  exampleColumnTitle?: string
}

export function ParamsEditableTable(props: ParamsEditableTableProps) {
  const { token } = theme.useToken()

  const {
    value,
    onChange,
    isPathParamsTable = false,
    autoNewRow = !isPathParamsTable,
    removable = true,
    varMap,
    exampleColumnTitle = '请求值',
  } = props

  const testIsNewRow = (target: Parameter | undefined) => !target?.id

  // 追踪待提交的新行数据（ref 避免 key 变化导致焦点丢失）
  const pendingNewRowRef = useRef<Partial<Parameter> | null>(null)
  const [pendingVersion, setPendingVersion] = useState(0)

  const { styles } = useStyles(({ token }) => {
    const exampleRow = css({
      color: token.colorTextTertiary,

      '&:hover': {
        color: token.colorPrimary,
      },
    })

    return { exampleRow }
  })

  const handleDuplicate = (rowIdx: number, v: Partial<Parameter>) => {
    onChange?.(
      value
        ?.filter((_, i) => i !== rowIdx)
        .map((it) => {
          if (it.name === v.name) {
            if (it.type === ParamType.Array) {
              return {
                ...it,
                example:
                  typeof v.example === 'string' ? [...(it.example ?? []), v.example] : it.example,
              }
            }
            else {
              return {
                ...it,
                type: ParamType.Array,
                example: [it.example ?? '', typeof v.example === 'string' ? v.example : ''],
              }
            }
          }

          return it
        }),
    )
  }

  const handleChange = (rowIdx: number, v: Record<string, any>) => {
    const target = value?.at(rowIdx)
    const isNewRow = testIsNewRow(target)

    if (isNewRow) {
      // 新增行：暂存到 ref 中，不触发 onChange，保持 key 稳定避免焦点丢失
      pendingNewRowRef.current = {
        ...pendingNewRowRef.current,
        ...v,
        name: target?.name || v.name,
      }
      setPendingVersion(prev => prev + 1)
    }
    else {
      onChange?.(
        value?.map((it, i) => {
          if (i === rowIdx) {
            return { ...it, ...v } as Parameter
          }

          return it
        }),
      )
    }
  }

  // 提交待新增的行（失焦时调用）
  const commitPendingNewRow = () => {
    const pending = pendingNewRowRef.current
    if (pending && pending.name) {
      const newParam: Parameter = {
        id: nanoid(6),
        name: pending.name,
        description: pending.description || '',
        enable: true,
        type: pending.type || ParamType.String,
        example: pending.example || '',
      } as Parameter
      onChange?.([...(value ?? []), newParam])
    }
    pendingNewRowRef.current = null
    setPendingVersion(prev => prev + 1)
  }

  // 合并待新增行到 dataSource（渲染用），避免 EditableTable 的 autoNewRow 被干扰
  const mergedValue = useMemo(() => {
    const base = value ?? []
    if (pendingNewRowRef.current) {
      return [...base, pendingNewRowRef.current as Parameter]
    }
    return base
  }, [value, pendingVersion])

  const columns: EditableTableProps<Parameter>['columns'] = [
    {
      title: '参数名',
      dataIndex: 'name',
      width: 160,
      render: (text, record, ridx) => {
        const isNewRow = testIsNewRow(record)

        const isNameEmpty = !text && !isNewRow

        const isDuplicate
          = value?.some((it, i) => {
            const isPrevRow = i < ridx
            const isSameName = it.name === text

            return isPrevRow && isSameName
          }) && !isNewRow

        const isValidateError = isNameEmpty || isDuplicate

        return (
          <ParamsEditableCell validateError={isValidateError}>
            <Tooltip
              open={isPathParamsTable ? undefined : false}
              title="自动提取接口路径里的 {param} 形式参数，请在接口路径中修改。"
            >
              <div className="flex size-full items-center">
                <Input
                  className="h-full"
                  placeholder="添加参数"
                  readOnly={isPathParamsTable}
                  value={typeof text === 'string' ? text : ''}
                  variant="borderless"
                  onBlur={() => {
                    if (isDuplicate) {
                      handleDuplicate(ridx, { name: text })
                    }
                    commitPendingNewRow()
                  }}
                  onChange={(ev) => {
                    handleChange(ridx, { name: ev.target.value })
                  }}
                />
                {(isNameEmpty || isDuplicate) && (
                  <Tooltip
                    title={isNameEmpty ? '参数名不能为空' : isDuplicate ? '此列不能重复' : ''}
                  >
                    <span className="pr-1">
                      <CloseCircleFilled style={{ color: token.colorErrorText }} />
                    </span>
                  </Tooltip>
                )}
              </div>
            </Tooltip>
          </ParamsEditableCell>
        )
      },
    },
    {
      title: '类型',
      dataIndex: 'type',
      width: 90,
      render: (text, record, ridx) => {
        const isNewRow = testIsNewRow(record)

        return (
          <ParamsEditableCell className={isNewRow ? 'opacity-0 hover:opacity-100' : ''}>
            <Select
              className="w-full [&.ant-select_.ant-select-selector]:text-inherit"
              options={[
                { label: 'string', value: ParamType.String },
                { label: 'integer', value: ParamType.Integer },
                { label: 'boolean', value: ParamType.Boolean },
                { label: 'number', value: ParamType.Number },
                { label: 'array', value: ParamType.Array, hidden: isPathParamsTable },
                { label: 'file', value: ParamType.File },
              ].filter((it) => !it.hidden)}
              popupClassName="min-w-[90px]"
              style={{
                color:
                  typeof text === 'string'
                    ? `var(${PARAMS_CONFIG[text as ParamType].varColor})`
                    : '',
              }}
              suffixIcon={null}
              value={typeof text === 'string' ? text : ''}
              variant="borderless"
              onChange={(paramType) => {
                handleChange(ridx, {
                  type: paramType,
                  example: transformExampleValue({
                    type: paramType as ParamType,
                    example: record.example,
                  }),
                })
              }}
            />
          </ParamsEditableCell>
        )
      },
    },
    {
      title: '必填',
      dataIndex: 'required',
      width: 60,
      render: (required, record, ridx) => {
        return (
          <ParamsEditableCell>
            <div className="flex items-center justify-center size-full">
              <Switch
                checked={!!required}
                size="small"
                onChange={(checked) => {
                  handleChange(ridx, { required: checked })
                }}
              />
            </div>
          </ParamsEditableCell>
        )
      },
    },
    {title: exampleColumnTitle,
      dataIndex: 'example',
      width: 180,
      render: (exampleVal, record, ridx) => {
        if (record.type === ParamType.Array) {
          const example: string[]
            = Array.isArray(exampleVal) && exampleVal.length > 0 ? exampleVal : ['']

          return (
            <div>
              {example.map((v, vIdx, self) => {
                const canRemove = self.length > 1

                return (
                  <div key={vIdx} className={`flex items-center ${styles.exampleRow}`}>
                    <ParamsEditableCell>
                      <Input
                        value={v}
                        variant="borderless"
                        onChange={(ev) => {
                          const newExample = self.toSpliced(vIdx, 1, ev.target.value)
                          handleChange(ridx, { example: newExample })
                        }}
                      />
                    </ParamsEditableCell>

                    <div className="flex items-center px-1">
                      <PlusCircleIcon
                        className="cursor-pointer"
                        size={13}
                        onClick={() => {
                          const newExample = example.toSpliced(vIdx + 1, 0, '')
                          handleChange(ridx, { example: newExample })
                        }}
                      />
                    </div>

                    <div
                      className={`flex items-center pr-1 ${canRemove ? '' : 'pointer-events-auto invisible opacity-0'}`}
                      onClick={() => {
                        if (canRemove) {
                          handleChange(ridx, { example: example.filter((_, i) => i !== vIdx) })
                        }
                      }}
                    >
                      <XCircleIcon className="cursor-pointer" size={13} />
                    </div>
                  </div>
                )
              })}
            </div>
          )
        }

        if (record.type === ParamType.File) {
          return (
            <ParamsEditableCell>
              <div className="flex items-center gap-1">
                <span className="text-xs text-gray-400 truncate max-w-[100px]" title={record.filePath}>
                  {record.filePath ? record.filePath.split(/[/\\]/).pop() : '未选择'}
                </span>
                <Button
                  size="small"
                  type="link"
                  onClick={async () => {
                    const selected = await open({
                      multiple: false,
                      directory: false,
                    })
                    if (selected) {
                      handleChange(ridx, { filePath: selected as string })
                    }
                  }}
                >
                  选择文件
                </Button>
              </div>
            </ParamsEditableCell>
          )
        }

        return (
          <ParamsEditableCell>
            {varMap
              ? (
                  <VarHighlightInput
                    value={typeof exampleVal === 'string' ? exampleVal : ''}
                    varMap={varMap}
                    onChange={(newVal) => {
                      handleChange(ridx, { example: newVal })
                    }}
                  />
                )
              : (
                  <Input
                    value={exampleVal ?? ''}
                    variant="borderless"
                    onChange={(ev) => {
                      handleChange(ridx, { example: ev.target.value })
                    }}
                  />
                )}
          </ParamsEditableCell>
        )
      },
    },
    {
      title: '说明',
      dataIndex: 'description',
      render: (text, _, ridx) => {
        return (
          <ParamsEditableCell className="py-0">
            <Input.TextArea
              autoSize={{ minRows: 1, maxRows: 6 }}
              value={text ?? ''}
              variant="borderless"
              onChange={(ev) => {
                handleChange(ridx, { description: ev.target.value })
              }}
            />
          </ParamsEditableCell>
        )
      },
    },
    {
      width: 50,
      render: (_, record, ridx) => {
        return (
          <ParamsEditableCell>
            <div className="flex items-center justify-center size-full">
              <Switch
                checked={record.enable !== false}
                size="small"
                onChange={(checked) => {
                  handleChange(ridx, { enable: checked })
                }}
              />
            </div>
          </ParamsEditableCell>
        )
      },
    },
    {
      width: 90,
      render: (_, record, idx) => {
        const isNewRow = testIsNewRow(record)

        if (!isNewRow && removable) {
          return (
            <div className="flex justify-center p-1 text-xs">
              <DoubleCheckRemoveBtn
                onRemove={() => {
                  onChange?.(value?.filter((_, i) => i !== idx))
                }}
              />
            </div>
          )
        }
      },
    },
  ]

  return (
    <EditableTable<Parameter>
      autoNewRow={autoNewRow}
      columns={columns}
      dataSource={mergedValue}
      newRowRecord={{
        type: ParamType.String,
      }}
    />
  )
}
