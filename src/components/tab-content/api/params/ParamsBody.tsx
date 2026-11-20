import { useTranslation } from 'react-i18next'

import { Flex, theme } from 'antd'

import { SchemaType } from '@/components/JsonSchema'
import { JsonSchemaCard } from '@/components/JsonSchemaCard'
import { BodyType } from '@/enums'
import { useStyles } from '@/hooks/useStyle'
import type { ApiDetails, ApiEnvironmentValue } from '@/types'

import { type BodySlot, BodyTypeSelect } from '../components/BodyTypeSelect'
import { ParamsEditableTable } from '../components/ParamsEditableTable'

import { GlobalParametersNotice } from './GlobalParametersNotice'

/**
 * 文档编辑态的内容槽位判定。
 *
 * 与运行态刻意不同：这一侧 json / xml 的内容载体是 `jsonSchema`（结构化编辑器），
 * raw / binary 才是 `rawText`。运行态发送时只读 `rawText`，故两处不能共用同一谓词。
 */
function getFilledSlots(value: ApiDetails['requestBody'] | undefined): BodySlot[] {
  if (!value) { return [] }

  const slots: BodySlot[] = []

  if ((value.parameters ?? []).some((p) => p.name && p.enable !== false)) {
    slots.push('parameters')
  }

  const schema = value.jsonSchema as { properties?: unknown[] } | undefined
  const hasSchema = !!schema?.properties?.length

  if (hasSchema || value.rawText?.trim()) {
    slots.push('raw')
  }

  return slots
}

interface BodyCompProps {
  value?: ApiDetails['requestBody']
  onChange?: (value: BodyCompProps['value']) => void
}

function BodyComp(props: BodyCompProps) {
  const { value, onChange } = props
  const { t } = useTranslation()

  const { styles } = useStyles(({ token }, css) => {
    return {
      bodyNone: css({
        color: token.colorTextQuaternary,
        border: `1px solid ${token.colorFillSecondary}`,
      }),
    }
  })

  if (!value) {
    return '-'
  }

  if (value.type === BodyType.None) {
    return (
      <div className={`flex h-24 items-center justify-center rounded ${styles.bodyNone}`}>
        {t('api.body.noBodyBody')}
      </div>
    )
  }

  if (value.type === BodyType.FormData || value.type === BodyType.UrlEncoded) {
    return (
      <ParamsEditableTable
        exampleColumnTitle={t('api.doc.exampleValue')}
        value={value.parameters}
        onChange={(values) => {
          onChange?.({ ...value, parameters: values })
        }}
      />
    )
  }

  if (value.type === BodyType.Json || value.type === BodyType.Xml) {
    return (
      <JsonSchemaCard
        defaultValue={{ type: SchemaType.Object, properties: [] }}
        editorProps={{ defaultExpandAll: true }}
        value={value.jsonSchema}
        onChange={(values) => {
          onChange?.({ ...value, jsonSchema: values })
        }}
      />
    )
  }

  return '-'
}

interface ParamsBodyProps {
  globalRows?: ApiEnvironmentValue[]
  value?: ApiDetails['requestBody']
  onChange?: (value: ParamsBodyProps['value']) => void
}

export function ParamsBody(props: ParamsBodyProps) {
  const { globalRows, value, onChange } = props
  const { token } = theme.useToken()
  const { t } = useTranslation()

  const selectedType = value?.type ?? BodyType.None
  const bodyParamNames = new Set(
    (value?.parameters ?? [])
      .filter((item) => item.name && item.enable !== false)
      .map((item) => item.name!),
  )
  const supportsGlobalBodyParams = selectedType === BodyType.FormData || selectedType === BodyType.UrlEncoded
  const filledSlots = getFilledSlots(value)

  return (
    <div>
      <Flex align="center" className="p-2" gap={8}>
        <span className="text-xs" style={{ color: token.colorTextSecondary }}>{t('api.body.typeLabel')}</span>
        <BodyTypeSelect
          filledSlots={filledSlots}
          value={selectedType}
          onChange={(type) => { onChange?.({ ...value, type }) }}
        />
      </Flex>

      <div>
        <GlobalParametersNotice
          description={supportsGlobalBodyParams
            ? t('api.body.globalBodyActive')
            : t('api.body.globalBodyInactive', { type: selectedType })}
          overriddenNames={bodyParamNames}
          rows={globalRows}
          title={t('api.body.globalBodyTitle')}
        />
        <BodyComp value={value ?? { type: BodyType.None }} onChange={onChange} />
      </div>
    </div>
  )
}
