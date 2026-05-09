import { useMemo } from 'react'

import { ConfigProvider, Menu, Popover, Select, theme, Tooltip } from 'antd'
import { Settings2Icon, XIcon } from 'lucide-react'

import type { ApiMenuData } from '@/components/ApiMenu'
import { SchemaType } from '@/components/JsonSchema'
import { defaultSchemaTypeConfig } from '@/components/JsonSchema/constants'
import type { RefSchema } from '@/components/JsonSchema/JsonSchema.type'
import { MenuItemType } from '@/enums'
import { useStyles } from '@/hooks/useStyle'

import { css } from '@emotion/css'

interface DataTypeSelectProps {
  type?: SchemaType
  disabled?: boolean
  readOnly?: boolean
  $ref?: RefSchema['$ref']
  menuRawList?: ApiMenuData[]
  onRefSelect?: ($ref: string) => void
  onTypeSelect?: (type: SchemaType) => void
}

export const cssSchemaType = css({
  display: 'none',
  alignItems: 'center',
  padding: 2,
  borderRadius: 2,
  cursor: 'pointer',
  opacity: 0.5,

  '&:hover': {
    opacity: 1,
  },
})

const tyepList = [
  SchemaType.Refer,
  SchemaType.String,
  SchemaType.Integer,
  SchemaType.Boolean,
  SchemaType.Object,
  SchemaType.Number,
  SchemaType.Null,
  SchemaType.Any,
] satisfies SchemaType[]

export function DataTypeSelect(props: DataTypeSelectProps) {
  const { type, disabled, readOnly, $ref, menuRawList, onRefSelect, onTypeSelect } = props

  const { token } = theme.useToken()

  const { styles } = useStyles(() => {
    return {
      typeSelect: css({
        cursor: 'pointer',

        '&:hover': {
          textDecoration: 'underline',
        },
      }),
    }
  })

  // 获取所有 ApiSchema 模型
  const schemaModels = useMemo(() => {
    return (menuRawList ?? []).filter((item) => item.type === MenuItemType.ApiSchema)
  }, [menuRawList])

  const typeName = useMemo(() => {
    if (type) {
      if ($ref) {
        // 从 $ref 中提取模型名称
        const name = $ref.split('/').pop() || $ref
        return schemaModels.find((it) => it.name === name)?.name ?? name
      }
      else {
        return defaultSchemaTypeConfig[type].text
      }
    }
  }, [type, $ref, schemaModels])

  if (type) {
    return (
      <div className="flex w-full items-center gap-2">
        <Popover
          content={(
            <ConfigProvider
              theme={{
                components: {
                  Menu: {
                    activeBarBorderWidth: 0,
                    itemHeight: 32,
                  },
                },
              }}
            >
              <div className="w-[160px]">
                <Menu
                  items={tyepList.map((it) => ({
                    key: it,
                    label: defaultSchemaTypeConfig[it].text,
                  }))}
                  selectedKeys={[type]}
                  onClick={(menuInfo) => {
                    onTypeSelect?.(menuInfo.key as SchemaType)
                  }}
                />
              </div>
            </ConfigProvider>
          )}
          open={disabled ? false : undefined}
          placement="right"
          rootClassName="[&_.ant-popover-inner]:!p-0"
          trigger="click"
        >
          <span
            className={readOnly ? undefined : styles.typeSelect}
            style={{ color: `var(${defaultSchemaTypeConfig[type].varColor})` }}
          >
            {typeName}
          </span>
        </Popover>

        <Popover
          content={(
            <div className="w-[345px]">
              <div className="flex pb-2">
                <span
                  className="ml-auto cursor-pointer"
                  style={{ color: token.colorTextSecondary }}
                >
                  <XIcon size={16} />
                </span>
              </div>

              {type === SchemaType.Refer
                ? (
                    <Select
                      className="w-full"
                      placeholder="请选择引用的模型"
                      options={schemaModels.map((it) => ({
                        label: it.name,
                        value: `#/components/schemas/${it.name}`,
                      }))}
                      value={$ref}
                      onChange={(v) => {
                        onRefSelect?.(v)
                      }}
                    />
                  )
                : (
                    <Select
                      className="[&_.ant-select-selector]:!text-current"
                      options={tyepList.map((it) => ({
                        label: defaultSchemaTypeConfig[it].text,
                        value: it,
                      }))}
                      style={{ color: `var(${defaultSchemaTypeConfig[type].varColor})` }}
                      value={type}
                      onChange={(v) => {
                        onTypeSelect?.(v)
                      }}
                    />
                  )}
            </div>
          )}
          placement="right"
          trigger="click"
        >
          <Tooltip title="高级设置">
            <span className={cssSchemaType} style={{ backgroundColor: token.colorBgLayout }}>
              <Settings2Icon size={12} />
            </span>
          </Tooltip>
        </Popover>
      </div>
    )
  }

  return null
}
