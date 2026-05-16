package logging

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"strconv"
	"strings"
	"sync"
)

type Handler struct {
	w      io.Writer
	level  slog.Level
	mu     *sync.Mutex
	attrs  []slog.Attr
	groups []string
}

func New(w io.Writer, level slog.Level) *Handler {
	return &Handler{
		w:     w,
		level: level,
		mu:    &sync.Mutex{},
	}
}

func (h *Handler) Enabled(_ context.Context, l slog.Level) bool {
	return l >= h.level
}

func (h *Handler) Handle(_ context.Context, r slog.Record) error {
	var b strings.Builder
	b.WriteString(r.Time.Format("2006-01-02 15:04:05"))
	b.WriteByte(' ')
	b.WriteString(r.Level.String())
	b.WriteString(": ")
	b.WriteString(r.Message)

	for _, a := range h.attrs {
		appendAttr(&b, h.groups, a)
	}
	r.Attrs(func(a slog.Attr) bool {
		appendAttr(&b, h.groups, a)
		return true
	})

	b.WriteByte('\n')

	h.mu.Lock()
	defer h.mu.Unlock()
	_, err := io.WriteString(h.w, b.String())
	return err
}

func (h *Handler) WithAttrs(attrs []slog.Attr) slog.Handler {
	return &Handler{
		w:      h.w,
		level:  h.level,
		mu:     h.mu,
		attrs:  append(append([]slog.Attr{}, h.attrs...), attrs...),
		groups: append([]string{}, h.groups...),
	}
}

func (h *Handler) WithGroup(name string) slog.Handler {
	if name == "" {
		return h
	}

	return &Handler{
		w:      h.w,
		level:  h.level,
		mu:     h.mu,
		attrs:  append([]slog.Attr{}, h.attrs...),
		groups: append(append([]string{}, h.groups...), name),
	}
}

func appendAttr(b *strings.Builder, groups []string, a slog.Attr) {
	if a.Equal(slog.Attr{}) {
		return
	}

	if a.Value.Kind() == slog.KindGroup {
		nested := append(groups, a.Key)
		for _, inner := range a.Value.Group() {
			appendAttr(b, nested, inner)
		}
		return
	}

	b.WriteByte(' ')
	for _, g := range groups {
		b.WriteString(g)
		b.WriteByte('.')
	}
	b.WriteString(a.Key)
	b.WriteByte('=')

	s := fmt.Sprintf("%v", a.Value.Resolve().Any())
	if strings.ContainsAny(s, " \t\"=") {
		b.WriteString(strconv.Quote(s))
	} else {
		b.WriteString(s)
	}
}
