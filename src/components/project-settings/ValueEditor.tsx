import { Button, Input, Switch, Typography, theme } from 'antd'
import { PlusIcon, TrashIcon } from 'lucide-react'

import type { ApiEnvironmentValue } from '@/types'

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
}) {
  const { token } = theme.useToken()
  const { editable, rows, onChange, emptyText = '当前还没有内容，点击右上角"添加"开始配置。', showEnable } = props

  if (rows.length === 0) {
    return (
      <div className="px-3 py-6 text-center" style={{ color: token.colorTextSecondary }}>
        {emptyText}
      </div>
    )
  }

  return rows.map((row, index) => (
    <div
      key={row.id}
      className="grid"
      style={{
        gridTemplateColumns: showEnable
          ? 'minmax(0,1fr) minmax(0,1.5fr) 60px 56px'
          : 'minmax(0,1fr) minmax(0,1.5fr) minmax(0,1.5fr) 56px',
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
  ))
}

function ValueTable(props: {
  editable: boolean
  rows: ApiEnvironmentValue[]
  onChange: (nextRows: ApiEnvironmentValue[]) => void
  emptyText?: string
  showEnable?: boolean
}) {
  const { token } = theme.useToken()
  const { editable, rows, onChange, emptyText, showEnable } = props
  const headers = showEnable ? ['变量名', '值', '启用', ''] : ['变量名', '值', '', '']

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
      <ValueRowsTable editable={editable} emptyText={emptyText} rows={rows} showEnable={showEnable} onChange={onChange} />
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
}) {
  const { editable, title, description, rows, onAdd, onChange, showEnable } = props

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

      <ValueTable editable={editable} rows={rows} showEnable={showEnable} onChange={onChange} />
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
}) {
  const { editable, rows, onAdd, onChange, emptyText, showEnable } = props

  return (
    <div className="space-y-3 pt-3">
      <div className="flex justify-end">
        <Button disabled={!editable} icon={<PlusIcon size={14} />} onClick={onAdd}>
          添加
        </Button>
      </div>
      <ValueTable editable={editable} emptyText={emptyText} rows={rows} showEnable={showEnable} onChange={onChange} />
    </div>
  )
}
