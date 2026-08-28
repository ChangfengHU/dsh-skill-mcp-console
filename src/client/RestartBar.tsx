/**
 * The bar that says a restart is owed, and takes it.
 *
 * A package installed into the profile is on disk and in the composition
 * file, but the loader only publishes `exit()` — described in its own types
 * as "Hook for hosts that can restart the process on full-reload requests" —
 * so its fiber does not exist until the process comes back. Installed and
 * running are two states, and the gap between them is the one place someone
 * is left waiting for something that will never happen by itself.
 *
 * @module dsh-plugin-station/client/RestartBar
 */

import { useCallback, useEffect, useState } from 'react'
import type { T } from './ui.tsx'

/** The two calls this bar needs. */
export interface RestartApi {
  pendingRestart: () => Promise<{ added: string[]; removed: string[] }>
  restartHost: () => Promise<{ restarting: boolean }>
}

/**
 * @param api - the host seam.
 * @param t - translator.
 * @param nonce - bump to re-check after an install.
 */
export function RestartBar({ api, t, nonce = 0, auto = false }: {
  api: RestartApi; t: T; nonce?: number; auto?: boolean
}) {
  const [added, setAdded] = useState<string[]>([])
  const [removed, setRemoved] = useState<string[]>([])
  const [going, setGoing] = useState(false)

  const check = useCallback(async () => {
    try {
      const result = await api.pendingRestart()
      setAdded(result.added ?? [])
      setRemoved(result.removed ?? [])
    } catch { /* leave it quiet */ }
  }, [api])

  useEffect(() => { void check() }, [check, nonce])

  // A removal leaves the Host running against deleted files, so the restart
  // is not optional and is not worth a click. Installs stay manual: an
  // inert new plugin harms nothing, and interrupting someone mid-browse to
  // restart the app would.
  useEffect(() => {
    if (!auto || going) return
    setGoing(true)
    void api.restartHost()
  }, [auto, going, api])

  // Wait for the Host to go DOWN before waiting for it to come back.
  //
  // Reloading on the first successful probe reloads against the process
  // that is still on its way out — it answers for the few hundred
  // milliseconds between the reply and the exit — so the page comes back
  // showing exactly the state the restart was meant to change. Requiring a
  // failed probe first is what makes "it is back" mean a different process.
  //
  // If it never goes down, nothing reloads and the bar keeps saying so,
  // which is the honest outcome where no supervisor restarts it.
  useEffect(() => {
    if (!going) return
    let sawDown = false
    const timer = setInterval(async () => {
      try {
        const response = await fetch(`${location.origin}/`, { method: 'HEAD', cache: 'no-store' })
        if (!response.ok) { sawDown = true; return }
        if (sawDown) location.reload()
      } catch { sawDown = true }
    }, 1000)
    return () => clearInterval(timer)
  }, [going])

  if (added.length === 0 && removed.length === 0 && !going) return null

  return (
    <div className="dps-restart">
      <span className="dps-grow">
        {going ? t('restarting') : (
          <>
            {added.length ? <div>{t('restartPending', { list: added.join(', ') })}</div> : null}
            {/* A removed package whose fiber is still running is the more
                confusing of the two: its menus are still on screen, so the
                uninstall looks like it did nothing at all. */}
            {removed.length ? <div>{t('restartRemoved', { list: removed.join(', ') })}</div> : null}
          </>
        )}
      </span>
      {!going ? (
        <button className="dps-btn dps-primary" onClick={async () => { setGoing(true); await api.restartHost() }}>
          {t('restartNow')}
        </button>
      ) : null}
    </div>
  )
}
