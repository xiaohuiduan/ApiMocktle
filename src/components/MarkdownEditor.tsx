import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import gfm from '@bytemd/plugin-gfm'
import { Editor, type EditorProps } from '@bytemd/react'

import { useStyles } from '@/hooks/useStyle'

import 'bytemd/dist/index.css'
import { css } from '@emotion/css'

/**
 * bytemd 的语言包 key 与 i18n key 的对应表。
 *
 * bytemd 的 `locale` 只接受完整对象，不支持 i18next 的按需取词，
 * 因此这里集中列一次映射，渲染期按当前语言整包派生。
 */
const BYTEMD_LOCALE_KEYS = {
  bold: 'ui.markdown.bold',
  boldText: 'ui.markdown.boldText',
  cheatsheet: 'ui.markdown.cheatsheet',
  closeHelp: 'ui.markdown.closeHelp',
  closeToc: 'ui.markdown.closeToc',
  code: 'ui.markdown.code',
  codeBlock: 'ui.markdown.codeBlock',
  codeLang: 'ui.markdown.codeLang',
  codeText: 'ui.markdown.codeText',
  exitFullscreen: 'ui.markdown.exitFullscreen',
  exitPreviewOnly: 'ui.markdown.exitPreviewOnly',
  exitWriteOnly: 'ui.markdown.exitWriteOnly',
  fullscreen: 'ui.markdown.fullscreen',
  h1: 'ui.markdown.h1',
  h2: 'ui.markdown.h2',
  h3: 'ui.markdown.h3',
  h4: 'ui.markdown.h4',
  h5: 'ui.markdown.h5',
  h6: 'ui.markdown.h6',
  headingText: 'ui.markdown.headingText',
  help: 'ui.markdown.help',
  hr: 'ui.markdown.hr',
  image: 'ui.markdown.image',
  imageAlt: 'ui.markdown.imageAlt',
  imageTitle: 'ui.markdown.imageTitle',
  italic: 'ui.markdown.italic',
  italicText: 'ui.markdown.italicText',
  limited: 'ui.markdown.limited',
  lines: 'ui.markdown.lines',
  link: 'ui.markdown.link',
  linkText: 'ui.markdown.linkText',
  ol: 'ui.markdown.ol',
  olItem: 'ui.markdown.olItem',
  preview: 'ui.markdown.preview',
  previewOnly: 'ui.markdown.previewOnly',
  quote: 'ui.markdown.quote',
  quotedText: 'ui.markdown.quotedText',
  shortcuts: 'ui.markdown.shortcuts',
  source: 'ui.markdown.source',
  sync: 'ui.markdown.sync',
  toc: 'ui.markdown.toc',
  top: 'ui.markdown.top',
  ul: 'ui.markdown.ul',
  ulItem: 'ui.markdown.ulItem',
  words: 'ui.markdown.words',
  write: 'ui.markdown.write',
  writeOnly: 'ui.markdown.writeOnly',
} as const

type BytemdLocaleKey = keyof typeof BYTEMD_LOCALE_KEYS

export function MarkdownEditor(
  props: EditorProps & { className?: string, style?: React.CSSProperties },
) {
  const { className, style, ...rest } = props

  const { t } = useTranslation()

  const plugins = [gfm()]

  // 第三方组件（bytemd）自带英文语言包：按当前界面语言整包派生，
  // 这样切换语言时随 React 重渲染一起更新。
  const locale = useMemo(() => {
    const entries = Object.entries(BYTEMD_LOCALE_KEYS).map(([field, key]) => [field, t(key)])

    return Object.fromEntries(entries) as Record<BytemdLocaleKey, string>
  }, [t])

  const { styles } = useStyles(({ token }) => {
    const editor = css({
      height: '100%',

      '> div': {
        height: '100%',

        '.bytemd': {
          height: '100%',
          borderColor: token.colorBorderSecondary,
          borderLeft: 'none',
          borderRight: 'none',
          borderBottom: 'none',
          backgroundColor: token.colorBgContainer,
          color: token.colorText,

          '.CodeMirror': {
            backgroundColor: token.colorBgContainer,
            color: token.colorText,

            '&.cm-s-default': {
              '.cm-header': {
                color: token.colorPrimary,
              },

              '.cm-link': {
                color: token.colorInfo,
              },

              '.cm-def': {
                color: token.colorError,
              },

              '.cm-keyword': {
                color: token.colorWarningActive,
              },

              '.cm-quote': {
                color: token.colorSuccessActive,
              },

              '.cm-variable-2': {
                color: token.colorInfoActive,
              },
            },
          },

          '.bytemd-toolbar': {
            backgroundColor: token.colorBgContainer,
            borderColor: token.colorBorderSecondary,

            '.bytemd-toolbar-icon': {
              color: token.colorTextSecondary,

              '&:hover': {
                backgroundColor: token.colorFillSecondary,
              },
            },
          },

          '.bytemd-preview': {
            borderColor: token.colorBorderSecondary,
          },

          '.bytemd-status': {
            borderColor: token.colorBorderSecondary,
          },
        },
      },
    })

    return {
      editor,
    }
  })

  return (
    <div className={`${className ?? ''} ${styles.editor}`} style={style}>
      <Editor
        locale={locale}
        plugins={plugins}
        {...rest}
      />
    </div>
  )
}
