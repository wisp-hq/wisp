import { useEffect, useState } from 'react';

export type ParticipantRoleHint = 'owner' | 'player' | 'viewer';

// Read the role hint from the parent's URL fragment, set by the launcher when a
// guest claims a share (#shared for viewer, #playerN for player). Owners load
// /s/<id>/ without a fragment.
export function useParticipantRoleHint(): ParticipantRoleHint {
  const [role, setRole] = useState<ParticipantRoleHint>(() => readRole());

  useEffect(() => {
    function onHashChange() {
      setRole(readRole());
    }
    try {
      window.parent.addEventListener('hashchange', onHashChange);
      return () => {
        try {
          window.parent.removeEventListener('hashchange', onHashChange);
        } catch {
          /* parent gone */
        }
      };
    } catch {
      return;
    }
  }, []);

  return role;
}

export function useIsViewer(): boolean {
  return useParticipantRoleHint() === 'viewer';
}

function readRole(): ParticipantRoleHint {
  try {
    const hash = window.parent.location.hash;
    if (hash === '#shared') {
      return 'viewer';
    }

    if (/^#player\d+$/.test(hash)) {
      return 'player';
    }

    return 'owner';
  } catch {
    return 'owner';
  }
}
