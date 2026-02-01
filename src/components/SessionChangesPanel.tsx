import { memo, useState, useEffect } from 'react'
import { FileIcon, ChevronDownIcon, ChevronRightIcon } from './Icons'
import { DiffViewer } from './DiffViewer'
import { getSessionDiff } from '../api/session'
import type { FileDiff } from '../api/types'
import { detectLanguage } from '../utils/languageUtils'

interface SessionChangesPanelProps {
  sessionId: string
}

export const SessionChangesPanel = memo(function SessionChangesPanel({
  sessionId,
}: SessionChangesPanelProps) {
  const [loading, setLoading] = useState(false)
  const [diffs, setDiffs] = useState<FileDiff[]>([])
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  // 加载数据
  useEffect(() => {
    if (sessionId) {
      setLoading(true)
      setError(null)
      getSessionDiff(sessionId)
        .then(data => {
          setDiffs(data)
          // 默认展开第一个
          if (data.length > 0) {
            setExpandedFiles(new Set([data[0].file]))
          }
        })
        .catch(err => {
          console.error('Failed to load session diff:', err)
          setError('Failed to load changes')
        })
        .finally(() => setLoading(false))
    }
  }, [sessionId])

  const toggleFile = (file: string) => {
    const newSet = new Set(expandedFiles)
    if (newSet.has(file)) {
      newSet.delete(file)
    } else {
      newSet.add(file)
    }
    setExpandedFiles(newSet)
  }

  if (loading) {
    return <div className="p-4 text-center text-text-400 text-xs">Loading changes...</div>
  }

  if (error) {
    return <div className="p-4 text-center text-danger-100 text-xs">{error}</div>
  }

  if (diffs.length === 0) {
    return <div className="p-4 text-center text-text-400 text-xs">No changes in this session</div>
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto custom-scrollbar">
      {diffs.map((diff) => {
        const isExpanded = expandedFiles.has(diff.file)
        const language = detectLanguage(diff.file) || 'text'
        
        return (
          <div key={diff.file} className="border-b border-border-100 last:border-0">
            <button
              onClick={() => toggleFile(diff.file)}
              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-bg-200/50 transition-colors text-left"
            >
              <span className="text-text-400">
                {isExpanded ? <ChevronDownIcon size={14} /> : <ChevronRightIcon size={14} />}
              </span>
              <FileIcon size={14} className="text-text-400" />
              <span className="flex-1 text-xs font-mono text-text-100 truncate">{diff.file}</span>
              
              <div className="flex items-center gap-2 text-[10px] font-mono">
                {diff.additions > 0 && <span className="text-success-100">+{diff.additions}</span>}
                {diff.deletions > 0 && <span className="text-danger-100">−{diff.deletions}</span>}
              </div>
            </button>
            
            {isExpanded && (
              <div className="bg-bg-100/30 border-t border-border-100/50">
                <DiffViewer 
                  before={diff.before} 
                  after={diff.after} 
                  language={language}
                  viewMode="unified"
                />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
})
