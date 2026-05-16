import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useApplyAudioOutput } from '@/hooks/use-apply-audio-output';
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts';
import { useParentMessage } from '@/hooks/use-parent-message';
import { useParticipantNotifications } from '@/hooks/use-participant-notifications';
import { useSession } from '@/hooks/use-session';
import { useHudPrefs } from '@/lib/hud-prefs';
import { useSelkiesBridge } from '@/lib/selkies-bridge';
import { useParticipantRoleHint } from '@/lib/use-participant-role';
import { HudPanel } from './hud-panel';

type Mode = 'handle' | 'panel' | 'hidden';

interface HudOverlayProps {
  sessionId: string;
}

// Iframe geometry per mode, driven from the React side so future tweaks
// don't require a wisp server rebuild — the proxy script just relays whatever
// we send.
const GEOMETRY: Record<Mode, Record<string, string>> = {
  handle: { top: '32px', left: '50%', right: 'auto', bottom: 'auto', transform: 'translateX(-50%)', width: '80px', height: '80px' },
  panel: { top: '0', left: '0', right: 'auto', bottom: 'auto', transform: 'none', width: '100vw', height: '100vh' },
  hidden: { top: '0', left: '0', right: 'auto', bottom: 'auto', transform: 'none', width: '1px', height: '1px' },
};

function postSize(mode: Mode) {
  if (window.parent === window) {
    return;
  }

  window.parent.postMessage({ type: 'hud:size', mode, geometry: GEOMETRY[mode] }, window.location.origin);
}

// Bounce focus back to Selkies' parent doc on close so the keyboard shortcut
// keeps working without the user having to refocus the window manually.
function releaseFocusToParent() {
  try {
    (document.activeElement as HTMLElement | null)?.blur();
    window.parent.focus();
  } catch {
    // same-origin → SecurityError shouldn't happen, but defensive.
  }
}

export function HudOverlay({ sessionId }: HudOverlayProps) {
  const { t } = useTranslation();
  const [prefs] = useHudPrefs();
  const roleHint = useParticipantRoleHint();
  const isGuest = roleHint !== 'owner';
  const restingMode: Mode = isGuest || prefs.hideHandle ? 'hidden' : 'handle';
  const [mode, setMode] = useState<Mode>(() => restingMode);
  const { session, app, isOwner, quit: quitSession, quitPending, goHome, requestFullscreen } = useSession(sessionId);
  const initialMode = useRef(mode);
  const bridge = useSelkiesBridge();
  useApplyAudioOutput(prefs.audioOutputDeviceId);
  useParticipantNotifications(sessionId, isOwner);

  // Push prefs to Selkies whenever they change AND Selkies is ready. Running
  // this at the overlay level means stats keep polling and prefs stay synced
  // even while the panel is collapsed to the handle.
  useEffect(() => {
    if (bridge.ready) {
      bridge.applyPrefs(prefs);
    }
  }, [bridge.ready, bridge.applyPrefs, prefs]);

  useEffect(() => {
    postSize(initialMode.current);
  }, []);

  const toggle = useCallback(() => {
    setMode((current) => {
      if (current === 'panel') {
        releaseFocusToParent();
        return restingMode;
      }

      return 'panel';
    });
  }, [restingMode]);

  useParentMessage((ev) => {
    const data = ev.data as { type?: string } | null;
    if (!data) {
      return;
    }

    if (data.type === 'hud:toggle') {
      toggle();
    } else if (data.type === 'hud:quit') {
      quitSession();
    } else if (data.type === 'hud:home') {
      goHome();
    }
  });

  useKeyboardShortcuts(
    { meta: true, alt: true },
    {
      o: toggle,
      q: quitSession,
      h: goHome,
      f: requestFullscreen,
    },
  );

  useEffect(() => {
    postSize(mode);
  }, [mode]);

  useEffect(() => {
    if (mode !== 'panel') {
      return;
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        setMode(restingMode);
        releaseFocusToParent();
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mode, restingMode]);

  function openPanel() {
    setMode('panel');
  }

  function closePanel() {
    setMode(restingMode);
    releaseFocusToParent();
  }

  if (mode === 'hidden') {
    return null;
  }

  if (mode === 'handle') {
    return (
      <button
        type="button"
        onClick={openPanel}
        aria-label={t('hud.overlay.openMenu')}
        className="group fixed left-1/2 top-1/2 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-border/70 bg-background/85 shadow-xl backdrop-blur transition hover:scale-110 hover:bg-background focus-visible:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <img src="/wisp.svg" alt="" className="h-9 w-9 rounded-md" draggable={false} />
      </button>
    );
  }

  return <HudPanel app={app} session={session} sessionId={sessionId} isOwner={isOwner} bridge={bridge} onClose={closePanel} onGoHome={goHome} onQuit={quitSession} onFullscreen={requestFullscreen} quitPending={quitPending} />;
}
