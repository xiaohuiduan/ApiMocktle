import type { TabsProps } from 'antd'

import type { TabContentType } from '@/types'

import type { PageTabStatus } from './ApiTab.enum'

/** 页签编辑状态：changed=有未保存修改，saving=保存中，saved=已保存，error=保存失败 */
export type EditStatus = 'changed' | 'saved' | 'saving' | 'error'

export type Tab = NonNullable<TabsProps['items']>[0]

export interface ApiTabItem extends Pick<Tab, 'key' | 'label'> {
  /** 页签内容类型。 */
  contentType: TabContentType
  /** 页签附加数据。 */
  data?: Record<string, unknown> & {
    editStatus?: EditStatus
    tabStatus?: PageTabStatus
  }
}
