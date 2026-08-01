import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'

import { Editor, type EditorProps } from '@monaco-editor/react'
import { merge } from 'lodash-es'

import type { UnsafeAny } from '@/types'
import { deserialize, isPureObject, serialize } from '@/utils'

type EditorMountParams = Parameters<NonNullable<EditorProps['onMount']>>
type EditorInstance = EditorMountParams[0]
type MonacoInstance = EditorMountParams[1]

const defaultEditorOptions: EditorProps['options'] = {
  tabSize: 2,
  minimap: { enabled: false },
  autoIndent: 'full',
}

/** 变量自动补全项（输入 {{ 后触发） */
export interface VariableCompletionItem {
  label: string
  detail?: string
}

export interface MonacoEditorProps<ValueType = unknown>
  extends Omit<EditorProps, 'value' | 'onChange' | 'defaultValue'> {
  defaultValue?: ValueType
  value?: ValueType
  onChange?: (value: MonacoEditorProps['value']) => void

  /** 是否在 onChange 事件触发前反序列化字符串。 */
  deserializeOnChange?: boolean
  useDefaultValue?: boolean

  /** 变量补全项列表；传入后输入 {{ 时自动补全（仅文本输入场景使用） */
  completionItems?: VariableCompletionItem[]
}

export interface MonacoEditorRef<ValueType = unknown> {
  editor: EditorInstance | undefined
  monaco: MonacoInstance | undefined
  getDeserializeValue: () => ValueType
}

/** 注册 {{ 触发的变量补全 provider，返回 dispose 函数 */
function registerVariableCompletions(
  monaco: MonacoInstance,
  language: string,
  items: VariableCompletionItem[],
): () => void {
  const disposable = monaco.languages.registerCompletionItemProvider(language, {
    triggerCharacters: ['{'],
    provideCompletionItems: (model, position) => {
      // 仅当光标前存在未闭合的 {{ 时提供补全，避免干扰普通代码输入
      const textBefore = model.getValueInRange({
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      })
      const lastOpen = textBefore.lastIndexOf('{{')
      const lastClose = textBefore.lastIndexOf('}}')

      if (lastOpen < 0 || lastOpen < lastClose) {
        return { suggestions: [] }
      }

      const filter = textBefore.slice(lastOpen + 2)
      const word = model.getWordUntilPosition(position)
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      }

      const suggestions = items
        .filter((it) => {
          const f = filter.toLowerCase()

          return f.startsWith('$')
            ? it.label.toLowerCase().startsWith(f)
            : it.label.toLowerCase().includes(f)
        })
        .map((it) => ({
          label: it.label,
          detail: it.detail,
          kind: monaco.languages.CompletionItemKind.Variable,
          insertText: it.label,
          range,
        }))

      return { suggestions }
    },
  })

  return () => {
    disposable.dispose()
  }
}

function EditorX<ValueType = unknown>(
  props: MonacoEditorProps<ValueType>,
  ref: React.Ref<MonacoEditorRef<ValueType>>,
) {
  const {
    defaultValue,
    value = defaultValue,
    onChange,
    deserializeOnChange = true,
    useDefaultValue,
    completionItems,
    ...editorProps
  } = props

  const [editorMounted, setEditorMounted] = useState(false)

  const editorRef = useRef<EditorInstance>()
  const monacoRef = useRef<MonacoInstance>()
  // 保存 completion provider 的 dispose，避免重复挂载时泄漏
  const completionDisposeRef = useRef<(() => void) | null>(null)

  // completionItems 变化时重新注册补全 provider（用户变量更新后补全项同步刷新）
  const completionItemsKey = completionItems ? completionItems.map((it) => it.label).join(',') : ''
  useEffect(() => {
    if (!editorMounted || !completionItems || completionItems.length === 0) { return }

    const editor = editorRef.current
    const monaco = monacoRef.current

    if (!editor || !monaco) { return }

    completionDisposeRef.current?.()
    const language = editor.getModel()?.getLanguageId() ?? 'json'
    completionDisposeRef.current = registerVariableCompletions(monaco, language, completionItems)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completionItemsKey, editorMounted])

  useImperativeHandle(
    ref,
    () => {
      return {
        editor: editorRef.current,
        monaco: monacoRef.current,
        getDeserializeValue: () => deserialize(editorRef.current?.getValue()) as ValueType,
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editorMounted],
  )

  // 转换 value 为字符串，以便编辑器能正确显示。
  const getEditorValue = (value: UnsafeAny): string | undefined => {
    if (isPureObject(value)) {
      return serialize(value, 2)
    }

    // 确保 undefined 和 null 被转换为空字符串，以便编辑器能正确更新
    if (value === undefined || value === null) {
      return ''
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return value
  }

  const valueObj = useDefaultValue
    ? { defaultValue: getEditorValue(value) }
    : { value: getEditorValue(value) }

  return (
    <>
      <Editor
        defaultLanguage="javascript"
        loading="初次加载可能耗时较久，请耐心等待..."
        {...editorProps}
        {...valueObj}
        options={merge({ readOnly: false }, defaultEditorOptions, editorProps.options)}
        onChange={(val) => {
          let changedValue: UnsafeAny

          try {
            changedValue = deserializeOnChange ? deserialize(val) : val
          }
          catch {
            changedValue = val
          }

          onChange?.(changedValue)
        }}
        onMount={(editor, monaco) => {
          editorProps.onMount?.(editor, monaco)
          editorRef.current = editor
          monacoRef.current = monaco
          // 确保编辑器始终可编辑
          editor.updateOptions({ readOnly: false })
          setEditorMounted(true)
        }}
      />
    </>
  )
}

/**
 * 对 monaco editor 进行简单的封装，使其更容易适配表单受控组件（即 value/onChange 的受控形式）。
 */
export const MonacoEditor = forwardRef(EditorX)
