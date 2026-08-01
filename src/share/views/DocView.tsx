import { Viewer } from '@bytemd/react'

import 'bytemd/dist/index.css'

export function DocView({ data }: { data: unknown }) {
  const doc = (data ?? {}) as { content?: string }
  const content = doc.content ?? ''

  return (
    <div className="p-4">
      <Viewer value={content} />
    </div>
  )
}
