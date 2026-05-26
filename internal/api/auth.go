package api

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"sync"
	"time"
)

const sessionCookieName = "terraview_session"

// sessionStore holds short-lived login tokens for cookie + SSE auth.
type sessionStore struct {
	mu     sync.RWMutex
	tokens map[string]time.Time
}

func newSessionStore() *sessionStore {
	return &sessionStore{tokens: map[string]time.Time{}}
}

func (s *sessionStore) create() string {
	b := make([]byte, 32)
	_, _ = rand.Read(b)
	token := hex.EncodeToString(b)
	s.mu.Lock()
	defer s.mu.Unlock()
	s.tokens[token] = time.Now().Add(24 * time.Hour)
	return token
}

func (s *sessionStore) valid(token string) bool {
	if token == "" {
		return false
	}
	s.mu.RLock()
	exp, ok := s.tokens[token]
	s.mu.RUnlock()
	if !ok || time.Now().After(exp) {
		return false
	}
	return true
}

func (s *sessionStore) purge() {
	now := time.Now()
	s.mu.Lock()
	defer s.mu.Unlock()
	for tok, exp := range s.tokens {
		if now.After(exp) {
			delete(s.tokens, tok)
		}
	}
}

func (srv *Server) checkCredentials(user, pass string) bool {
	userMatches := subtle.ConstantTimeCompare([]byte(user), []byte(srv.auth.Username)) == 1
	passMatches := subtle.ConstantTimeCompare([]byte(pass), []byte(srv.auth.Password)) == 1
	return userMatches && passMatches
}

func (srv *Server) tokenAllowed(token string) bool {
	if token == "" {
		return false
	}
	if srv.sessions.valid(token) {
		return true
	}
	if srv.auth.AccessToken != "" {
		return subtle.ConstantTimeCompare([]byte(token), []byte(srv.auth.AccessToken)) == 1
	}
	return false
}

func (srv *Server) authenticated(r *http.Request) bool {
	if !srv.auth.Enabled {
		return true
	}

	if tok := r.URL.Query().Get("access_token"); srv.tokenAllowed(tok) {
		return true
	}

	if c, err := r.Cookie(sessionCookieName); err == nil && srv.sessions.valid(c.Value) {
		return true
	}

	if auth := r.Header.Get("Authorization"); auth != "" {
		const bearer = "Bearer "
		if len(auth) > len(bearer) && auth[:len(bearer)] == bearer {
			if srv.tokenAllowed(auth[len(bearer):]) {
				return true
			}
		}
	}

	user, pass, ok := r.BasicAuth()
	if ok && srv.checkCredentials(user, pass) {
		return true
	}
	return false
}

func (srv *Server) authMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !srv.auth.Enabled {
			next.ServeHTTP(w, r)
			return
		}

		// Login is always reachable so the UI can exchange credentials for a
		// session token usable in EventSource query params.
		if r.URL.Path == "/api/login" {
			next.ServeHTTP(w, r)
			return
		}

		if srv.authenticated(r) {
			next.ServeHTTP(w, r)
			return
		}

		w.Header().Set("WWW-Authenticate", `Basic realm="terraview"`)
		http.Error(w, "unauthorized", http.StatusUnauthorized)
	})
}

func (srv *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", "POST")
		writeError(w, http.StatusMethodNotAllowed, "use POST")
		return
	}
	if !srv.auth.Enabled {
		writeJSON(w, http.StatusOK, map[string]any{"auth_required": false})
		return
	}

	var body struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if !srv.checkCredentials(body.Username, body.Password) {
		writeError(w, http.StatusUnauthorized, "invalid credentials")
		return
	}

	srv.sessions.purge()
	token := srv.sessions.create()
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookieName,
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   86400,
	})
	writeJSON(w, http.StatusOK, map[string]any{
		"access_token":  token,
		"auth_required": true,
	})
}
