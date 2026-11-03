import { Select, theme, Tooltip } from 'antd'

import { BodyType } from '@/enums'

/**
 * Body 的内容载体槽位。
 *
 * 这是理解本组件的关键：请求体只有**两个**数据槽位，7 种类型共享它们——
 * - `parameters`：form-data 与 url-encoded 共用同一份参数表格；
 * - `raw`：json / xml / raw / binary 共用同一段正文。
 *
 * 因此「有没有内容」属于槽位，不属于类型。按类型逐个标绿会让 4 个类型同时亮，
 * 让人误以为可以并列传多种 body——那正是旧标签布局的问题根源。
 */
export type BodySlot = 'none' | 'parameters' | 'raw'

export interface BodyTypeOption {
  value: BodyType
  /** 短标签，同时作为 Select 的 title（测试与无障碍定位依赖它保持纯字符串） */
  label: string
  /** 下拉次要文本，取 BodyType 枚举的 MIME 值；none 无 MIME */
  mime?: string
  slot: BodySlot
}

export const BODY_TYPE_OPTIONS: BodyTypeOption[] = [
  { value: BodyType.None, label: 'none', slot: 'none' },
  { value: BodyType.FormData, label: 'form-data', mime: BodyType.FormData, slot: 'parameters' },
  { value: BodyType.UrlEncoded, label: 'url-encoded', mime: BodyType.UrlEncoded, slot: 'parameters' },
  { value: BodyType.Json, label: 'json', mime: BodyType.Json, slot: 'raw' },
  { value: BodyType.Xml, label: 'xml', mime: BodyType.Xml, slot: 'raw' },
  { value: BodyType.Raw, label: 'raw', mime: BodyType.Raw, slot: 'raw' },
  { value: BodyType.Binary, label: 'binary', mime: BodyType.Binary, slot: 'raw' },
]

const BODY_TYPE_MAP = new Map<string, BodyTypeOption>(
  BODY_TYPE_OPTIONS.map((option) => [option.value, option]),
)

/** 内容槽位的展示信息，供分组标题与角标 Tooltip 复用 */
export const BODY_SLOT_META: Record<Exclude<BodySlot, 'none'>, { title: string, hint: string }> = {
  parameters: { title: '表单参数', hint: 'form-data / url-encoded' },
  raw: { title: '正文', hint: 'json / xml / raw / binary' },
}

export interface BodyTypeGroup {
  slot: BodySlot
  label: string
  options: BodyTypeOption[]
}

export const BODY_TYPE_GROUPS: BodyTypeGroup[] = [
  { slot: 'none', label: '无请求体', options: BODY_TYPE_OPTIONS.filter((o) => o.slot === 'none') },
  { slot: 'parameters', label: BODY_SLOT_META.parameters.title, options: BODY_TYPE_OPTIONS.filter((o) => o.slot === 'parameters') },
  { slot: 'raw', label: BODY_SLOT_META.raw.title, options: BODY_TYPE_OPTIONS.filter((o) => o.slot === 'raw') },
]

/** 取类型的短标签；枚举外的历史值原样返回，供提示文案使用 */
export function getBodyTypeLabel(type: BodyType | string | undefined): string {
  if (type === undefined) { return '' }

  return BODY_TYPE_MAP.get(type)?.label ?? String(type)
}

interface BodyTypeSelectProps {
  value: BodyType
  onChange: (type: BodyType) => void
  /** 哪些槽位有内容。由调用方按自己的数据源判定，组件只负责渲染。 */
  filledSlots?: BodySlot[]
  disabled?: boolean
  className?: string
}

/**
 * Body 类型单选下拉。
 *
 * 用下拉而非并列标签，是为了让「同一请求只能有一种 body」在形态上就成立；
 * 按槽位分组，是为了把「4 个类型共用一段正文」这件事说清楚，而不是给每个类型挂绿点。
 */
export function BodyTypeSelect(props: BodyTypeSelectProps) {
  const { value, onChange, filledSlots, disabled, className } = props
  const { token } = theme.useToken()

  const filled = filledSlots ?? []
  const current = BODY_TYPE_MAP.get(value)
  const currentSlot = current?.slot
  // 当前视图之外仍有内容的槽位（最多 2 个：当前为 none 且两槽位都有内容时）
  const hiddenSlots = (['parameters', 'raw'] as const).filter(
    (slot) => slot !== currentSlot && filled.includes(slot),
  )

  const dot = (
    <span
      aria-hidden
      className="inline-block size-[5px] shrink-0 rounded-full"
      data-testid="body-type-dot"
      style={{ backgroundColor: token.colorSuccess }}
    />
  )

  const options = BODY_TYPE_GROUPS.map((group) => ({
    label: (
      <span className="inline-flex items-center gap-1" style={{ color: token.colorTextTertiary }}>
        {group.label}
        {group.slot !== 'none' && filled.includes(group.slot) ? dot : null}
      </span>
    ),
    title: group.label,
    options: group.options.map((option) => ({ value: option.value, label: option.label })),
  }))

  const select = (
    <Select
      className="min-w-[130px]"
      disabled={disabled}
      labelRender={(props) => {
        const meta = BODY_TYPE_MAP.get(String(props.value))

        if (!meta) {
          // 枚举外的历史值：原样显示并标警示色，绝不静默改写成 none
          return <span style={{ color: token.colorWarning }}>{String(props.value)}</span>
        }

        return (
          <span className="inline-flex items-center gap-1">
            {meta.label}
            {meta.slot !== 'none' && filled.includes(meta.slot) ? dot : null}
          </span>
        )
      }}
      optionRender={(option) => {
        const meta = BODY_TYPE_MAP.get(String(option.value))

        if (!meta) { return option.label }

        return (
          <span className="flex items-center gap-2">
            <span>{meta.label}</span>
            <span className="text-xs" style={{ color: token.colorTextTertiary }}>
              {meta.mime ?? '不发送请求体'}
            </span>
          </span>
        )
      }}
      options={options}
      popupMatchSelectWidth={false}
      size="small"
      value={value}
      onChange={(next) => { onChange(next as BodyType) }}
    />
  )

  return (
    <span
      className={className ? `inline-flex items-center gap-1 ${className}` : 'inline-flex items-center gap-1'}
      data-testid="body-type-select"
    >
      {current
        ? select
        : (
            <Tooltip title={`未知 Body 类型「${String(value)}」，发送时将不带请求体`}>
              {select}
            </Tooltip>
          )}

      {hiddenSlots.length > 0 && (
        <Tooltip
          title={`另有内容：${hiddenSlots.map((slot) => `${BODY_SLOT_META[slot].title}（${BODY_SLOT_META[slot].hint}）`).join('、')}`}
        >
          <span
            aria-hidden
            className="cursor-default select-none text-xs"
            data-testid="body-type-extra-badge"
            style={{ color: token.colorTextTertiary }}
          >
            {`+${hiddenSlots.length}`}
          </span>
        </Tooltip>
      )}
    </span>
  )
}
