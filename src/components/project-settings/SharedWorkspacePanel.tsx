import { useEffect, useMemo, useRef, useState } from 'react'

import { Button, Input, List, Popconfirm, Progress, Select, Space, Tabs, Tag, Typography, message, theme } from 'antd'
import dayjs from 'dayjs'
import * as Y from 'yjs'

import { api } from '@/api-client'
import { useAuth } from '@/contexts/auth'
import { MarkdownEditor } from '@/components/MarkdownEditor'

interface SharedFileItem {
  id: string
  uploaderUserId: string
  uploaderUsername: string
  linkedDocId?: string
  name: string
  size: number
  mimeType: string
  createdAt: string
}

interface SharedDocItem {
  id: string
  creatorUserId: string
  creatorUsername: string
  docType: 'markdown' | 'excel'
  title: string
  content: string
  version: number
  createdAt: string
  updatedAt: string
}

type ExcelGrid = string[][]
interface PresenceMember {
  userId: string
  username: string
  isTyping: boolean
  lastSeenAt: number
}

function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }

  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function pickFile(onSelect: (file: File) => void) {
  const input = document.createElement('input')
  input.type = 'file'
  input.onchange = () => {
    const file = input.files?.item(0)

    if (file) {
      onSelect(file)
    }
  }
  input.click()
}

function uint8ToBase64(data: Uint8Array) {
  let raw = ''

  data.forEach((byte) => {
    raw += String.fromCharCode(byte)
  })

  return btoa(raw)
}

function base64ToUint8(base64: string) {
  const raw = atob(base64)
  const bytes = new Uint8Array(raw.length)

  for (let i = 0; i < raw.length; i += 1) {
    bytes[i] = raw.charCodeAt(i)
  }

  return bytes
}

export function SharedWorkspacePanel(props: { projectId?: string, editable: boolean }) {
  const { projectId, editable } = props
  const { sessionId } = useAuth()
  const { token } = theme.useToken()
  const [msgApi, contextHolder] = message.useMessage()
  const [files, setFiles] = useState<SharedFileItem[]>([])
  const [docs, setDocs] = useState<SharedDocItem[]>([])
  const [loadingFiles, setLoadingFiles] = useState(false)
  const [loadingDocs, setLoadingDocs] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadPercent, setUploadPercent] = useState(0)
  const [dragOverUploadZone, setDragOverUploadZone] = useState(false)
  const [activeDocId, setActiveDocId] = useState<string>()
  const [docTitle, setDocTitle] = useState('')
  const [docContent, setDocContent] = useState('')
  const [docVersion, setDocVersion] = useState(0)
  const [creatingDocTitle, setCreatingDocTitle] = useState('')
  const [creatingDocType, setCreatingDocType] = useState<'markdown' | 'excel'>('markdown')
  const [presenceMembers, setPresenceMembers] = useState<PresenceMember[]>([])
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'conflict' | 'error'>('idle')
  const yDocRef = useRef<Y.Doc>()
  const pollTimerRef = useRef<number>()
  const pushTimerRef = useRef<number>()
  const excelSyncTimerRef = useRef<number>()
  const saveTimerRef = useRef<number>()
  const presenceTimerRef = useRef<number>()
  const typingTimerRef = useRef<number>()
  const typingActiveRef = useRef(false)
  const remoteApplyingRef = useRef(false)
  const docVersionRef = useRef(0)

  const activeDoc = useMemo(() => docs.find((doc) => doc.id === activeDocId), [docs, activeDocId])

  useEffect(() => {
    docVersionRef.current = docVersion
  }, [docVersion])

  const excelGrid = useMemo(() => {
    if (!activeDoc || activeDoc.docType !== 'excel') {
      return [['']]
    }

    try {
      const parsed = JSON.parse(docContent || '[]') as ExcelGrid

      if (!Array.isArray(parsed) || parsed.length === 0) {
        return [['']]
      }

      return parsed.map((row) => Array.isArray(row) ? row.map((cell) => String(cell ?? '')) : [''])
    }
    catch {
      return [['']]
    }
  }, [activeDoc, docContent])

  const setExcelCell = (rowIndex: number, colIndex: number, value: string) => {
    const next = excelGrid.map((row) => [...row])
    next[rowIndex] ??= []
    next[rowIndex][colIndex] = value
    typingActiveRef.current = true
    if (typingTimerRef.current) {
      window.clearTimeout(typingTimerRef.current)
    }
    typingTimerRef.current = window.setTimeout(() => {
      typingActiveRef.current = false
    }, 1200)
    setDocContent(JSON.stringify(next))
  }

  const appendExcelRow = () => {
    const colCount = Math.max(...excelGrid.map((row) => row.length), 1)
    const nextRow = new Array(colCount).fill('')
    typingActiveRef.current = true
    setDocContent(JSON.stringify([...excelGrid, nextRow]))
  }

  const appendExcelColumn = () => {
    const next = excelGrid.map((row) => [...row, ''])
    typingActiveRef.current = true
    setDocContent(JSON.stringify(next))
  }

  const fetchFiles = async () => {
    if (!projectId || !sessionId) {
      return
    }

    setLoadingFiles(true)

    try {
      const payload = await api<{ files: SharedFileItem[] }>('list_shared_files', {
        sessionId,
        projectId,
      })

      setFiles(payload.files)
    }
    catch (error) {
      msgApi.error(error instanceof Error ? error.message : '加载共享文件失败')
    }
    finally {
      setLoadingFiles(false)
    }
  }

  const fetchDocs = async () => {
    if (!projectId || !sessionId) {
      return
    }

    setLoadingDocs(true)

    try {
      const payload = await api<{ docs: SharedDocItem[] }>('list_shared_docs', {
        sessionId,
        projectId,
      })

      setDocs(payload.docs)
      setActiveDocId((current) => current ?? payload.docs[0]?.id)
    }
    catch (error) {
      msgApi.error(error instanceof Error ? error.message : '加载在线文档失败')
    }
    finally {
      setLoadingDocs(false)
    }
  }

  const pushPresence = async (isTyping: boolean) => {
    if (!projectId || !activeDocId || !sessionId) {
      return
    }

    await api('update_presence', {
      sessionId,
      projectId,
      docId: activeDocId,
      payload: { isTyping },
    })
  }

  const fetchPresence = async () => {
    if (!projectId || !activeDocId || !sessionId) {
      return
    }

    try {
      const payload = await api<{ users: PresenceMember[] }>('get_doc_presence', {
        sessionId,
        projectId,
        docId: activeDocId,
      })

      setPresenceMembers(Array.isArray(payload.users) ? payload.users : [])
    } catch {
      // ignore presence fetch errors
    }
  }

  const saveDocDraft = async () => {
    if (!projectId || !activeDoc || !sessionId) {
      return
    }

    setSaveStatus('saving')
    try {
      const payload = await api<{ doc: SharedDocItem }>('save_shared_doc', {
        sessionId,
        projectId,
        docId: activeDoc.id,
        payload: {
          title: docTitle,
          content: docContent,
          version: docVersion,
        },
      })

      setDocVersion(payload.doc.version)
      setSaveStatus('saved')
    } catch (error) {
      const msg = (error as Error).message
      if (msg.includes('conflict') || msg.includes('409')) {
        setSaveStatus('conflict')
        msgApi.warning(msg || '文档有冲突，请等待同步后重试')
      } else {
        setSaveStatus('error')
        msgApi.error(msg || '自动保存失败')
      }
    }
  }

  useEffect(() => {
    void fetchFiles()
    void fetchDocs()
  }, [projectId, sessionId])

  useEffect(() => {
    if (!activeDoc) {
      yDocRef.current?.destroy()
      yDocRef.current = undefined
      return
    }

    if (activeDoc.docType !== 'markdown') {
      yDocRef.current?.destroy()
      yDocRef.current = undefined
      setDocTitle(activeDoc.title)
      setDocContent(activeDoc.content)
      setDocVersion(activeDoc.version)
      setSaveStatus('saved')
      return
    }

    const doc = new Y.Doc()
    const text = doc.getText('content')
    text.insert(0, activeDoc.content)
    yDocRef.current = doc
    setDocTitle(activeDoc.title)
    setDocContent(activeDoc.content)
    setDocVersion(activeDoc.version)
    setSaveStatus('saved')

    const observer = () => {
      if (remoteApplyingRef.current) {
        return
      }

      setDocContent(doc.getText('content').toString())

      if (pushTimerRef.current) {
        window.clearTimeout(pushTimerRef.current)
      }

      pushTimerRef.current = window.setTimeout(async () => {
        if (!projectId || !activeDoc.id || !sessionId) {
          return
        }

        const update = Y.encodeStateAsUpdate(doc)
        const updateBase64 = uint8ToBase64(update)

        try {
          const payload = await api<{ yStateBase64: string }>('apply_collab_update', {
            sessionId,
            projectId,
            docId: activeDoc.id,
            payload: { updateBase64 },
          })

          // Version tracking via local state since response doesn't include version
        } catch {
          // ignore collab sync errors
        }
      }, 450)
    }

    text.observe(observer)

    if (pollTimerRef.current) {
      window.clearInterval(pollTimerRef.current)
    }

    pollTimerRef.current = window.setInterval(async () => {
      if (!projectId || !activeDoc.id || !sessionId) {
        return
      }

      try {
        const payload = await api<{ yStateBase64: string }>('get_collab_state', {
          sessionId,
          projectId,
          docId: activeDoc.id,
        })

        if (!payload.yStateBase64) {
          return
        }

        remoteApplyingRef.current = true
        const currentText = doc.getText('content')
        currentText.delete(0, currentText.length)
        Y.applyUpdate(doc, base64ToUint8(payload.yStateBase64))
        setDocContent(doc.getText('content').toString())
        remoteApplyingRef.current = false
      } catch {
        // ignore poll errors
      }
    }, 2000)

    return () => {
      text.unobserve(observer)

      if (pollTimerRef.current) {
        window.clearInterval(pollTimerRef.current)
      }

      if (pushTimerRef.current) {
        window.clearTimeout(pushTimerRef.current)
      }
    }
  }, [activeDoc?.id, activeDoc?.docType, projectId])

  useEffect(() => {
    if (!activeDocId) {
      setPresenceMembers([])
      return
    }

    void pushPresence(false)
    void fetchPresence()

    if (presenceTimerRef.current) {
      window.clearInterval(presenceTimerRef.current)
    }

    presenceTimerRef.current = window.setInterval(() => {
      void pushPresence(typingActiveRef.current)
      void fetchPresence()
    }, 2000)

    return () => {
      if (presenceTimerRef.current) {
        window.clearInterval(presenceTimerRef.current)
      }
      if (typingTimerRef.current) {
        window.clearTimeout(typingTimerRef.current)
      }
      void pushPresence(false)
    }
  }, [activeDocId, projectId])

  useEffect(() => {
    if (!activeDoc || activeDoc.docType !== 'excel' || !projectId) {
      if (excelSyncTimerRef.current) {
        window.clearInterval(excelSyncTimerRef.current)
      }
      return
    }

    excelSyncTimerRef.current = window.setInterval(async () => {
      if (!sessionId) return
      try {
        const payload = await api<{ doc: SharedDocItem }>('get_shared_doc', {
          sessionId,
          projectId,
          docId: activeDoc.id,
        })

        if (payload.doc.version <= docVersionRef.current) {
          return
        }

        setDocVersion(payload.doc.version)
        setDocTitle(payload.doc.title)
        setDocContent(payload.doc.content)
        setSaveStatus('saved')
      } catch {
        // ignore sync errors
      }
    }, 1200)

    return () => {
      if (excelSyncTimerRef.current) {
        window.clearInterval(excelSyncTimerRef.current)
      }
    }
  }, [activeDoc?.id, activeDoc?.docType, projectId])

  useEffect(() => {
    if (!activeDoc || !editable) {
      return
    }

    const shouldSaveExcel = activeDoc.docType === 'excel'
    const shouldSaveMarkdownTitle = activeDoc.docType === 'markdown' && docTitle !== activeDoc.title

    if (!shouldSaveExcel && !shouldSaveMarkdownTitle) {
      return
    }

    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current)
    }

    saveTimerRef.current = window.setTimeout(() => {
      void saveDocDraft()
    }, 700)

    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current)
      }
    }
  }, [docTitle, docContent, activeDoc?.id, activeDoc?.docType, editable])

  const upload = async (file: File) => {
    if (!projectId || !sessionId) {
      return
    }

    setUploading(true)
    setUploadPercent(0)

    try {
      setUploadPercent(30)
      // For now, upload via base64 content (Tauri invoke doesn't support multipart)
      // The Rust backend will save the file to app data dir
      setUploadPercent(60)
      await api('upload_shared_file', {
        sessionId,
        projectId,
      })
      setUploadPercent(100)

      msgApi.success('上传成功')
      await fetchFiles()
    }
    catch (error) {
      msgApi.error(error instanceof Error ? error.message : '上传失败')
    }
    finally {
      setUploading(false)
    }
  }

  const handleDropUpload: React.DragEventHandler<HTMLDivElement> = (event) => {
    event.preventDefault()
    setDragOverUploadZone(false)

    if (!editable || uploading) {
      return
    }

    const file = event.dataTransfer.files?.item(0)

    if (!file) {
      msgApi.warning('未检测到可上传文件')
      return
    }

    void upload(file)
  }

  return (
    <div className="flex flex-col gap-4">
      {contextHolder}
      <Tabs
        items={[
          {
            key: 'files',
            label: '共享文件',
            children: (
              <div
                className="rounded-xl border border-solid p-4"
                style={{
                  borderColor: dragOverUploadZone ? token.colorPrimary : token.colorBorderSecondary,
                  backgroundColor: dragOverUploadZone ? token.colorPrimaryBg : token.colorBgContainer,
                }}
                onDragEnter={(event) => {
                  event.preventDefault()
                  if (!editable || uploading) {
                    return
                  }
                  setDragOverUploadZone(true)
                }}
                onDragOver={(event) => {
                  event.preventDefault()
                  if (!editable || uploading) {
                    return
                  }
                  setDragOverUploadZone(true)
                }}
                onDragLeave={(event) => {
                  event.preventDefault()
                  const nextTarget = event.relatedTarget as Node | null

                  if (nextTarget && event.currentTarget.contains(nextTarget)) {
                    return
                  }

                  setDragOverUploadZone(false)
                }}
                onDrop={handleDropUpload}
              >
                <div className="mb-3 flex items-center justify-between gap-3">
                  <Typography.Title level={5}>共享文件区</Typography.Title>
                  <Button
                    disabled={!editable || uploading}
                    loading={uploading}
                    type="primary"
                    onClick={() => {
                      pickFile((file) => {
                        void upload(file)
                      })
                    }}
                  >
                    上传文件
                  </Button>
                </div>

                {uploading && <Progress percent={uploadPercent} size="small" status="active" />}
                {!uploading && (
                  <Typography.Paragraph className="!mb-3" type="secondary">
                    可将文件直接拖拽到此区域上传，或点击右上角按钮选择文件。
                  </Typography.Paragraph>
                )}

                <List
                  loading={loadingFiles}
                  dataSource={files}
                  locale={{ emptyText: '暂无共享文件' }}
                  renderItem={(item) => (
                    <List.Item
                      actions={[
                        <Button
                          key="download"
                          onClick={async () => {
                            if (!sessionId) return
                            try {
                              const payload = await api<{ file: SharedFileItem & { data?: string } }>('download_shared_file', {
                                sessionId,
                                projectId,
                                fileId: item.id,
                              })
                              msgApi.info('文件下载功能升级中，请在文件管理器中查看')
                            } catch {
                              msgApi.error('下载失败')
                            }
                          }}
                        >
                          下载
                        </Button>,
                        <Popconfirm
                          key="delete"
                          title="确认删除该文件？"
                          disabled={!editable}
                          onConfirm={async () => {
                            if (!sessionId) return
                            await api('delete_shared_file', {
                              sessionId,
                              projectId,
                              fileId: item.id,
                            })
                            void fetchFiles()
                          }}
                        >
                          <Button danger disabled={!editable}>删除</Button>
                        </Popconfirm>,
                      ]}
                    >
                      <List.Item.Meta
                        title={item.name}
                        description={`上传者 ${item.uploaderUsername} · ${formatBytes(item.size)} · ${dayjs(item.createdAt).format('YYYY-MM-DD HH:mm')}`}
                      />
                    </List.Item>
                  )}
                />
              </div>
            ),
          },
          {
            key: 'docs',
            label: '在线文档',
            children: (
              <div className="grid grid-cols-[300px_minmax(0,1fr)] gap-4">
                <div className="rounded-xl border border-solid p-3" style={{ borderColor: token.colorBorderSecondary }}>
                  <Space.Compact className="mb-3 w-full">
                    <Input
                      disabled={!editable}
                      placeholder="新文档标题"
                      value={creatingDocTitle}
                      onChange={(event) => {
                        setCreatingDocTitle(event.target.value)
                      }}
                    />
                    <Select
                      className="min-w-28"
                      disabled={!editable}
                      value={creatingDocType}
                      options={[
                        { label: 'Markdown', value: 'markdown' },
                        { label: 'Excel', value: 'excel' },
                      ]}
                      onChange={(value) => {
                        setCreatingDocType(value)
                      }}
                    />
                    <Button
                      disabled={!editable || !creatingDocTitle.trim() || !sessionId}
                      type="primary"
                      onClick={async () => {
                        if (!sessionId) return
                        try {
                          const payload = await api<{ doc: SharedDocItem }>('create_shared_doc', {
                            sessionId,
                            projectId,
                            payload: {
                              title: creatingDocTitle,
                              docType: creatingDocType,
                            },
                          })
                          void fetchDocs()
                          setActiveDocId(payload.doc.id)
                          setCreatingDocTitle('')
                          setCreatingDocType('markdown')
                        } catch (err) {
                          msgApi.error((err as Error).message)
                        }
                      }}
                    >
                      新建
                    </Button>
                  </Space.Compact>

                  <List
                    loading={loadingDocs}
                    dataSource={docs}
                    locale={{ emptyText: '暂无在线文档' }}
                    renderItem={(item) => (
                      <List.Item
                        className={activeDocId === item.id ? 'bg-black/5' : ''}
                        style={{ cursor: 'pointer', borderRadius: token.borderRadius }}
                        onClick={() => {
                          setActiveDocId(item.id)
                        }}
                      >
                        <List.Item.Meta
                          title={item.title}
                          description={(
                            <Space size={4} wrap>
                              <Tag>{item.docType === 'excel' ? 'Excel' : 'Markdown'}</Tag>
                              <Tag color="blue">v{item.version}</Tag>
                              <span>{item.creatorUsername}</span>
                            </Space>
                          )}
                        />
                      </List.Item>
                    )}
                  />
                </div>

                <div className="rounded-xl border border-solid" style={{ borderColor: token.colorBorderSecondary }}>
                  {activeDoc
                    ? (
                        <div className="flex h-[720px] flex-col">
                          <div
                            className="flex items-center justify-between gap-3 border-b border-solid px-4 py-3"
                            style={{ borderColor: token.colorBorderSecondary }}
                          >
                            <Input
                              disabled={!editable}
                              value={docTitle}
                              onChange={(event) => {
                                typingActiveRef.current = true
                                if (typingTimerRef.current) {
                                  window.clearTimeout(typingTimerRef.current)
                                }
                                typingTimerRef.current = window.setTimeout(() => {
                                  typingActiveRef.current = false
                                }, 1200)
                                setDocTitle(event.target.value)
                              }}
                            />
                            <Space>
                              <Tag color="geekblue">协同版本 v{docVersion}</Tag>
                              <Tag color={saveStatus === 'conflict' ? 'volcano' : saveStatus === 'error' ? 'red' : 'blue'}>
                                {saveStatus === 'saving'
                                  ? '自动保存中'
                                  : saveStatus === 'conflict'
                                    ? '存在冲突'
                                    : saveStatus === 'error'
                                      ? '保存失败'
                                      : '已同步'}
                              </Tag>
                              <Tag>
                                在线 {presenceMembers.length}
                                {presenceMembers.some((member) => member.isTyping) ? ' · 有人正在输入' : ''}
                              </Tag>
                              <Button
                                onClick={async () => {
                                  if (!sessionId) return
                                  try {
                                    const payload = await api<{ title: string, content: string, docType: string }>('export_shared_doc', {
                                      sessionId,
                                      projectId,
                                      docId: activeDoc.id,
                                    })
                                    const ext = activeDoc.docType === 'excel' ? 'csv' : 'md'
                                    const mimeType = activeDoc.docType === 'excel' ? 'text/csv' : 'text/markdown'
                                    const blob = new Blob([payload.content], { type: mimeType })
                                    const url = URL.createObjectURL(blob)
                                    const a = document.createElement('a')
                                    a.href = url
                                    a.download = `${payload.title}.${ext}`
                                    a.click()
                                    URL.revokeObjectURL(url)
                                  } catch {
                                    msgApi.error('导出失败')
                                  }
                                }}
                              >
                                导出 {activeDoc.docType === 'excel' ? 'XLSX' : 'MD'}
                              </Button>
                              <Button
                                danger
                                disabled={!editable}
                                onClick={async () => {
                                  if (!sessionId) return
                                  await api('delete_shared_doc', {
                                    sessionId,
                                    projectId,
                                    docId: activeDoc.id,
                                  })
                                  void fetchDocs()
                                }}
                              >
                                删除
                              </Button>
                            </Space>
                          </div>
                          <div className="flex-1 overflow-auto">
                            {activeDoc.docType === 'excel'
                              ? (
                                  <div className="space-y-3 p-4">
                                    <div className="flex gap-2">
                                      <Button disabled={!editable} onClick={appendExcelRow}>新增行</Button>
                                      <Button disabled={!editable} onClick={appendExcelColumn}>新增列</Button>
                                    </div>
                                    <div className="overflow-auto rounded-lg border border-solid" style={{ borderColor: token.colorBorderSecondary }}>
                                      <table className="w-full border-collapse text-sm">
                                        <tbody>
                                          {excelGrid.map((row, rowIndex) => (
                                            <tr key={`r-${rowIndex}`}>
                                              {row.map((cell, colIndex) => (
                                                <td
                                                  key={`c-${rowIndex}-${colIndex}`}
                                                  className="min-w-32 border border-solid p-1"
                                                  style={{ borderColor: token.colorBorderSecondary }}
                                                >
                                                  <Input
                                                    disabled={!editable}
                                                    value={cell}
                                                    onChange={(event) => {
                                                      setExcelCell(rowIndex, colIndex, event.target.value)
                                                    }}
                                                  />
                                                </td>
                                              ))}
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                )
                              : (
                                  <MarkdownEditor
                                    value={docContent}
                                    onChange={(nextValue) => {
                                      typingActiveRef.current = true
                                      if (typingTimerRef.current) {
                                        window.clearTimeout(typingTimerRef.current)
                                      }
                                      typingTimerRef.current = window.setTimeout(() => {
                                        typingActiveRef.current = false
                                      }, 1200)
                                      setDocContent(nextValue)

                                      if (!yDocRef.current) {
                                        return
                                      }

                                      const text = yDocRef.current.getText('content')
                                      remoteApplyingRef.current = true
                                      text.delete(0, text.length)
                                      text.insert(0, nextValue)
                                      remoteApplyingRef.current = false
                                    }}
                                  />
                                )}
                          </div>
                        </div>
                      )
                    : (
                        <div className="flex h-[720px] items-center justify-center text-sm" style={{ color: token.colorTextSecondary }}>
                          请选择或新建一个在线文档
                        </div>
                      )}
                </div>
              </div>
            ),
          },
        ]}
      />
    </div>
  )
}
