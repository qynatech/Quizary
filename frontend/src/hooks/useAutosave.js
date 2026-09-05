import { useRef, useState, useCallback } from 'react'
import api from '../api/client'
import { sessionTokenHeaders } from '../lib/sessionToken'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const draftKey = (sid) => `quizary_draft_${sid}`

/**
 * Draft offline — jaring pengaman untuk jawaban yang belum sempat sampai ke
 * server (internet mati, tab ditutup sebelum autosave berhasil). Disimpan per
 * submission_id sehingga anonim maupun login dilayani jalur yang sama.
 * Entri dihapus begitu tersimpan ke server; seluruh kunci dihapus saat sesi
 * selesai (clearDraft). Tidak punya TTL — persisten sampai salah satu itu.
 */
export function loadDraft(submissionId) {
  try {
    return JSON.parse(localStorage.getItem(draftKey(submissionId))) || {}
  } catch {
    return {}
  }
}

export function clearDraft(submissionId) {
  try {
    localStorage.removeItem(draftKey(submissionId))
  } catch {}
}

/**
 * useAutosave — debounce 500ms + retry exponential backoff untuk autosave.
 * Status per pertanyaan: 'saving' | 'saved' | 'error' | null (idle).
 */
export function useAutosave({ submissionId, onExpired }) {
  const timers = useRef({})
  const [statuses, setStatuses] = useState({})

  const setStatus = useCallback((qId, status) => {
    setStatuses((prev) => ({ ...prev, [qId]: status }))
  }, [])

  const dropDraftEntry = useCallback((qId) => {
    try {
      const all = loadDraft(submissionId)
      delete all[qId]
      if (Object.keys(all).length) localStorage.setItem(draftKey(submissionId), JSON.stringify(all))
      else localStorage.removeItem(draftKey(submissionId))
    } catch {}
  }, [submissionId])

  // Nilai jawaban: array (option_ids) | string (answer_text) | object
  // {ids, text} (opsi + teks "Lainnya"). Objek dipertahankan apa adanya
  // agar draft/restore tidak kehilangan separuh jawaban campuran.
  const toPayload = (qId, value) => {
    if (Array.isArray(value)) return { question_id: qId, option_ids: value }
    if (value && typeof value === 'object') {
      return { question_id: Number(qId), option_ids: value.ids || [], answer_text: value.text ?? null }
    }
    return { question_id: qId, answer_text: value }
  }

  const draftValue = (payload) => {
    if (Array.isArray(payload.option_ids)) {
      return payload.answer_text != null
        ? { ids: payload.option_ids, text: payload.answer_text }
        : payload.option_ids
    }
    return payload.answer_text
  }

  const isEmptyValue = (value) => Array.isArray(value)
    ? !value.length
    : (value && typeof value === 'object'
      ? !(value.ids || []).length && !String(value.text || '').trim()
      : !value)

  const stashDraft = useCallback((qId, payload) => {
    try {
      const all = loadDraft(submissionId)
      const value = draftValue(payload)
      // Nilai kosong tidak distash — menghindari menghidupkan jawaban yang
      // memang sengaja dikosongkan user saat offline.
      if (isEmptyValue(value)) dropDraftEntry(qId)
      else {
        all[qId] = { value, ts: Date.now() }
        localStorage.setItem(draftKey(submissionId), JSON.stringify(all))
      }
    } catch {} // storage penuh/blocked — autosave server tetap jalan
  }, [submissionId, dropDraftEntry])

  const flush = useCallback(async (qId, payload) => {
    const attempt = async (retriesLeft = 2) => {
      try {
        const res = await api.patch(`/submissions/${submissionId}/autosave`, payload, { headers: sessionTokenHeaders(submissionId) })
        if (res.status === 410 || (res.data && res.data.detail && String(res.data.detail).toLowerCase().includes('expired'))) {
          onExpired?.()
          return
        }
        setStatus(qId, 'saved')
        dropDraftEntry(qId)
      } catch (err) {
        if (err.response?.status === 410) {
          onExpired?.()
          return
        }
        const retryable = !err.response || err.response.status >= 500
        if (retryable && retriesLeft > 0) {
          await sleep(400 * (3 - retriesLeft))
          return attempt(retriesLeft - 1)
        }
        setStatus(qId, 'error') // draft lokal dipertahankan sebagai cadangan
        throw err
      }
    }
    await attempt()
  }, [submissionId, onExpired, setStatus, dropDraftEntry])

  const save = useCallback((qId, value) => {
    clearTimeout(timers.current[qId])
    setStatus(qId, 'saving')
    const payload = toPayload(qId, value)
    stashDraft(qId, payload)
    timers.current[qId] = setTimeout(() => {
      flush(qId, payload)
    }, 500)
  }, [flush, setStatus, stashDraft])

  const flushAll = useCallback(async (answers) => {
    const tasks = Object.entries(answers).map(([qId, value]) => {
      clearTimeout(timers.current[qId])
      return flush(qId, toPayload(qId, value))
    })
    await Promise.all(tasks)
  }, [flush])

  const clearTimers = useCallback(() => {
    Object.values(timers.current).forEach((t) => clearTimeout(t))
    timers.current = {}
  }, [])

  return { statuses, save, flushAll, clearTimers }
}
