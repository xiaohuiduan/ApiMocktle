import { Button, Input, Switch, Tooltip, Typography, theme } from 'antd'
import { PlusIcon, TrashIcon } from 'lucide-react'

import type { ApiEnvironmentValue } from '@/types'

/** 计算变量的最终生效值（会话变量 > 环境变量 > 全局/密钥），无法解析时回退到原值 */
function resolveEffectiveValue(
  row: ApiEnvironmentValue,
  effectiveVarMap?: Map<string, string>,
): string | undefined {
  if (!effectiveVarMap || !row.name) return row.value ?? undefined
  if (effectiveVarMap.has(row.name)) return effectiveVarMap.get(row.name)
  return row.value ?? undefined
}

function updateValueRow(
  list: ApiEnvironmentValue[],
  targetId: string,
  field: keyof ApiEnvironmentValue,
  value: string | boolean,
) {
  return list.map((item) => (item.id === targetId ? { ...item, [field]: value } : item))
}

function ValueRowsTable(props: {
  editable: boolean
  rows: ApiEnvironmentValue[]
  onChange: (nextRows: ApiEnvironmentValue[]) => void
  emptyText?: string
  showEnable?: boolean
  effectiveVarMap?: Map<string, string>
}) {
  const { token } = theme.useToken()
  const { editable, rows, onChange, emptyText = '当前还没有内容，点击右上角"添加"开始配置。', showEnable, effectiveVarMap } = props

  if (rows.length === 0) {
    return (
      <div className="px-3 py-6 text-center" style={{ color: token.colorTextSecondary }}>
        {emptyText}
      </div>
    )
  }

  return rows.map((row, index) => {
    const effective = resolveEffectiveValue(row, effectiveVarMap)
    const overridden = effectiveVarMap != null && effective !== row.value
    return (
      <div
        key={row.id}
        className="grid"
        style={{
          gridTemplateColumns: showEnable
            ? 'minmax(0,1fr) minmax(0,1.2fr) minmax(0,1.2fr) 60px 56px'
            : 'minmax(0,1fr) minmax(0,1.2fr) minmax(0,1.2fr) 56px',
          borderBottom: index === rows.length - 1 ? 'none' : `1px solid ${token.colorBorderSecondary}`,
        }}
      >
        <Input
          variant="borderless"
          disabled={!editable}
          placeholder="添加变量"
          value={row.name}
          onChange={(event) => {
            onChange(updateValueRow(rows, row.id, 'name', event.target.value))
          }}
        />
        <Input
          variant="borderless"
          disabled={!editable}
          placeholder="值"
          value={row.value}
          onChange={(event) => {
            onChange(updateValueRow(rows, row.id, 'value', event.target.value))
          }}
        />
        {effectiveVarMap && (
          <Tooltip title={overridden ? '已被更高优先级变量覆盖' : '当前值即为生效值'}>
            <div
              className="flex items-center truncate px-2 text-xs"
              style={{ color: overridden ? token.colorPrimary : token.colorTextSecondary }}
            >
              {effective ?? '—'}
            </div>
          </Tooltip>
        )}
        {showEnable && (
          <div className="flex items-center justify-center">
            <Switch
              checked={row.enable !== false}
              disabled={!editable}
              size="small"
              onChange={(checked) => {
                onChange(updateValueRow(rows, row.id, 'enable', checked))
              }}
            />
          </div>
        )}
        <div className="flex items-center justify-center">
          <Button
            danger
            disabled={!editable}
            icon={<TrashIcon size={14} />}
            type="text"
            onClick={() => {
              onChange(rows.filter((item) => item.id !== row.id))
            }}
          />
        </div>
      </div>
    )
  })
}

function ValueTable(props: {
  editable: boolean
  rows: ApiEnvironmentValue[]
  onChange: (nextRows: ApiEnvironmentValue[]) => void
  emptyText?: string
  showEnable?: boolean
  effectiveVarMap?: Map<string, string>
}) {
  const { token } = theme.useToken()
  const { editable, rows, onChange, emptyText, showEnable, effectiveVarMap } = props
  const headers = effectiveVarMap
    ? showEnable
      ? ['变量名', '值', '实际生效值', '启用', '']
      : ['变量名', '值', '实际生效值', '']
    : showEnable
      ? ['变量名', '值', '启用', '']
      : ['变量名', '值', '', '']

  return (
    <div style={{ border: `1px solid ${token.colorBorderSecondary}`, borderRadius: token.borderRadiusLG }}>
      <div className="grid" style={{ gridTemplateColumns: `repeat(${headers.length}, minmax(0, 1fr))` }}>
        {headers.map((header, i) => (
          <div
            key={i}
            className="px-3 py-2 text-sm"
            style={{ borderBottom: `1px solid ${token.colorBorderSecondary}`, color: token.colorTextSecondary }}
          >
            {header}
          </div>
        ))}
      </div>
      <ValueRowsTable
        editable={editable}
        emptyText={emptyText}
        rows={rows}
        showEnable={showEnable}
        effectiveVarMap={effectiveVarMap}
        onChange={onChange}
      />
    </div>
  )
}

export function ValueEditor(props: {
  editable: boolean
  title: string
  description: string
  rows: ApiEnvironmentValue[]
  onAdd: () => void
  onChange: (nextRows: ApiEnvironmentValue[]) => void
  showEnable?: boolean
  effectiveVarMap?: Map<string, string>
}) {
  const { editable, title, description, rows, onAdd, onChange, showEnable, effectiveVarMap } = props

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <Typography.Title level={5}>{title}</Typography.Title>
          <Typography.Paragraph className="!mb-0" type="secondary">{description}</Typography.Paragraph>
        </div>
        <Button disabled={!editable} icon={<PlusIcon size={14} />} onClick={onAdd}>
          添加
        </Button>
      </div>

      <ValueTable
        editable={editable}
        rows={rows}
        showEnable={showEnable}
        effectiveVarMap={effectiveVarMap}
        onChange={onChange}
      />
    </section>
  )
}

export function TabValueEditor(props: {
  editable: boolean
  rows: ApiEnvironmentValue[]
  onAdd: () => void
  onChange: (nextRows: ApiEnvironmentValue[]) => void
  emptyText?: string
  showEnable?: boolean
  showAdd?: boolean
}) {
  const { editable, rows, onAdd, onChange, emptyText, showEnable, showAdd = true } = props

  return (
    <div className="space-y-3 pt-3">
      {showAdd && (
        <div className="flex justify-end">
          <Button disabled={!editable} icon={<PlusIcon size={14} />} onClick={onAdd}>
            添加
          </Button>
        </div>
      )}
      <ValueTable
        editable={editable}
        emptyText={emptyText}
        rows={rows}
        showEnable={showEnable}
        onChange={onChange}
      />
    </div>
  )
}
