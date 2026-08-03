import { CircleX } from 'lucide-react'
import { open } from '@tauri-apps/plugin-dialog'
import { Button, Input, Popconfirm, Select, Switch, theme, Tooltip } from 'antd'
import { PlusCircleIcon, TrashIcon, XCircleIcon } from 'lucide-react'
import { nanoid } from 'nanoid'

import { EditableTable, type EditableTableProps } from '@/components/EditableTable'
import { ParamsEditableCell } from '@/components/tab-content/api/components/ParamsEditableCell'
import { PARAMS_CONFIG } from '@/configs/static'
import { ParamType } from '@/enums'
import { useStyles } from '@/hooks/useStyle'
import type { Parameter } from '@/types'

import { VarHighlightInput } from './VarHighlightInput'

import { css } from '@emotion/css'

const transformExampleValue = ({ type, example }: Pick<Parameter, 'type' | 'example'>) => {
  return type === ParamType.Array && !Array.isArray(example)
    ? [example ?? '']
    : Array.isArray(example)
      ? example.join(',')
      : example
}

interface ParamsEditableTableProps {
  value?: Parameter[]
  onChange?: (value: ParamsEditableTableProps['value']) => void
  removable?: boolean
  isPathParamsTable?: boolean
  showRequiredColumn?: boolean
  showDescriptionColumn?: boolean
  varMap?: Map<string, string>
  exampleColumnTitle?: string
}

export function ParamsEditableTable(props: ParamsEditableTableProps) {
  const { token } = theme.useToken()

  const {
    value,
    onChange,
    isPathParamsTable = false,
    removable = true,
    showRequiredColumn = true,
    showDescriptionColumn = true,
    varMap,
    exampleColumnTitle = '请求值',
  } = props

  const { styles } = useStyles(({ token }) => {
    const exampleRow = css({
      color: token.colorTextTertiary,

      '&:hover': {
        color: token.colorPrimary,
      },
    })

    return { exampleRow }
  })

  const handleAddRow = () => {
    onChange?.([
      ...(value ?? []),
      {
        id: nanoid(6),
        name: '',
        type: ParamType.String,
        enable: true,
      } as Parameter,
    ])
  }

  const handleChange = (rowIdx: number, v: Record<string, any>) => {
    onChange?.(
      value?.map((it, i) => {
        if (i === rowIdx) {
          return { ...it, ...v } as Parameter
        }

        return it
      }),
    )
  }

  const columns: EditableTableProps<Parameter>['columns'] = [
    {
      title: '参数名',
      dataIndex: 'name',
      width: 160,
      render: (text, record, ridx) => {
        const isDuplicate = value?.some((it, i) => i < ridx && it.name === text) ?? false

        return (
          <ParamsEditableCell validateError={isDuplicate}>
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
                  onChange={(ev) => {
                    handleChange(ridx, { name: ev.target.value })
                  }}
                />
                {isDuplicate && (
                  <Tooltip
                    title="此列不能重复"
                  >
                    <span className="pr-1">
                      <CircleX size={14} style={{ color: token.colorErrorText }} />
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
        return (
          <ParamsEditableCell>
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
    ...(showRequiredColumn
      ? [
          {
            title: <div className="text-center">必填</div>,
            dataIndex: 'required',
            width: 60,
            render: (required: boolean, record: Parameter, ridx: number) => {
              return (
                <ParamsEditableCell>
                  <div className="flex size-full items-center justify-center">
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
        ]
      : []),
    { title: exampleColumnTitle,
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
                <span className="max-w-[100px] truncate text-xs text-[color:var(--color-text-secondary,#667085)]" title={record.filePath}>
                  {record.filePath ? record.filePath.split(/[/\\]/).pop() : '未选择'}
                </span>
                <Button
                  size="small"
                  type="link"
                  onClick={() => {
                    void (async () => {
                      const selected = await open({
                        multiple: false,
                        directory: false,
                      })

                      if (selected) {
                        handleChange(ridx, { filePath: selected })
                      }
                    })()
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
    ...(showDescriptionColumn
      ? [
          {
            title: '说明',
            dataIndex: 'description',
            render: (text: string | undefined, _record: Parameter, ridx: number) => {
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
        ]
      : []),
    {
      title: <div className="text-center">启用</div>,
      width: 50,
      render: (_, record, ridx) => {
        return (
          <ParamsEditableCell>
            <div className="flex size-full items-center justify-center">
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
      title: <div className="text-center">操作</div>,
      width: 90,
      render: (_, record, idx) => {
        if (removable) {
          return (
            <div className="flex justify-center p-1 text-xs">
              <Popconfirm
                cancelText="取消"
                okButtonProps={{ danger: true }}
                okText="删除"
                title="删除该参数？"
                onConfirm={() => {
                  onChange?.(value?.filter((_, i) => i !== idx))
                }}
              >
                <Button
                  danger
                  aria-label="删除参数"
                  icon={<TrashIcon size={13} />}
                  size="small"
                  type="text"
                />
              </Popconfirm>
            </div>
          )
        }
      },
    },
  ]

  return (
    <div className="space-y-1">
      {!isPathParamsTable && (
        <div className="flex">
          <Button
            icon={<PlusCircleIcon size={13} />}
            size="small"
            type="dashed"
            onClick={handleAddRow}
          >
            添加参数
          </Button>
        </div>
      )}
      <EditableTable<Parameter>
        columns={columns}
        dataSource={value ?? []}
      />
    </div>
  )
}
