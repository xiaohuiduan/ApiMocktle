import { useTranslation } from 'react-i18next'

import { Tabs } from 'antd'

import { ApiTabContentWrapper } from '@/components/ApiTab/ApiTabContentWrapper'

import { FolderApiList } from './FolderApiList'
import { FolderSetting } from './FolderSetting'

export function Folder() {
  const { t } = useTranslation()

  return (
    <div>
      <Tabs
        animated={false}
        className="[&_>_.ant-tabs-nav]:!mx-4"
        items={[
          {
            key: 'settings',
            label: t('api.folder.settings'),
            children: (
              <ApiTabContentWrapper className="p-tabContent">
                <FolderSetting />
              </ApiTabContentWrapper>
            ),
          },
          {
            key: 'apis',
            label: t('api.folder.allApis'),
            children: (
              <ApiTabContentWrapper className="p-tabContent">
                <FolderApiList />
              </ApiTabContentWrapper>
            ),
          },
        ]}
      />
    </div>
  )
}
