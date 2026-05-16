package progress

import "sync"

// Tracker holds short-lived pull progress per session and dispatches updates to
// SSE subscribers. Progress is purely in-memory — it's not durable, and on a
// launcher restart subscribers reconnect to an empty tracker.
type Tracker struct {
	mu       sync.RWMutex
	progress map[string]int
	subs     map[string]map[chan int]struct{}
}

func New() *Tracker {
	return &Tracker{
		progress: make(map[string]int),
		subs:     make(map[string]map[chan int]struct{}),
	}
}

// Set records the current percent and fans it out to all live subscribers. The
// channels are buffered, but non-blocking: a slow subscriber drops the tick.
func (t *Tracker) Set(sessionID string, percent int) {
	t.mu.Lock()
	t.progress[sessionID] = percent
	subs := t.subs[sessionID]
	t.mu.Unlock()
	for ch := range subs {
		select {
		case ch <- percent:
		default:
		}
	}
}

// Subscribe returns a channel that receives every progress tick for sessionID
// (plus the last-known value immediately, if any). The cleanup func must be
// called when done.
func (t *Tracker) Subscribe(sessionID string) (<-chan int, func()) {
	ch := make(chan int, 8)
	t.mu.Lock()
	if t.subs[sessionID] == nil {
		t.subs[sessionID] = make(map[chan int]struct{})
	}

	t.subs[sessionID][ch] = struct{}{}
	last, has := t.progress[sessionID]
	t.mu.Unlock()
	if has {
		ch <- last
	}

	return ch, func() {
		t.mu.Lock()
		delete(t.subs[sessionID], ch)
		if len(t.subs[sessionID]) == 0 {
			delete(t.subs, sessionID)
		}

		t.mu.Unlock()
	}
}

// Clear drops the per-session state once the spawn is past the pull phase.
// Subscribers stay attached but won't receive further updates.
func (t *Tracker) Clear(sessionID string) {
	t.mu.Lock()
	delete(t.progress, sessionID)
	t.mu.Unlock()
}

// Has reports whether an entry exists for key. Used by the image-status
// refresher to tell a live pull apart from a record left in `pulling` after a
// server restart wiped the in-memory tracker.
func (t *Tracker) Has(key string) bool {
	t.mu.RLock()
	_, ok := t.progress[key]
	t.mu.RUnlock()
	return ok
}

// Done clears the entry and closes every live subscriber channel — used when
// the underlying work has finished and SSE clients should disconnect (e.g. an
// app-update pull with no follow-on container lifecycle to watch).
func (t *Tracker) Done(key string) {
	t.mu.Lock()
	delete(t.progress, key)
	subs := t.subs[key]
	delete(t.subs, key)
	t.mu.Unlock()
	for ch := range subs {
		close(ch)
	}
}
