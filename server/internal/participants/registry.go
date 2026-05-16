package participants

import (
	"context"
	"sync"
)

// Registry tracks per-participant cancel functions for active proxy
// connections so the host can forcibly kick a participant (after revoke or
// role change) instead of waiting for them to reconnect on their own.
//
// A participant can hold several concurrent connections (multi-tab, etc.); the
// registry stores one cancel per connection and fires all of them on Disconnect.
type Registry struct {
	mu          sync.Mutex
	connections map[string]map[uint64]context.CancelFunc
	nextID      uint64
}

func NewRegistry() *Registry {
	return &Registry{connections: map[string]map[uint64]context.CancelFunc{}}
}

// Track records a cancel function under the given participant id and returns a
// release callback the proxy must call when the connection ends.
func (r *Registry) Track(participantID string, cancel context.CancelFunc) func() {
	if participantID == "" {
		return func() {}
	}

	r.mu.Lock()
	conns, ok := r.connections[participantID]
	if !ok {
		conns = map[uint64]context.CancelFunc{}
		r.connections[participantID] = conns
	}
	id := r.nextID
	r.nextID++
	conns[id] = cancel
	r.mu.Unlock()

	return func() {
		r.mu.Lock()
		defer r.mu.Unlock()
		if conns, ok := r.connections[participantID]; ok {
			delete(conns, id)
			if len(conns) == 0 {
				delete(r.connections, participantID)
			}
		}
	}
}

// Disconnect cancels every active connection registered for the participant.
// Safe to call when the participant has no active connections.
func (r *Registry) Disconnect(participantID string) {
	if participantID == "" {
		return
	}

	r.mu.Lock()
	conns := r.connections[participantID]
	delete(r.connections, participantID)
	r.mu.Unlock()

	for _, cancel := range conns {
		cancel()
	}
}
