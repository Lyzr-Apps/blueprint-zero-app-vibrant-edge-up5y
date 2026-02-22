'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { callAIAgent } from '@/lib/aiAgent'
import { listSchedules, getScheduleLogs, pauseSchedule, resumeSchedule, triggerScheduleNow, cronToHuman } from '@/lib/scheduler'
import type { Schedule, ExecutionLog } from '@/lib/scheduler'

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Switch } from '@/components/ui/switch'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Progress } from '@/components/ui/progress'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible'

import { FiHome, FiFilm, FiFileText, FiSend, FiSettings, FiRefreshCw, FiSearch, FiTrash2, FiEye, FiCode, FiBarChart2, FiTag, FiClock, FiCheck, FiX, FiAlertCircle, FiChevronDown, FiChevronUp, FiExternalLink, FiImage, FiPlay, FiPause, FiMenu, FiEdit, FiChevronLeft, FiChevronRight, FiLoader, FiZap, FiActivity, FiDatabase } from 'react-icons/fi'

// ============================================================================
// CONSTANTS
// ============================================================================

const CONTENT_PIPELINE_AGENT_ID = '6999d49b80d993c990b4d36a'
const INFOGRAPHIC_AGENT_ID = '6999d4b6b6d5f73211681a72'
const WP_PUBLISHER_AGENT_ID = '6999d4b6067ed23a02cf7dfa'
const SCHEDULE_ID = '6999d4bf399dfadeac37f6c3'

type ScreenName = 'dashboard' | 'sources' | 'pipeline' | 'publishing' | 'settings'
type Stage = 'NEW' | 'TRANSCRIBED' | 'WRITTEN' | 'READY_TO_POST' | 'POSTED' | 'ERROR'

// ============================================================================
// INTERFACES
// ============================================================================

interface VideoItem {
  id: string
  video_id: string
  title: string
  channel_name: string
  published_at: string
  views: number
  thumbnail: string
  stage: Stage
  html_body?: string
  meta_title?: string
  meta_description?: string
  slug?: string
  faq_schema_json?: string
  seo_structure?: string
  word_count?: number
  reading_time_minutes?: number
  featured_image_url?: string
  image_alt_text?: string
  wp_post_id?: string
  post_url?: string
  published_at_wp?: string
  last_error?: string
  last_step?: string
  retry_count: number
  scheduled_at?: string
  categories?: string
  tags?: string
}

interface ActivityLog {
  id: string
  timestamp: string
  video_title: string
  action: string
  result: 'success' | 'error'
  details?: string
}

interface PipelineSettings {
  supadata_key: string
  youtube_api_key: string
  wordpress_url: string
  wordpress_username: string
  wordpress_password: string
  image_style: string
  brand_name: string
  default_cta: string
  max_process_per_run: number
  retry_limit: number
  enable_scheduling: boolean
  enable_faq_schema: boolean
  enable_internal_links: boolean
  daily_post_limit: number
  posting_start_hour: number
  posting_end_hour: number
}

// ============================================================================
// HELPERS
// ============================================================================

function safeJsonParse(str: string | undefined | null): any {
  if (!str) return null
  try {
    return JSON.parse(str)
  } catch {
    return null
  }
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
}

function getStageBadgeClasses(stage: Stage): string {
  switch (stage) {
    case 'NEW': return 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
    case 'TRANSCRIBED': return 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
    case 'WRITTEN': return 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20'
    case 'READY_TO_POST': return 'bg-green-500/10 text-green-400 border border-green-500/20'
    case 'POSTED': return 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
    case 'ERROR': return 'bg-red-500/10 text-red-400 border border-red-500/20'
    default: return 'bg-muted text-muted-foreground'
  }
}

function getStageLabel(stage: Stage): string {
  switch (stage) {
    case 'NEW': return 'New'
    case 'TRANSCRIBED': return 'Transcribed'
    case 'WRITTEN': return 'Written'
    case 'READY_TO_POST': return 'Ready'
    case 'POSTED': return 'Posted'
    case 'ERROR': return 'Error'
    default: return stage
  }
}

function formatTimestamp(ts: string): string {
  if (!ts) return ''
  try {
    const d = new Date(ts)
    return d.toLocaleString()
  } catch {
    return ts
  }
}

function renderMarkdown(text: string) {
  if (!text) return null
  return (
    <div className="space-y-2">
      {text.split('\n').map((line, i) => {
        if (line.startsWith('### ')) return <h4 key={i} className="font-semibold text-sm mt-3 mb-1">{line.slice(4)}</h4>
        if (line.startsWith('## ')) return <h3 key={i} className="font-semibold text-base mt-3 mb-1">{line.slice(3)}</h3>
        if (line.startsWith('# ')) return <h2 key={i} className="font-bold text-lg mt-4 mb-2">{line.slice(2)}</h2>
        if (line.startsWith('- ') || line.startsWith('* ')) return <li key={i} className="ml-4 list-disc text-sm">{formatInline(line.slice(2))}</li>
        if (/^\d+\.\s/.test(line)) return <li key={i} className="ml-4 list-decimal text-sm">{formatInline(line.replace(/^\d+\.\s/, ''))}</li>
        if (!line.trim()) return <div key={i} className="h-1" />
        return <p key={i} className="text-sm">{formatInline(line)}</p>
      })}
    </div>
  )
}

function formatInline(text: string) {
  const parts = text.split(/\*\*(.*?)\*\*/g)
  if (parts.length === 1) return text
  return parts.map((part, i) =>
    i % 2 === 1 ? <strong key={i} className="font-semibold">{part}</strong> : part
  )
}

function generateSampleVideos(url: string): VideoItem[] {
  const titles = [
    'Complete Guide to Building REST APIs with Node.js',
    'React Server Components Explained in 15 Minutes',
    'How to Scale Your SaaS to 10K Users',
    'PostgreSQL vs MongoDB: Which Database to Choose?',
    'Ultimate Docker Tutorial for Beginners 2024',
    'TypeScript Advanced Patterns You Need to Know',
    'Kubernetes Deployment Strategies Deep Dive',
    'Building Real-time Apps with WebSockets',
  ]
  const channels = ['TechStack TV', 'DevOps Simplified', 'Code With Alex', 'The Engineering Hub']
  const now = Date.now()
  return titles.slice(0, 5 + Math.floor(Math.random() * 3)).map((title, idx) => ({
    id: generateId(),
    video_id: `vid_${generateId().substring(0, 11)}`,
    title,
    channel_name: channels[idx % channels.length],
    published_at: new Date(now - idx * 86400000 * (2 + Math.floor(Math.random() * 5))).toISOString(),
    views: Math.floor(Math.random() * 500000) + 1000,
    thumbnail: '',
    stage: 'NEW' as Stage,
    retry_count: 0,
  }))
}

const SAMPLE_VIDEOS: VideoItem[] = [
  {
    id: 'sample-1', video_id: 'dQw4w9WgXcQ', title: '10 Advanced Python Tricks Every Developer Should Know', channel_name: 'Code Masters',
    published_at: '2024-12-15T10:30:00Z', views: 245000, thumbnail: '', stage: 'POSTED',
    html_body: '<h1>10 Advanced Python Tricks</h1><p>This comprehensive guide covers...</p>',
    meta_title: '10 Advanced Python Tricks Every Developer Should Know | Code Masters',
    meta_description: 'Master these 10 advanced Python programming tricks including decorators, generators, and context managers.',
    slug: '10-advanced-python-tricks-developers', word_count: 2450, reading_time_minutes: 12,
    faq_schema_json: '{"@type":"FAQPage","mainEntity":[]}', seo_structure: '{"headings":["H1","H2","H2","H3"]}',
    featured_image_url: 'https://placehold.co/800x400/1a1a1a/ebebeb?text=Python+Tricks', image_alt_text: 'Python programming tricks infographic',
    wp_post_id: 'wp-1234', post_url: 'https://example.com/10-advanced-python-tricks', published_at_wp: '2024-12-16T08:00:00Z',
    retry_count: 0, categories: 'Programming', tags: 'python, tips, coding',
  },
  {
    id: 'sample-2', video_id: 'abc123xyz', title: 'Building Microservices with Go and gRPC', channel_name: 'DevOps Weekly',
    published_at: '2024-12-18T14:00:00Z', views: 89000, thumbnail: '', stage: 'WRITTEN',
    html_body: '<h1>Building Microservices with Go</h1><p>Learn how to architect...</p>',
    meta_title: 'Building Microservices with Go and gRPC - Complete Tutorial',
    meta_description: 'Step-by-step guide to building production-ready microservices using Go and gRPC.',
    slug: 'building-microservices-go-grpc', word_count: 3200, reading_time_minutes: 16,
    seo_structure: '{"headings":["H1","H2","H2","H2","H3"]}', retry_count: 0,
  },
  {
    id: 'sample-3', video_id: 'def456uvw', title: 'Next.js 15: What Changed and Why It Matters', channel_name: 'Frontend Focus',
    published_at: '2024-12-20T09:15:00Z', views: 312000, thumbnail: '', stage: 'READY_TO_POST',
    html_body: '<h1>Next.js 15 Changes</h1><p>The latest release brings...</p>',
    meta_title: 'Next.js 15: Complete Changelog and Migration Guide',
    meta_description: 'Everything new in Next.js 15 including turbopack improvements, server actions, and more.',
    slug: 'nextjs-15-changes-migration-guide', word_count: 2800, reading_time_minutes: 14,
    featured_image_url: 'https://placehold.co/800x400/1a1a1a/ebebeb?text=Next.js+15', image_alt_text: 'Next.js 15 features overview',
    retry_count: 0, categories: 'Web Development', tags: 'nextjs, react, frontend',
    scheduled_at: '2024-12-22T10:00:00Z',
  },
  {
    id: 'sample-4', video_id: 'ghi789rst', title: 'Machine Learning Pipeline Architecture', channel_name: 'AI Insights',
    published_at: '2024-12-10T16:45:00Z', views: 156000, thumbnail: '', stage: 'ERROR',
    last_error: 'WordPress API returned 503: Service temporarily unavailable', last_step: 'publishing',
    retry_count: 2,
  },
  {
    id: 'sample-5', video_id: 'jkl012mno', title: 'Database Indexing Strategies Explained', channel_name: 'Code Masters',
    published_at: '2024-12-22T11:30:00Z', views: 67000, thumbnail: '', stage: 'NEW',
    retry_count: 0,
  },
]

const SAMPLE_ACTIVITY: ActivityLog[] = [
  { id: 'a1', timestamp: '2024-12-22T10:30:00Z', video_title: '10 Advanced Python Tricks', action: 'Published to WordPress', result: 'success' },
  { id: 'a2', timestamp: '2024-12-22T10:15:00Z', video_title: '10 Advanced Python Tricks', action: 'Image generated successfully', result: 'success' },
  { id: 'a3', timestamp: '2024-12-22T09:45:00Z', video_title: '10 Advanced Python Tricks', action: 'Content generated successfully', result: 'success' },
  { id: 'a4', timestamp: '2024-12-21T16:00:00Z', video_title: 'Machine Learning Pipeline Architecture', action: 'Publishing failed', result: 'error', details: 'WordPress API returned 503' },
  { id: 'a5', timestamp: '2024-12-21T15:30:00Z', video_title: 'Building Microservices with Go', action: 'Content generated successfully', result: 'success' },
  { id: 'a6', timestamp: '2024-12-21T14:00:00Z', video_title: 'Next.js 15: What Changed', action: 'Image generated successfully', result: 'success' },
  { id: 'a7', timestamp: '2024-12-20T11:00:00Z', video_title: 'Next.js 15: What Changed', action: 'Content generated successfully', result: 'success' },
  { id: 'a8', timestamp: '2024-12-20T10:30:00Z', video_title: 'Database Indexing Strategies', action: 'Video fetched from source', result: 'success' },
]

// ============================================================================
// ERROR BOUNDARY
// ============================================================================

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false, error: '' }
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
          <div className="text-center p-8 max-w-md">
            <h2 className="text-xl font-semibold mb-2">Something went wrong</h2>
            <p className="text-muted-foreground mb-4 text-sm">{this.state.error}</p>
            <button onClick={() => this.setState({ hasError: false, error: '' })} className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm">Try again</button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

// ============================================================================
// STAGE BADGE COMPONENT
// ============================================================================

function StageBadge({ stage }: { stage: Stage }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 text-xs font-medium ${getStageBadgeClasses(stage)}`}>
      {getStageLabel(stage)}
    </span>
  )
}

// ============================================================================
// NAV ITEM COMPONENT
// ============================================================================

function NavItem({ icon, label, active, onClick, collapsed }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void; collapsed: boolean }) {
  return (
    <button onClick={onClick} className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors ${active ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'}`}>
      <span className="text-lg flex-shrink-0">{icon}</span>
      {!collapsed && <span className="tracking-tight">{label}</span>}
    </button>
  )
}

// ============================================================================
// DASHBOARD SCREEN
// ============================================================================

function DashboardScreen({
  videos, activityLogs, activeAgentId, onRetry
}: {
  videos: VideoItem[]
  activityLogs: ActivityLog[]
  activeAgentId: string | null
  onRetry: (video: VideoItem) => void
}) {
  const [scheduleData, setScheduleData] = useState<Schedule | null>(null)
  const [scheduleLoading, setScheduleLoading] = useState(false)
  const [scheduleLogs, setScheduleLogs] = useState<ExecutionLog[]>([])
  const [scheduleError, setScheduleError] = useState<string | null>(null)
  const [scheduleActionLoading, setScheduleActionLoading] = useState(false)
  const [logsExpanded, setLogsExpanded] = useState(false)
  const [errorPanelExpanded, setErrorPanelExpanded] = useState(true)
  const [initDone, setInitDone] = useState(false)

  const stageCounts = useMemo(() => {
    const counts: Record<Stage, number> = { NEW: 0, TRANSCRIBED: 0, WRITTEN: 0, READY_TO_POST: 0, POSTED: 0, ERROR: 0 }
    videos.forEach(v => { counts[v.stage] = (counts[v.stage] || 0) + 1 })
    return counts
  }, [videos])

  const errorVideos = useMemo(() => videos.filter(v => v.stage === 'ERROR'), [videos])

  const loadScheduleData = useCallback(async () => {
    setScheduleLoading(true)
    setScheduleError(null)
    try {
      const res = await listSchedules()
      if (res.success && Array.isArray(res.schedules)) {
        const found = res.schedules.find(s => s.id === SCHEDULE_ID)
        if (found) {
          setScheduleData(found)
        } else if (res.schedules.length > 0) {
          setScheduleData(res.schedules[0])
        }
      } else {
        setScheduleError(res.error || 'Failed to load schedule')
      }
      const logsRes = await getScheduleLogs(SCHEDULE_ID, { limit: 10 })
      if (logsRes.success && Array.isArray(logsRes.executions)) {
        setScheduleLogs(logsRes.executions)
      }
    } catch (err: any) {
      setScheduleError(err?.message || 'Failed to load schedule')
    }
    setScheduleLoading(false)
  }, [])

  useEffect(() => {
    if (!initDone) {
      setInitDone(true)
      loadScheduleData()
    }
  }, [initDone, loadScheduleData])

  const handleToggleSchedule = async () => {
    if (!scheduleData) return
    setScheduleActionLoading(true)
    if (scheduleData.is_active) {
      await pauseSchedule(scheduleData.id)
    } else {
      await resumeSchedule(scheduleData.id)
    }
    await loadScheduleData()
    setScheduleActionLoading(false)
  }

  const handleTriggerNow = async () => {
    if (!scheduleData) return
    setScheduleActionLoading(true)
    await triggerScheduleNow(scheduleData.id)
    setScheduleActionLoading(false)
  }

  const stages: { key: Stage; label: string; color: string }[] = [
    { key: 'NEW', label: 'New', color: 'bg-blue-500' },
    { key: 'TRANSCRIBED', label: 'Transcribed', color: 'bg-cyan-500' },
    { key: 'WRITTEN', label: 'Written', color: 'bg-yellow-500' },
    { key: 'READY_TO_POST', label: 'Ready', color: 'bg-green-500' },
    { key: 'POSTED', label: 'Posted', color: 'bg-purple-500' },
    { key: 'ERROR', label: 'Error', color: 'bg-red-500' },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight font-serif mb-1">Dashboard</h2>
        <p className="text-muted-foreground text-sm">Content pipeline overview and monitoring</p>
      </div>

      {/* Stage Counters */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {stages.map(s => (
          <Card key={s.key} className="relative overflow-hidden">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className={`w-2 h-2 rounded-full ${s.color}`} />
                <span className="text-2xl font-bold tracking-tight">{stageCounts[s.key]}</span>
              </div>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Activity Feed & Error Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Recent Activity */}
        <Card className="lg:col-span-3">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold tracking-tight flex items-center gap-2">
              <FiActivity className="text-muted-foreground" />
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[320px]">
              {activityLogs.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground text-sm">No activity yet. Start by fetching videos from a source.</div>
              ) : (
                <div className="space-y-1">
                  {activityLogs.slice(0, 20).map(log => (
                    <div key={log.id} className="flex items-start gap-3 py-2 px-2 hover:bg-secondary/30 transition-colors">
                      <span className={`mt-1 flex-shrink-0 w-1.5 h-1.5 rounded-full ${log.result === 'success' ? 'bg-green-500' : 'bg-red-500'}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate">
                          <span className="font-medium">{log.video_title}</span>
                          <span className="text-muted-foreground ml-1">- {log.action}</span>
                        </p>
                        {log.details && <p className="text-xs text-red-400 mt-0.5 truncate">{log.details}</p>}
                      </div>
                      <span className="text-xs text-muted-foreground flex-shrink-0 font-mono">{formatTimestamp(log.timestamp).split(',')[1]?.trim() || formatTimestamp(log.timestamp)}</span>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Error Panel */}
        <Card className="lg:col-span-2">
          <Collapsible open={errorPanelExpanded} onOpenChange={setErrorPanelExpanded}>
            <CardHeader className="pb-3">
              <CollapsibleTrigger className="w-full flex items-center justify-between">
                <CardTitle className="text-base font-semibold tracking-tight flex items-center gap-2">
                  <FiAlertCircle className="text-red-400" />
                  Errors
                  {errorVideos.length > 0 && <Badge variant="destructive" className="ml-2 text-xs">{errorVideos.length}</Badge>}
                </CardTitle>
                {errorPanelExpanded ? <FiChevronUp className="text-muted-foreground" /> : <FiChevronDown className="text-muted-foreground" />}
              </CollapsibleTrigger>
            </CardHeader>
            <CollapsibleContent>
              <CardContent>
                <ScrollArea className="h-[280px]">
                  {errorVideos.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground text-sm">No errors. Pipeline is running clean.</div>
                  ) : (
                    <div className="space-y-3">
                      {errorVideos.map(v => (
                        <div key={v.id} className="p-3 border border-red-500/20 bg-red-500/5">
                          <p className="text-sm font-medium truncate mb-1">{v.title}</p>
                          <p className="text-xs text-muted-foreground mb-1">Step: <span className="font-mono">{v.last_step || 'unknown'}</span></p>
                          <p className="text-xs text-red-400 mb-2">{v.last_error || 'Unknown error'}</p>
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-muted-foreground">Retries: {v.retry_count}</span>
                            <Button size="sm" variant="outline" onClick={() => onRetry(v)} className="h-7 text-xs">
                              <FiRefreshCw className="mr-1 h-3 w-3" /> Retry
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>
      </div>

      {/* Schedule Management */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold tracking-tight flex items-center gap-2">
            <FiClock className="text-muted-foreground" />
            WordPress Publisher Schedule
          </CardTitle>
          <CardDescription>Automatic publishing every 2 hours</CardDescription>
        </CardHeader>
        <CardContent>
          {scheduleLoading && !scheduleData ? (
            <div className="space-y-3">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-2/3" />
            </div>
          ) : scheduleError && !scheduleData ? (
            <div className="text-sm text-red-400 flex items-center gap-2">
              <FiAlertCircle /> {scheduleError}
              <Button size="sm" variant="outline" onClick={loadScheduleData} className="ml-2 h-7 text-xs"><FiRefreshCw className="mr-1 h-3 w-3" /> Retry</Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Status</p>
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${scheduleData?.is_active ? 'bg-green-500' : 'bg-yellow-500'}`} />
                    <span className="text-sm font-medium">{scheduleData?.is_active ? 'Active' : 'Paused'}</span>
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Schedule</p>
                  <p className="text-sm font-medium">{scheduleData?.cron_expression ? cronToHuman(scheduleData.cron_expression) : 'Every 2 hours'}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Next Run</p>
                  <p className="text-sm font-mono">{scheduleData?.next_run_time ? formatTimestamp(scheduleData.next_run_time) : 'N/A'}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Last Run</p>
                  <p className="text-sm font-mono">{scheduleData?.last_run_at ? formatTimestamp(scheduleData.last_run_at) : 'Never'}</p>
                </div>
              </div>
              <Separator />
              <div className="flex items-center gap-3">
                <Button size="sm" variant={scheduleData?.is_active ? 'outline' : 'default'} onClick={handleToggleSchedule} disabled={scheduleActionLoading} className="h-8 text-xs">
                  {scheduleActionLoading ? <FiLoader className="mr-1 h-3 w-3 animate-spin" /> : scheduleData?.is_active ? <FiPause className="mr-1 h-3 w-3" /> : <FiPlay className="mr-1 h-3 w-3" />}
                  {scheduleData?.is_active ? 'Pause Schedule' : 'Resume Schedule'}
                </Button>
                <Button size="sm" variant="outline" onClick={handleTriggerNow} disabled={scheduleActionLoading} className="h-8 text-xs">
                  <FiZap className="mr-1 h-3 w-3" /> Trigger Now
                </Button>
                <Button size="sm" variant="outline" onClick={loadScheduleData} disabled={scheduleLoading} className="h-8 text-xs">
                  <FiRefreshCw className={`mr-1 h-3 w-3 ${scheduleLoading ? 'animate-spin' : ''}`} /> Refresh
                </Button>
              </div>

              {/* Execution Logs */}
              <Collapsible open={logsExpanded} onOpenChange={setLogsExpanded}>
                <CollapsibleTrigger className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
                  {logsExpanded ? <FiChevronUp className="h-4 w-4" /> : <FiChevronDown className="h-4 w-4" />}
                  Execution History ({scheduleLogs.length})
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-3">
                  {scheduleLogs.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-2">No executions logged yet.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Time</TableHead>
                          <TableHead className="text-xs">Status</TableHead>
                          <TableHead className="text-xs">Attempt</TableHead>
                          <TableHead className="text-xs">Details</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {scheduleLogs.map(log => (
                          <TableRow key={log.id}>
                            <TableCell className="text-xs font-mono">{formatTimestamp(log.executed_at)}</TableCell>
                            <TableCell>
                              {log.success ? (
                                <span className="text-green-400 text-xs flex items-center gap-1"><FiCheck className="h-3 w-3" /> Success</span>
                              ) : (
                                <span className="text-red-400 text-xs flex items-center gap-1"><FiX className="h-3 w-3" /> Failed</span>
                              )}
                            </TableCell>
                            <TableCell className="text-xs">{log.attempt}/{log.max_attempts}</TableCell>
                            <TableCell className="text-xs text-muted-foreground truncate max-w-[200px]">{log.error_message || 'OK'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CollapsibleContent>
              </Collapsible>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Active Agent Indicator */}
      {activeAgentId && (
        <div className="fixed bottom-4 right-4 bg-card border px-4 py-2 flex items-center gap-2 text-sm z-50">
          <FiLoader className="h-4 w-4 animate-spin text-blue-400" />
          <span>Agent processing...</span>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// SOURCE MANAGER SCREEN
// ============================================================================

function SourceManagerScreen({
  videos, setVideos, addActivity, activeAgentId, setActiveAgentId, onGenerateContent
}: {
  videos: VideoItem[]
  setVideos: React.Dispatch<React.SetStateAction<VideoItem[]>>
  addActivity: (title: string, action: string, result: 'success' | 'error', details?: string) => void
  activeAgentId: string | null
  setActiveAgentId: (id: string | null) => void
  onGenerateContent: (videos: VideoItem[]) => void
}) {
  const [url, setUrl] = useState('')
  const [sourceType, setSourceType] = useState<'channel' | 'playlist' | 'search'>('channel')
  const [fetching, setFetching] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [sortField, setSortField] = useState<'title' | 'published_at' | 'views'>('published_at')
  const [sortAsc, setSortAsc] = useState(false)

  const handleFetch = async () => {
    if (!url.trim()) return
    setFetching(true)
    await new Promise(r => setTimeout(r, 1200))
    const newVideos = generateSampleVideos(url)
    setVideos(prev => [...newVideos, ...prev])
    addActivity(url, `Fetched ${newVideos.length} videos from ${sourceType}`, 'success')
    setFetching(false)
    setUrl('')
  }

  const handleSort = (field: 'title' | 'published_at' | 'views') => {
    if (sortField === field) {
      setSortAsc(!sortAsc)
    } else {
      setSortField(field)
      setSortAsc(true)
    }
  }

  const sortedVideos = useMemo(() => {
    const newStageVideos = videos.filter(v => v.stage === 'NEW')
    return [...newStageVideos].sort((a, b) => {
      let cmp = 0
      if (sortField === 'title') cmp = a.title.localeCompare(b.title)
      else if (sortField === 'views') cmp = a.views - b.views
      else cmp = new Date(a.published_at).getTime() - new Date(b.published_at).getTime()
      return sortAsc ? cmp : -cmp
    })
  }, [videos, sortField, sortAsc])

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    if (selectedIds.size === sortedVideos.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(sortedVideos.map(v => v.id)))
    }
  }

  const handleBulkGenerate = () => {
    const selected = sortedVideos.filter(v => selectedIds.has(v.id))
    if (selected.length > 0) {
      onGenerateContent(selected)
      setSelectedIds(new Set())
    }
  }

  const SortIcon = ({ field }: { field: string }) => {
    if (sortField !== field) return null
    return sortAsc ? <FiChevronUp className="inline h-3 w-3 ml-1" /> : <FiChevronDown className="inline h-3 w-3 ml-1" />
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight font-serif mb-1">Source Manager</h2>
        <p className="text-muted-foreground text-sm">Fetch YouTube videos to process through the content pipeline</p>
      </div>

      {/* URL Input */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <Input placeholder="https://www.youtube.com/@channel or playlist URL or search query..." value={url} onChange={(e) => setUrl(e.target.value)} className="h-10" />
            </div>
            <select value={sourceType} onChange={(e) => setSourceType(e.target.value as any)} className="h-10 px-3 border border-border bg-secondary text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-ring">
              <option value="channel">Channel</option>
              <option value="playlist">Playlist</option>
              <option value="search">Search Query</option>
            </select>
            <Button onClick={handleFetch} disabled={fetching || !url.trim()} className="h-10">
              {fetching ? <FiLoader className="mr-2 h-4 w-4 animate-spin" /> : <FiSearch className="mr-2 h-4 w-4" />}
              Fetch Videos
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
            <FiAlertCircle className="h-3 w-3" />
            Connect YouTube API in Settings for live data. Currently using simulated fetch.
          </p>
        </CardContent>
      </Card>

      {/* Bulk Actions */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 bg-secondary/50 border px-4 py-3">
          <span className="text-sm font-medium">{selectedIds.size} video{selectedIds.size > 1 ? 's' : ''} selected</span>
          <Button size="sm" onClick={handleBulkGenerate} className="h-8 text-xs">
            <FiZap className="mr-1 h-3 w-3" /> Generate Content
          </Button>
          <Button size="sm" variant="outline" onClick={() => setSelectedIds(new Set())} className="h-8 text-xs">
            Clear
          </Button>
        </div>
      )}

      {/* Videos Table */}
      <Card>
        <CardContent className="p-0">
          {sortedVideos.length === 0 ? (
            <div className="text-center py-16 px-6">
              <FiFilm className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground text-sm mb-2">No videos fetched yet</p>
              <p className="text-muted-foreground text-xs">Add a YouTube source above to get started</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40px]">
                    <Checkbox checked={selectedIds.size === sortedVideos.length && sortedVideos.length > 0} onCheckedChange={toggleAll} />
                  </TableHead>
                  <TableHead className="cursor-pointer select-none text-xs" onClick={() => handleSort('title')}>Title <SortIcon field="title" /></TableHead>
                  <TableHead className="text-xs">Video ID</TableHead>
                  <TableHead className="cursor-pointer select-none text-xs" onClick={() => handleSort('published_at')}>Published <SortIcon field="published_at" /></TableHead>
                  <TableHead className="cursor-pointer select-none text-xs" onClick={() => handleSort('views')}>Views <SortIcon field="views" /></TableHead>
                  <TableHead className="text-xs">Stage</TableHead>
                  <TableHead className="text-xs">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedVideos.map(v => (
                  <TableRow key={v.id}>
                    <TableCell><Checkbox checked={selectedIds.has(v.id)} onCheckedChange={() => toggleSelect(v.id)} /></TableCell>
                    <TableCell>
                      <div className="max-w-[300px]">
                        <p className="text-sm font-medium truncate">{v.title}</p>
                        <p className="text-xs text-muted-foreground">{v.channel_name}</p>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{v.video_id}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatTimestamp(v.published_at).split(',')[0]}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{v.views.toLocaleString()}</TableCell>
                    <TableCell><StageBadge stage={v.stage} /></TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onGenerateContent([v])}>
                          <FiZap className="h-3 w-3" />
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setVideos(prev => prev.filter(p => p.id !== v.id)) }}>
                          <FiTrash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ============================================================================
// CONTENT PIPELINE SCREEN
// ============================================================================

function ContentPipelineScreen({
  videos, updateVideo, addActivity, activeAgentId, setActiveAgentId
}: {
  videos: VideoItem[]
  updateVideo: (id: string, updates: Partial<VideoItem>) => void
  addActivity: (title: string, action: string, result: 'success' | 'error', details?: string) => void
  activeAgentId: string | null
  setActiveAgentId: (id: string | null) => void
}) {
  const [stageFilter, setStageFilter] = useState<'ALL' | 'WRITTEN' | 'READY_TO_POST' | 'ERROR'>('ALL')
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null)
  const [detailTab, setDetailTab] = useState('preview')
  const [imageLoading, setImageLoading] = useState(false)
  const [imageStatus, setImageStatus] = useState<string | null>(null)

  const contentVideos = useMemo(() => {
    return videos.filter(v => {
      if (v.stage === 'NEW') return false
      if (stageFilter === 'ALL') return true
      return v.stage === stageFilter
    })
  }, [videos, stageFilter])

  const selectedVideo = useMemo(() => {
    return videos.find(v => v.id === selectedVideoId) || null
  }, [videos, selectedVideoId])

  const handleGenerateImage = async (video: VideoItem) => {
    setImageLoading(true)
    setImageStatus(null)
    setActiveAgentId(INFOGRAPHIC_AGENT_ID)
    addActivity(video.title, 'Image generation started', 'success')

    const message = `Create an infographic featured image for this blog article. Title: "${video.meta_title || video.title}". Key points from the article about: ${video.meta_description || video.title}`
    const result = await callAIAgent(message, INFOGRAPHIC_AGENT_ID)

    if (result.success) {
      const imageUrl = result?.module_outputs?.artifact_files?.[0]?.file_url || ''
      const altText = result?.response?.result?.alt_text || video.meta_title || ''
      updateVideo(video.id, {
        featured_image_url: imageUrl,
        image_alt_text: altText,
        stage: 'READY_TO_POST' as Stage,
        last_step: 'image_generation',
      })
      setImageStatus('Image generated successfully')
      addActivity(video.title, 'Image generated successfully', 'success')
    } else {
      updateVideo(video.id, {
        last_error: result.error || 'Image generation failed',
        last_step: 'image_generation',
        retry_count: video.retry_count + 1,
      })
      setImageStatus(result.error || 'Image generation failed')
      addActivity(video.title, 'Image generation failed', 'error', result.error)
    }
    setActiveAgentId(null)
    setImageLoading(false)
  }

  const handleMarkReady = (video: VideoItem) => {
    updateVideo(video.id, { stage: 'READY_TO_POST' as Stage })
    addActivity(video.title, 'Marked as ready to post', 'success')
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight font-serif mb-1">Content Pipeline</h2>
        <p className="text-muted-foreground text-sm">Review, edit, and advance articles through the pipeline</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 h-[calc(100vh-220px)]">
        {/* Left Panel - Article List */}
        <div className="lg:col-span-2 flex flex-col">
          <Tabs value={stageFilter} onValueChange={(v) => setStageFilter(v as any)} className="mb-3">
            <TabsList className="w-full h-9">
              <TabsTrigger value="ALL" className="text-xs flex-1">All</TabsTrigger>
              <TabsTrigger value="WRITTEN" className="text-xs flex-1">Written</TabsTrigger>
              <TabsTrigger value="READY_TO_POST" className="text-xs flex-1">Ready</TabsTrigger>
              <TabsTrigger value="ERROR" className="text-xs flex-1">Error</TabsTrigger>
            </TabsList>
          </Tabs>
          <ScrollArea className="flex-1">
            {contentVideos.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">
                <FiFileText className="mx-auto h-8 w-8 mb-2 text-muted-foreground/50" />
                No articles in this stage
              </div>
            ) : (
              <div className="space-y-2 pr-2">
                {contentVideos.map(v => (
                  <Card key={v.id} className={`cursor-pointer transition-colors hover:bg-secondary/30 ${selectedVideoId === v.id ? 'border-foreground/30 bg-secondary/20' : ''}`} onClick={() => setSelectedVideoId(v.id)}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <p className="text-sm font-medium leading-snug line-clamp-2">{v.title}</p>
                        <StageBadge stage={v.stage} />
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        {v.word_count ? <span>{v.word_count} words</span> : null}
                        {v.reading_time_minutes ? <span>{v.reading_time_minutes} min read</span> : null}
                        <a href={`https://www.youtube.com/watch?v=${v.video_id}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-foreground" onClick={e => e.stopPropagation()}>
                          <FiExternalLink className="h-3 w-3" /> Source
                        </a>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>

        {/* Right Panel - Detail View */}
        <div className="lg:col-span-3 flex flex-col">
          {!selectedVideo ? (
            <Card className="flex-1 flex items-center justify-center">
              <div className="text-center text-muted-foreground">
                <FiEye className="mx-auto h-10 w-10 mb-3 text-muted-foreground/40" />
                <p className="text-sm">Select an article to preview</p>
              </div>
            </Card>
          ) : (
            <Card className="flex-1 flex flex-col overflow-hidden">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-base font-semibold tracking-tight truncate">{selectedVideo.meta_title || selectedVideo.title}</CardTitle>
                    <CardDescription className="text-xs mt-1">{selectedVideo.channel_name} / {selectedVideo.video_id}</CardDescription>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    {selectedVideo.stage === 'WRITTEN' && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => handleGenerateImage(selectedVideo)} disabled={imageLoading} className="h-8 text-xs">
                          {imageLoading ? <FiLoader className="mr-1 h-3 w-3 animate-spin" /> : <FiImage className="mr-1 h-3 w-3" />}
                          Generate Image
                        </Button>
                        <Button size="sm" onClick={() => handleMarkReady(selectedVideo)} className="h-8 text-xs">
                          <FiCheck className="mr-1 h-3 w-3" /> Mark Ready
                        </Button>
                      </>
                    )}
                  </div>
                </div>
                {imageStatus && (
                  <p className={`text-xs mt-2 ${imageStatus.includes('failed') ? 'text-red-400' : 'text-green-400'}`}>
                    {imageStatus}
                  </p>
                )}
              </CardHeader>
              <Tabs value={detailTab} onValueChange={setDetailTab} className="flex-1 flex flex-col overflow-hidden">
                <div className="px-6">
                  <TabsList className="h-9">
                    <TabsTrigger value="preview" className="text-xs"><FiEye className="mr-1 h-3 w-3" /> Preview</TabsTrigger>
                    <TabsTrigger value="html" className="text-xs"><FiCode className="mr-1 h-3 w-3" /> HTML</TabsTrigger>
                    <TabsTrigger value="seo" className="text-xs"><FiBarChart2 className="mr-1 h-3 w-3" /> SEO</TabsTrigger>
                    <TabsTrigger value="meta" className="text-xs"><FiTag className="mr-1 h-3 w-3" /> Meta</TabsTrigger>
                  </TabsList>
                </div>
                <div className="flex-1 overflow-hidden">
                  <TabsContent value="preview" className="h-full m-0">
                    <ScrollArea className="h-[calc(100vh-450px)]">
                      <div className="p-6">
                        {selectedVideo.featured_image_url && (
                          <div className="mb-4 border border-border overflow-hidden">
                            <img src={selectedVideo.featured_image_url} alt={selectedVideo.image_alt_text || ''} className="w-full h-auto max-h-[300px] object-cover" />
                            {selectedVideo.image_alt_text && <p className="text-xs text-muted-foreground p-2 bg-secondary/50">{selectedVideo.image_alt_text}</p>}
                          </div>
                        )}
                        {selectedVideo.html_body ? (
                          <div className="prose prose-invert prose-sm max-w-none leading-relaxed" dangerouslySetInnerHTML={{ __html: selectedVideo.html_body }} />
                        ) : (
                          <p className="text-muted-foreground text-sm">No content generated yet.</p>
                        )}
                      </div>
                    </ScrollArea>
                  </TabsContent>
                  <TabsContent value="html" className="h-full m-0">
                    <ScrollArea className="h-[calc(100vh-450px)]">
                      <div className="p-6">
                        <pre className="font-mono text-xs bg-secondary/50 p-4 overflow-x-auto whitespace-pre-wrap break-all border">{selectedVideo.html_body || 'No HTML content.'}</pre>
                      </div>
                    </ScrollArea>
                  </TabsContent>
                  <TabsContent value="seo" className="h-full m-0">
                    <ScrollArea className="h-[calc(100vh-450px)]">
                      <div className="p-6 space-y-4">
                        <div>
                          <h4 className="text-sm font-semibold mb-2">SEO Structure</h4>
                          <pre className="font-mono text-xs bg-secondary/50 p-4 overflow-x-auto whitespace-pre-wrap break-all border">{selectedVideo.seo_structure ? JSON.stringify(safeJsonParse(selectedVideo.seo_structure) || selectedVideo.seo_structure, null, 2) : 'No SEO data.'}</pre>
                        </div>
                        <Separator />
                        <div>
                          <h4 className="text-sm font-semibold mb-2">FAQ Schema</h4>
                          <pre className="font-mono text-xs bg-secondary/50 p-4 overflow-x-auto whitespace-pre-wrap break-all border">{selectedVideo.faq_schema_json ? JSON.stringify(safeJsonParse(selectedVideo.faq_schema_json) || selectedVideo.faq_schema_json, null, 2) : 'No FAQ schema.'}</pre>
                        </div>
                        <Separator />
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Word Count</p>
                            <p className="text-sm font-medium">{selectedVideo.word_count ?? 'N/A'}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Reading Time</p>
                            <p className="text-sm font-medium">{selectedVideo.reading_time_minutes ? `${selectedVideo.reading_time_minutes} minutes` : 'N/A'}</p>
                          </div>
                        </div>
                      </div>
                    </ScrollArea>
                  </TabsContent>
                  <TabsContent value="meta" className="h-full m-0">
                    <ScrollArea className="h-[calc(100vh-450px)]">
                      <div className="p-6 space-y-4">
                        <div>
                          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Meta Title</p>
                          <p className="text-sm font-medium">{selectedVideo.meta_title || 'Not set'}</p>
                        </div>
                        <Separator />
                        <div>
                          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Meta Description</p>
                          <p className="text-sm leading-relaxed">{selectedVideo.meta_description || 'Not set'}</p>
                        </div>
                        <Separator />
                        <div>
                          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Slug</p>
                          <p className="text-sm font-mono">{selectedVideo.slug || 'Not set'}</p>
                        </div>
                        <Separator />
                        <div>
                          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Video ID</p>
                          <p className="text-sm font-mono">{selectedVideo.video_id}</p>
                        </div>
                        {selectedVideo.featured_image_url && (
                          <>
                            <Separator />
                            <div>
                              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Featured Image</p>
                              <a href={selectedVideo.featured_image_url} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-400 hover:underline flex items-center gap-1 break-all">
                                <FiExternalLink className="h-3 w-3 flex-shrink-0" /> {selectedVideo.featured_image_url}
                              </a>
                            </div>
                          </>
                        )}
                      </div>
                    </ScrollArea>
                  </TabsContent>
                </div>
              </Tabs>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// PUBLISHING QUEUE SCREEN
// ============================================================================

function PublishingQueueScreen({
  videos, updateVideo, addActivity, settings, setSettings, activeAgentId, setActiveAgentId
}: {
  videos: VideoItem[]
  updateVideo: (id: string, updates: Partial<VideoItem>) => void
  addActivity: (title: string, action: string, result: 'success' | 'error', details?: string) => void
  settings: PipelineSettings
  setSettings: React.Dispatch<React.SetStateAction<PipelineSettings>>
  activeAgentId: string | null
  setActiveAgentId: (id: string | null) => void
}) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [publishingIds, setPublishingIds] = useState<Set<string>>(new Set())
  const [bulkProgress, setBulkProgress] = useState<{ current: number; total: number } | null>(null)

  const readyVideos = useMemo(() => videos.filter(v => v.stage === 'READY_TO_POST' || v.stage === 'POSTED'), [videos])
  const queueVideos = useMemo(() => videos.filter(v => v.stage === 'READY_TO_POST'), [videos])
  const postedVideos = useMemo(() => videos.filter(v => v.stage === 'POSTED'), [videos])

  const handlePublish = async (video: VideoItem) => {
    setPublishingIds(prev => { const n = new Set(prev); n.add(video.id); return n })
    setActiveAgentId(WP_PUBLISHER_AGENT_ID)
    addActivity(video.title, 'Publishing to WordPress', 'success')

    const message = `Publish this article to WordPress: Title: "${video.meta_title}", Slug: "${video.slug}", HTML Body: ${(video.html_body || '').substring(0, 500)}..., Meta Description: "${video.meta_description}", Featured Image URL: "${video.featured_image_url || ''}", Categories: "${video.categories || 'Uncategorized'}", Tags: "${video.tags || ''}", FAQ Schema: ${video.faq_schema_json || 'none'}, Video ID: "${video.video_id}" (for duplicate prevention)`

    const result = await callAIAgent(message, WP_PUBLISHER_AGENT_ID)

    if (result.success && result?.response?.result) {
      const data = result.response.result
      updateVideo(video.id, {
        stage: 'POSTED' as Stage,
        wp_post_id: data.wp_post_id || '',
        post_url: data.post_url || '',
        published_at_wp: data.published_at || new Date().toISOString(),
        last_step: 'publishing',
      })
      addActivity(video.title, 'Published to WordPress', 'success')
    } else {
      updateVideo(video.id, {
        stage: 'ERROR' as Stage,
        last_error: result.error || result?.response?.result?.error_message || 'Publishing failed',
        last_step: 'publishing',
        retry_count: video.retry_count + 1,
      })
      addActivity(video.title, 'Publishing failed', 'error', result.error)
    }
    setActiveAgentId(null)
    setPublishingIds(prev => { const n = new Set(prev); n.delete(video.id); return n })
  }

  const handleBulkPublish = async () => {
    const toPublish = queueVideos.filter(v => selectedIds.has(v.id))
    if (toPublish.length === 0) return
    setBulkProgress({ current: 0, total: toPublish.length })
    for (let i = 0; i < toPublish.length; i++) {
      setBulkProgress({ current: i + 1, total: toPublish.length })
      await handlePublish(toPublish[i])
    }
    setBulkProgress(null)
    setSelectedIds(new Set())
  }

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight font-serif mb-1">Publishing Queue</h2>
        <p className="text-muted-foreground text-sm">Schedule and publish articles to WordPress</p>
      </div>

      {/* Config Bar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Label className="text-xs whitespace-nowrap">Daily Limit</Label>
              <Input type="number" value={settings.daily_post_limit} onChange={(e) => setSettings(prev => ({ ...prev, daily_post_limit: parseInt(e.target.value) || 1 }))} className="h-8 w-20 text-xs" min={1} max={50} />
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs whitespace-nowrap">Post Between</Label>
              <Input type="number" value={settings.posting_start_hour} onChange={(e) => setSettings(prev => ({ ...prev, posting_start_hour: parseInt(e.target.value) || 0 }))} className="h-8 w-16 text-xs" min={0} max={23} />
              <span className="text-xs text-muted-foreground">-</span>
              <Input type="number" value={settings.posting_end_hour} onChange={(e) => setSettings(prev => ({ ...prev, posting_end_hour: parseInt(e.target.value) || 23 }))} className="h-8 w-16 text-xs" min={0} max={23} />
            </div>
            <div className="flex-1" />
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><span className="w-2 h-2 bg-green-500 rounded-full" /> {queueVideos.length} queued</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 bg-purple-500 rounded-full" /> {postedVideos.length} posted</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Bulk Actions */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 bg-secondary/50 border px-4 py-3">
          <span className="text-sm font-medium">{selectedIds.size} article{selectedIds.size > 1 ? 's' : ''} selected</span>
          <Button size="sm" onClick={handleBulkPublish} disabled={bulkProgress !== null} className="h-8 text-xs">
            {bulkProgress ? <><FiLoader className="mr-1 h-3 w-3 animate-spin" /> Publishing {bulkProgress.current}/{bulkProgress.total}...</> : <><FiSend className="mr-1 h-3 w-3" /> Schedule &amp; Post</>}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setSelectedIds(new Set())} className="h-8 text-xs">Clear</Button>
        </div>
      )}

      {bulkProgress && (
        <Progress value={(bulkProgress.current / bulkProgress.total) * 100} className="h-2" />
      )}

      {/* Queue Table */}
      <Card>
        <CardContent className="p-0">
          {readyVideos.length === 0 ? (
            <div className="text-center py-16 px-6">
              <FiSend className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground text-sm mb-2">No articles ready to publish</p>
              <p className="text-muted-foreground text-xs">Generate content and images in the Pipeline to queue articles</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40px]"><Checkbox checked={selectedIds.size === queueVideos.length && queueVideos.length > 0} onCheckedChange={() => { if (selectedIds.size === queueVideos.length) setSelectedIds(new Set()); else setSelectedIds(new Set(queueVideos.map(v => v.id))) }} /></TableHead>
                  <TableHead className="text-xs">Title</TableHead>
                  <TableHead className="text-xs">Slug</TableHead>
                  <TableHead className="text-xs">Image</TableHead>
                  <TableHead className="text-xs">Categories</TableHead>
                  <TableHead className="text-xs">Tags</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {readyVideos.map(v => (
                  <TableRow key={v.id}>
                    <TableCell><Checkbox checked={selectedIds.has(v.id)} onCheckedChange={() => toggleSelect(v.id)} disabled={v.stage === 'POSTED'} /></TableCell>
                    <TableCell>
                      <div className="max-w-[240px]">
                        <p className="text-sm font-medium truncate">{v.meta_title || v.title}</p>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground max-w-[160px] truncate">{v.slug || '-'}</TableCell>
                    <TableCell>
                      {v.featured_image_url ? (
                        <div className="w-10 h-10 border overflow-hidden">
                          <img src={v.featured_image_url} alt="" className="w-full h-full object-cover" />
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Input value={v.categories || ''} onChange={(e) => updateVideo(v.id, { categories: e.target.value })} className="h-7 text-xs w-28" placeholder="Category" disabled={v.stage === 'POSTED'} />
                    </TableCell>
                    <TableCell>
                      <Input value={v.tags || ''} onChange={(e) => updateVideo(v.id, { tags: e.target.value })} className="h-7 text-xs w-28" placeholder="Tags" disabled={v.stage === 'POSTED'} />
                    </TableCell>
                    <TableCell>
                      {v.stage === 'POSTED' ? (
                        <div className="space-y-1">
                          <StageBadge stage={v.stage} />
                          {v.post_url && (
                            <a href={v.post_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:underline flex items-center gap-1">
                              <FiExternalLink className="h-3 w-3" /> View
                            </a>
                          )}
                        </div>
                      ) : (
                        <StageBadge stage={v.stage} />
                      )}
                    </TableCell>
                    <TableCell>
                      {v.stage === 'READY_TO_POST' && (
                        <Button size="sm" variant="outline" onClick={() => handlePublish(v)} disabled={publishingIds.has(v.id)} className="h-7 text-xs">
                          {publishingIds.has(v.id) ? <FiLoader className="h-3 w-3 animate-spin" /> : <FiSend className="h-3 w-3" />}
                        </Button>
                      )}
                      {v.stage === 'POSTED' && v.wp_post_id && (
                        <span className="text-xs text-muted-foreground font-mono">#{v.wp_post_id}</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ============================================================================
// SETTINGS SCREEN
// ============================================================================

function SettingsScreen({
  settings, setSettings
}: {
  settings: PipelineSettings
  setSettings: React.Dispatch<React.SetStateAction<PipelineSettings>>
}) {
  const [saveStatus, setSaveStatus] = useState<string | null>(null)
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({})

  const handleSave = () => {
    setSaveStatus('Settings saved successfully')
    setTimeout(() => setSaveStatus(null), 3000)
  }

  const togglePassword = (field: string) => {
    setShowPasswords(prev => ({ ...prev, [field]: !prev[field] }))
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-2xl font-bold tracking-tight font-serif mb-1">Settings</h2>
        <p className="text-muted-foreground text-sm">Configure API connections, content defaults, and pipeline behavior</p>
      </div>

      {saveStatus && (
        <div className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/20 text-green-400 text-sm">
          <FiCheck className="h-4 w-4" /> {saveStatus}
        </div>
      )}

      {/* API Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold tracking-tight flex items-center gap-2">
            <FiDatabase className="text-muted-foreground" /> API Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs">Supadata API Key</Label>
            <div className="flex gap-2">
              <Input type={showPasswords['supadata'] ? 'text' : 'password'} value={settings.supadata_key} onChange={(e) => setSettings(prev => ({ ...prev, supadata_key: e.target.value }))} placeholder="sk-..." className="font-mono text-xs" />
              <Button size="sm" variant="outline" onClick={() => togglePassword('supadata')} className="h-9 px-3"><FiEye className="h-3 w-3" /></Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-xs">YouTube API Key</Label>
            <div className="flex gap-2">
              <Input type={showPasswords['youtube'] ? 'text' : 'password'} value={settings.youtube_api_key} onChange={(e) => setSettings(prev => ({ ...prev, youtube_api_key: e.target.value }))} placeholder="AIza..." className="font-mono text-xs" />
              <Button size="sm" variant="outline" onClick={() => togglePassword('youtube')} className="h-9 px-3"><FiEye className="h-3 w-3" /></Button>
            </div>
          </div>
          <Separator />
          <div className="space-y-2">
            <Label className="text-xs">WordPress URL</Label>
            <Input value={settings.wordpress_url} onChange={(e) => setSettings(prev => ({ ...prev, wordpress_url: e.target.value }))} placeholder="https://your-site.com" className="text-xs" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs">WordPress Username</Label>
              <Input value={settings.wordpress_username} onChange={(e) => setSettings(prev => ({ ...prev, wordpress_username: e.target.value }))} placeholder="admin" className="text-xs" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">WordPress Password / App Key</Label>
              <div className="flex gap-2">
                <Input type={showPasswords['wp'] ? 'text' : 'password'} value={settings.wordpress_password} onChange={(e) => setSettings(prev => ({ ...prev, wordpress_password: e.target.value }))} className="font-mono text-xs" />
                <Button size="sm" variant="outline" onClick={() => togglePassword('wp')} className="h-9 px-3"><FiEye className="h-3 w-3" /></Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Content Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold tracking-tight flex items-center gap-2">
            <FiEdit className="text-muted-foreground" /> Content Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs">Image Style Prompt</Label>
            <Textarea value={settings.image_style} onChange={(e) => setSettings(prev => ({ ...prev, image_style: e.target.value }))} placeholder="Minimalist infographic with clean lines..." className="text-xs" rows={2} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs">Brand Name</Label>
              <Input value={settings.brand_name} onChange={(e) => setSettings(prev => ({ ...prev, brand_name: e.target.value }))} placeholder="Your Brand" className="text-xs" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Default CTA Text</Label>
              <Input value={settings.default_cta} onChange={(e) => setSettings(prev => ({ ...prev, default_cta: e.target.value }))} placeholder="Subscribe for more..." className="text-xs" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Pipeline Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold tracking-tight flex items-center gap-2">
            <FiSettings className="text-muted-foreground" /> Pipeline Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs">Max Process Per Run</Label>
              <Input type="number" value={settings.max_process_per_run} onChange={(e) => setSettings(prev => ({ ...prev, max_process_per_run: parseInt(e.target.value) || 1 }))} className="text-xs" min={1} max={50} />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Retry Limit</Label>
              <Input type="number" value={settings.retry_limit} onChange={(e) => setSettings(prev => ({ ...prev, retry_limit: parseInt(e.target.value) || 1 }))} className="text-xs" min={0} max={10} />
            </div>
          </div>
          <Separator />
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm">Enable Scheduling</Label>
                <p className="text-xs text-muted-foreground">Auto-publish articles on schedule</p>
              </div>
              <Switch checked={settings.enable_scheduling} onCheckedChange={(v) => setSettings(prev => ({ ...prev, enable_scheduling: v }))} />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm">Enable FAQ Schema</Label>
                <p className="text-xs text-muted-foreground">Generate FAQ structured data for SEO</p>
              </div>
              <Switch checked={settings.enable_faq_schema} onCheckedChange={(v) => setSettings(prev => ({ ...prev, enable_faq_schema: v }))} />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm">Enable Internal Links</Label>
                <p className="text-xs text-muted-foreground">Auto-link to related articles</p>
              </div>
              <Switch checked={settings.enable_internal_links} onCheckedChange={(v) => setSettings(prev => ({ ...prev, enable_internal_links: v }))} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Button onClick={handleSave} className="w-full">
        Save Settings
      </Button>
    </div>
  )
}

// ============================================================================
// AGENT STATUS PANEL
// ============================================================================

function AgentStatusPanel({ activeAgentId }: { activeAgentId: string | null }) {
  const agents = [
    { id: CONTENT_PIPELINE_AGENT_ID, name: 'Content Pipeline Manager', purpose: 'Orchestrates transcript extraction, SEO planning, and article writing' },
    { id: INFOGRAPHIC_AGENT_ID, name: 'Infographic Generator', purpose: 'Creates DALL-E 3 featured images from article content' },
    { id: WP_PUBLISHER_AGENT_ID, name: 'WordPress Publisher', purpose: 'Publishes articles to WordPress via REST API on schedule' },
  ]

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Agent Status</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {agents.map(a => (
          <div key={a.id} className="flex items-center gap-2">
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${activeAgentId === a.id ? 'bg-green-500 animate-pulse' : 'bg-muted-foreground/40'}`} />
            <div className="min-w-0">
              <p className="text-xs font-medium truncate">{a.name}</p>
              <p className="text-[10px] text-muted-foreground truncate">{a.purpose}</p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function Page() {
  const [screen, setScreen] = useState<ScreenName>('dashboard')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [sampleData, setSampleData] = useState(false)
  const [videos, setVideos] = useState<VideoItem[]>([])
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([])
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null)
  const [contentGeneratingIds, setContentGeneratingIds] = useState<Set<string>>(new Set())
  const [bulkContentProgress, setBulkContentProgress] = useState<{ current: number; total: number } | null>(null)

  const [settings, setSettings] = useState<PipelineSettings>({
    supadata_key: '',
    youtube_api_key: '',
    wordpress_url: '',
    wordpress_username: '',
    wordpress_password: '',
    image_style: 'Clean, minimalist infographic with bold typography',
    brand_name: '',
    default_cta: 'Subscribe for more content like this!',
    max_process_per_run: 5,
    retry_limit: 3,
    enable_scheduling: true,
    enable_faq_schema: true,
    enable_internal_links: false,
    daily_post_limit: 3,
    posting_start_hour: 8,
    posting_end_hour: 20,
  })

  // Toggle sample data
  useEffect(() => {
    if (sampleData) {
      setVideos(SAMPLE_VIDEOS)
      setActivityLogs(SAMPLE_ACTIVITY)
    } else {
      setVideos([])
      setActivityLogs([])
    }
  }, [sampleData])

  const updateVideo = useCallback((id: string, updates: Partial<VideoItem>) => {
    setVideos(prev => prev.map(v => v.id === id ? { ...v, ...updates } : v))
  }, [])

  const addActivity = useCallback((videoTitle: string, action: string, result: 'success' | 'error', details?: string) => {
    setActivityLogs(prev => [{
      id: generateId(),
      timestamp: new Date().toISOString(),
      video_title: videoTitle,
      action,
      result,
      details,
    }, ...prev].slice(0, 50))
  }, [])

  const handleGenerateContent = useCallback(async (video: VideoItem) => {
    setContentGeneratingIds(prev => { const n = new Set(prev); n.add(video.id); return n })
    setActiveAgentId(CONTENT_PIPELINE_AGENT_ID)
    updateVideo(video.id, { stage: 'TRANSCRIBED' as Stage, last_step: 'content_generation' })
    addActivity(video.title, 'Content generation started', 'success')

    const message = `Generate a complete SEO-optimized blog article from this YouTube video. Video URL: https://www.youtube.com/watch?v=${video.video_id}, Video Title: ${video.title}, Channel: ${video.channel_name}. Extract the transcript, create an SEO structure, and write the full article.`

    const result = await callAIAgent(message, CONTENT_PIPELINE_AGENT_ID)

    if (result.success && result?.response?.result) {
      const data = result.response.result
      updateVideo(video.id, {
        stage: 'WRITTEN' as Stage,
        html_body: data.html_body || '',
        meta_title: data.meta_title || '',
        meta_description: data.meta_description || '',
        slug: data.slug || '',
        faq_schema_json: data.faq_schema_json || '',
        seo_structure: typeof data.seo_structure === 'string' ? data.seo_structure : JSON.stringify(data.seo_structure || {}),
        word_count: data.word_count || 0,
        reading_time_minutes: data.reading_time_minutes || 0,
        last_step: 'content_generation',
      })
      addActivity(video.title, 'Content generated successfully', 'success')
    } else {
      updateVideo(video.id, {
        stage: 'ERROR' as Stage,
        last_error: result.error || 'Content generation failed',
        last_step: 'content_generation',
        retry_count: video.retry_count + 1,
      })
      addActivity(video.title, 'Content generation failed', 'error', result.error)
    }
    setActiveAgentId(null)
    setContentGeneratingIds(prev => { const n = new Set(prev); n.delete(video.id); return n })
  }, [updateVideo, addActivity])

  const handleBulkGenerateContent = useCallback(async (videosToProcess: VideoItem[]) => {
    setBulkContentProgress({ current: 0, total: videosToProcess.length })
    for (let i = 0; i < videosToProcess.length; i++) {
      setBulkContentProgress({ current: i + 1, total: videosToProcess.length })
      await handleGenerateContent(videosToProcess[i])
    }
    setBulkContentProgress(null)
  }, [handleGenerateContent])

  const handleRetry = useCallback((video: VideoItem) => {
    if (video.last_step === 'publishing') {
      updateVideo(video.id, { stage: 'READY_TO_POST' as Stage, last_error: undefined })
    } else if (video.last_step === 'image_generation') {
      updateVideo(video.id, { stage: 'WRITTEN' as Stage, last_error: undefined })
    } else {
      handleGenerateContent({ ...video, stage: 'NEW' as Stage })
    }
  }, [updateVideo, handleGenerateContent])

  const navItems: { key: ScreenName; icon: React.ReactNode; label: string }[] = [
    { key: 'dashboard', icon: <FiHome />, label: 'Dashboard' },
    { key: 'sources', icon: <FiFilm />, label: 'Source Manager' },
    { key: 'pipeline', icon: <FiFileText />, label: 'Content Pipeline' },
    { key: 'publishing', icon: <FiSend />, label: 'Publishing Queue' },
    { key: 'settings', icon: <FiSettings />, label: 'Settings' },
  ]

  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = { NEW: 0, TRANSCRIBED: 0, WRITTEN: 0, READY_TO_POST: 0, POSTED: 0, ERROR: 0 }
    videos.forEach(v => { counts[v.stage] = (counts[v.stage] || 0) + 1 })
    return counts
  }, [videos])

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-background text-foreground flex">
        {/* Sidebar */}
        <aside className={`flex-shrink-0 border-r bg-card flex flex-col transition-all duration-200 ${sidebarCollapsed ? 'w-16' : 'w-56'}`}>
          {/* Sidebar Header */}
          <div className={`flex items-center h-14 border-b px-4 ${sidebarCollapsed ? 'justify-center' : 'justify-between'}`}>
            {!sidebarCollapsed && (
              <h1 className="text-base font-bold tracking-tight font-serif">ContentFlow</h1>
            )}
            <button onClick={() => setSidebarCollapsed(!sidebarCollapsed)} className="text-muted-foreground hover:text-foreground transition-colors p-1">
              {sidebarCollapsed ? <FiChevronRight className="h-4 w-4" /> : <FiChevronLeft className="h-4 w-4" />}
            </button>
          </div>

          {/* Nav Items */}
          <nav className="flex-1 py-2">
            {navItems.map(item => (
              <NavItem key={item.key} icon={item.icon} label={item.label} active={screen === item.key} onClick={() => setScreen(item.key)} collapsed={sidebarCollapsed} />
            ))}
          </nav>

          {/* Agent Status */}
          {!sidebarCollapsed && (
            <div className="p-3 border-t">
              <AgentStatusPanel activeAgentId={activeAgentId} />
            </div>
          )}
        </aside>

        {/* Main Area */}
        <main className="flex-1 flex flex-col min-w-0">
          {/* Top Header */}
          <header className="h-14 border-b flex items-center justify-between px-6 flex-shrink-0">
            <div className="flex items-center gap-4">
              <button className="lg:hidden text-muted-foreground hover:text-foreground" onClick={() => setSidebarCollapsed(!sidebarCollapsed)}>
                <FiMenu className="h-5 w-5" />
              </button>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 bg-blue-500 rounded-full" /> {stageCounts['NEW'] || 0}</span>
                <span className="text-border">/</span>
                <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 bg-yellow-500 rounded-full" /> {stageCounts['WRITTEN'] || 0}</span>
                <span className="text-border">/</span>
                <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 bg-green-500 rounded-full" /> {stageCounts['READY_TO_POST'] || 0}</span>
                <span className="text-border">/</span>
                <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 bg-purple-500 rounded-full" /> {stageCounts['POSTED'] || 0}</span>
                {(stageCounts['ERROR'] || 0) > 0 && (
                  <>
                    <span className="text-border">/</span>
                    <span className="flex items-center gap-1 text-red-400"><span className="w-1.5 h-1.5 bg-red-500 rounded-full" /> {stageCounts['ERROR']}</span>
                  </>
                )}
              </div>
            </div>
            <div className="flex items-center gap-4">
              {bulkContentProgress && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <FiLoader className="h-3 w-3 animate-spin" />
                  Processing {bulkContentProgress.current}/{bulkContentProgress.total}
                </div>
              )}
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground">Sample Data</Label>
                <Switch checked={sampleData} onCheckedChange={setSampleData} />
              </div>
            </div>
          </header>

          {/* Content */}
          <div className="flex-1 overflow-y-auto">
            <div className="p-6">
              {screen === 'dashboard' && (
                <DashboardScreen videos={videos} activityLogs={activityLogs} activeAgentId={activeAgentId} onRetry={handleRetry} />
              )}
              {screen === 'sources' && (
                <SourceManagerScreen videos={videos} setVideos={setVideos} addActivity={addActivity} activeAgentId={activeAgentId} setActiveAgentId={setActiveAgentId} onGenerateContent={handleBulkGenerateContent} />
              )}
              {screen === 'pipeline' && (
                <ContentPipelineScreen videos={videos} updateVideo={updateVideo} addActivity={addActivity} activeAgentId={activeAgentId} setActiveAgentId={setActiveAgentId} />
              )}
              {screen === 'publishing' && (
                <PublishingQueueScreen videos={videos} updateVideo={updateVideo} addActivity={addActivity} settings={settings} setSettings={setSettings} activeAgentId={activeAgentId} setActiveAgentId={setActiveAgentId} />
              )}
              {screen === 'settings' && (
                <SettingsScreen settings={settings} setSettings={setSettings} />
              )}
            </div>
          </div>
        </main>
      </div>
    </ErrorBoundary>
  )
}
