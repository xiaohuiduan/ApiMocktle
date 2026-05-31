import { useParams } from 'react-router'
import { TestFlowEditor } from '@/features/test-flow/components/TestFlowEditor'

export default function TestTaskDetailPage() {
  const { projectId, taskId } = useParams<{ projectId: string; taskId: string }>()

  if (!projectId || !taskId) {
    return <div>参数错误</div>
  }

  return <TestFlowEditor taskId={taskId} projectId={projectId} />
}
