import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router'

import { TestFlowEditor } from '@/features/test-flow/components/TestFlowEditor'

export default function TestTaskDetailPage() {
  const { t } = useTranslation()
  const { projectId, taskId } = useParams<{ projectId: string, taskId: string }>()

  if (!projectId || !taskId) {
    return <div>{t('app.tests.invalidParams')}</div>
  }

  return <TestFlowEditor projectId={projectId} taskId={taskId} />
}
