package logging

import (
	"log"
	"log/slog"
	"strings"
)

// RedirectStdlib routes the default stdlib log package through the given slog
// logger as INFO messages, so PocketBase's serve-time log lines pick up the
// same format as everything else.
func RedirectStdlib(logger *slog.Logger) {
	log.SetFlags(0)
	log.SetPrefix("")
	log.SetOutput(&slogWriter{logger: logger})
}

type slogWriter struct {
	logger *slog.Logger
}

func (w *slogWriter) Write(p []byte) (int, error) {
	msg := strings.TrimRight(string(p), "\n")
	if msg != "" {
		w.logger.Info(msg)
	}

	return len(p), nil
}
