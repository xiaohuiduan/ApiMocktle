import JsonView from 'react18-json-view'

import { useStyles } from '@/hooks/useStyle'

import 'react18-json-view/src/style.css'

interface JsonViewerProps {
  value?: string
}

function parseJsonValue(value: string) {
  try {
    return {
      parsed: JSON.parse(value) as unknown,
      valid: true,
    }
  }
  catch {
    return {
      parsed: value,
      valid: false,
    }
  }
}

export function JsonViewer(props: JsonViewerProps) {
  const { value } = props
  const { styles } = useStyles(({ token }, css) => {
    return {
      invalidJson: css({
        border: `1px solid ${token.colorBorderSecondary}`,
        borderRadius: token.borderRadius,
        overflow: 'hidden',
      }),
      invalidJsonHint: css({
        padding: `${token.paddingXS}px ${token.paddingSM}px`,
        color: token.colorWarningText,
        backgroundColor: token.colorWarningBg,
        borderBottom: `1px solid ${token.colorWarningBorder}`,
        fontSize: token.fontSizeSM,
      }),
      invalidJsonBody: css({
        margin: 0,
        padding: token.paddingSM,
        color: token.colorText,
        backgroundColor: token.colorFillAlter,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        fontSize: token.fontSizeSM,
      }),
    }
  })

  if (!value) {
    return null
  }

  const result = parseJsonValue(value)

  if (result.valid) {
    return <JsonView src={result.parsed} />
  }

  return (
    <div className={styles.invalidJson}>
      <div className={styles.invalidJsonHint}>示例不是合法 JSON，按原始文本显示</div>
      <pre className={styles.invalidJsonBody}>{String(result.parsed)}</pre>
    </div>
  )
}
