import { useTranslation } from 'react-i18next'

import { Button, Input, Switch, theme, Tooltip, Typography } from 'antd'
import type { TFunction } from 'i18next'
import { PlusIcon, TrashIcon } from 'lucide-react'

import { useStyles } from '@/hooks/useStyle'
import type { ApiEnvironmentValue } from '@/types'

/** 计算变量的最终生效值（会话变量 > 环境变量 > 全局），无法解析时回退到原值 */
function resolveEffectiveValue(
  row: ApiEnvironmentValue,
  effectiveVarMap?: Map<string, string>,
): string | undefined {
  if (!effectiveVarMap || !row.name) {
    return row.value ?? undefined
  }

  if (effectiveVarMap.has(row.name)) {
    return effectiveVarMap.get(row.name)
  }

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

interface ValueColumn {
  key: 'name' | 'value' | 'effective' | 'enable' | 'remove'
  title: string
  width: string
  align?: 'center'
}

/**
 * 表头与数据行共用同一列定义，避免列宽/列数不一致导致错位。
 *
 * 必须是函数：表头文案随语言变化，模块顶层求值会在加载时固定住。
 */
function createValueColumns(t: TFunction, showEffective: boolean, showEnable: boolean): ValueColumn[] {
  const columns: ValueColumn[] = [
    { key: 'name', title: t('settings.valueTable.name'), width: 'minmax(0,1fr)' },
    { key: 'value', title: t('settings.valueTable.value'), width: 'minmax(0,1.2fr)' },
  ]

  if (showEffective) {
    columns.push({ key: 'effective', title: t('settings.valueTable.effective'), width: 'minmax(0,1.2fr)' })
  }

  if (showEnable) {
    columns.push({ key: 'enable', title: t('settings.valueTable.enable'), width: '60px', align: 'center' })
  }

  columns.push({ key: 'remove', title: '', width: '56px', align: 'center' })

  return columns
}

function ValueRowsTable(props: {
  editable: boolean
  rows: ApiEnvironmentValue[]
  gridTemplateColumns: string
  dividerClass?: string
  onChange: (nextRows: ApiEnvironmentValue[]) => void
  emptyText?: string
  showEnable?: boolean
  effectiveVarMap?: Map<string, string>
}) {
  const { token } = theme.useToken()
  const { t } = useTranslation()
  const {
    editable,
    rows,
    gridTemplateColumns,
    dividerClass,
    onChange,
    emptyText = t('settings.valueTable.emptyText'),
    showEnable,
    effectiveVarMap,
  } = props

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
        className={`grid ${dividerClass ?? ''}`}
        style={{
          gridTemplateColumns,
          borderBottom: index === rows.length - 1 ? 'none' : `1px solid ${token.colorBorderSecondary}`,
        }}
      >
        <Input
          disabled={!editable}
          placeholder={t('settings.valueTable.addVariable')}
          value={row.name}
          variant="borderless"
          onChange={(event) => {
            onChange(updateValueRow(rows, row.id, 'name', event.target.value))
          }}
        />
        <Input
          disabled={!editable}
          placeholder={t('settings.valueTable.value')}
          value={row.value}
          variant="borderless"
          onChange={(event) => {
            onChange(updateValueRow(rows, row.id, 'value', event.target.value))
          }}
        />
        {effectiveVarMap && (
          <Tooltip title={overridden ? t('settings.valueTable.overridden') : t('settings.valueTable.effectiveNow')}>
            <div
              className="flex items-center truncate px-3 text-xs"
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
  const { t } = useTranslation()
  const { editable, rows, onChange, emptyText, showEnable, effectiveVarMap } = props
  const columns = createValueColumns(t, !!effectiveVarMap, !!showEnable)
  const gridTemplateColumns = columns.map((column) => column.width).join(' ')
  const { styles } = useStyles(({ token: t }, cssFn) => ({
    columnDivider: cssFn({
      '& > * + *': {
        borderLeft: `1px solid ${t.colorBorderSecondary}`,
      },
    }),
  }))

  return (
    <div style={{ border: `1px solid ${token.colorBorderSecondary}`, borderRadius: token.borderRadiusLG }}>
      <div className={`grid ${styles.columnDivider}`} style={{ gridTemplateColumns }}>
        {columns.map((column) => (
          <div
            key={column.key}
            className={`px-3 py-2 text-sm ${column.align === 'center' ? 'text-center' : ''}`}
            style={{ borderBottom: `1px solid ${token.colorBorderSecondary}`, color: token.colorTextSecondary }}
          >
            {column.title}
          </div>
        ))}
      </div>
      <ValueRowsTable
        dividerClass={styles.columnDivider}
        editable={editable}
        effectiveVarMap={effectiveVarMap}
        emptyText={emptyText}
        gridTemplateColumns={gridTemplateColumns}
        rows={rows}
        showEnable={showEnable}
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
  const { t } = useTranslation()
  const { editable, title, description, rows, onAdd, onChange, showEnable, effectiveVarMap } = props

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <Typography.Title level={5}>{title}</Typography.Title>
          <Typography.Paragraph className="!mb-0" type="secondary">{description}</Typography.Paragraph>
        </div>
        <Button disabled={!editable} icon={<PlusIcon size={14} />} onClick={onAdd}>
          {t('common.add')}
        </Button>
      </div>

      <ValueTable
        editable={editable}
        effectiveVarMap={effectiveVarMap}
        rows={rows}
        showEnable={showEnable}
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
  const { t } = useTranslation()
  const { editable, rows, onAdd, onChange, emptyText, showEnable, showAdd = true } = props

  return (
    <div className="space-y-3 pt-3">
      {showAdd && (
        <div className="flex justify-end">
          <Button disabled={!editable} icon={<PlusIcon size={14} />} onClick={onAdd}>
            {t('common.add')}
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
