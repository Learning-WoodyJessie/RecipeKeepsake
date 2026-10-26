'use client'
// Reads the user's background captures and keeps them fresh.
//
// - Asks the server once per page session whether background capture is on for this user.
//   ANY failure answers "no", so the original capture flow keeps working exactly as before.
// - Polls only while a job is being worked on and the page is visible (nextPollDelay).
// - Refreshes immediately when the app comes back to the foreground, which is how a user
//   who locked their phone or switched apps sees their finished recipe without a push notification.
import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'
import { nextPollDelay, type CaptureJob } from '@/lib/captureJobs'

let featureAnswer: Promise<boolean> | null = null

export function captureJobsEnabled(): Promise<boolean> {
  if (!featureAnswer) {
    featureAnswer = api.features.get().then((f) => f.capture_jobs).catch(() => {
      featureAnswer = null          // not cached: a later call (e.g. once signed in) may succeed
      return false
    })
  }
  return featureAnswer
}

export function useCaptureJobs() {
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [jobs, setJobs] = useState<CaptureJob[]>([])
  const [tick, setTick] = useState(0)
  const alive = useRef(true)

  const refresh = useCallback(async () => {
    try {
      const list = await api.captureJobs.list()
      if (alive.current) setJobs(list)
    } catch {
      /* offline or a hiccup: keep what we have and try again on the next trigger */
    } finally {
      if (alive.current) setTick((t) => t + 1)        // lets the polling effect schedule another look
    }
  }, [])

  useEffect(() => {
    alive.current = true
    captureJobsEnabled().then((on) => {
      if (!alive.current) return
      setEnabled(on)
      if (on) void refresh()
    })
    return () => { alive.current = false }
  }, [refresh])

  // While something is being worked on, look again every few seconds.
  useEffect(() => {
    if (!enabled) return
    const delay = nextPollDelay(jobs, { visible: document.visibilityState === 'visible', enabled })
    if (delay === null) return
    const timer = setTimeout(() => void refresh(), delay)
    return () => clearTimeout(timer)
  }, [enabled, jobs, tick, refresh])

  // Coming back to the page or the app: look immediately.
  useEffect(() => {
    if (!enabled) return
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh() }
    document.addEventListener('visibilitychange', onVisible)
    let removeNative: (() => void) | undefined
    import('@capacitor/app')
      .then(({ App }) => App.addListener('appStateChange', ({ isActive }) => { if (isActive) void refresh() }))
      .then((handle) => { removeNative = () => void handle.remove() })
      .catch(() => { /* plain web: no native shell */ })
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      removeNative?.()
    }
  }, [enabled, refresh])

  const retry = useCallback(async (id: string) => { await api.captureJobs.retry(id); await refresh() }, [refresh])
  const discard = useCallback(async (id: string) => { await api.captureJobs.discard(id); await refresh() }, [refresh])

  return { enabled, jobs, refresh, retry, discard }
}
