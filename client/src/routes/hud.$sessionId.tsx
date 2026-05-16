import { createFileRoute } from '@tanstack/react-router';
import { useEffect } from 'react';
import { HudOverlay } from '@/components/hud/hud-overlay';

export const Route = createFileRoute('/hud/$sessionId')({
  component: HudRoute,
});

function HudRoute() {
  const { sessionId } = Route.useParams();

  // The HUD lives inside a transparent overlay iframe. Force transparent
  // backgrounds and hide overflow so the SPA's default body styling doesn't
  // paint a rectangle or spawn scrollbars when the bubble overflows the tiny
  // iframe viewport.
  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    const prev = {
      htmlBg: root.style.background,
      htmlOverflow: root.style.overflow,
      bodyBg: body.style.background,
      bodyOverflow: body.style.overflow,
      bodyMargin: body.style.margin,
    };
    root.style.background = 'transparent';
    root.style.overflow = 'hidden';
    body.style.background = 'transparent';
    body.style.overflow = 'hidden';
    body.style.margin = '0';
    return () => {
      root.style.background = prev.htmlBg;
      root.style.overflow = prev.htmlOverflow;
      body.style.background = prev.bodyBg;
      body.style.overflow = prev.bodyOverflow;
      body.style.margin = prev.bodyMargin;
    };
  }, []);

  return <HudOverlay sessionId={sessionId} />;
}
