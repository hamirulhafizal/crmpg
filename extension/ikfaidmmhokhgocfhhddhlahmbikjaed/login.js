/**
 * Supabase auth for extension – same auth as webapp (app/login, app/auth).
 * Uses Supabase Auth REST API and chrome.storage for session persistence.
 */
(function () {
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = SUPABASE_CONFIG;
  const STORAGE_KEYS = { session: 'supabase_session', rememberEmail: 'remember_email' };

  function getStoredSession() {
    return new Promise(function (resolve) {
      chrome.storage.local.get(STORAGE_KEYS.session, function (data) {
        resolve(data[STORAGE_KEYS.session] || null);
      });
    });
  }

  function setStoredSession(session) {
    return new Promise(function (resolve) {
      chrome.storage.local.set({ [STORAGE_KEYS.session]: session }, resolve);
    });
  }

  function clearStoredSession() {
    return new Promise(function (resolve) {
      chrome.storage.local.remove(STORAGE_KEYS.session, resolve);
    });
  }

  function isExpired(expiresAt) {
    if (!expiresAt) return true;
    const margin = 60;
    return (expiresAt - margin) * 1000 < Date.now();
  }

  function refreshSession(refreshToken) {
    return fetch(SUPABASE_URL + '/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
    }).then(function (res) { return res.json(); });
  }

  function getCurrentUser() {
    return getStoredSession().then(function (session) {
      if (!session || !session.access_token) return null;
      if (isExpired(session.expires_at) && session.refresh_token) {
        return refreshSession(session.refresh_token).then(function (data) {
          if (data.error) return null;
          var expiresAt = data.expires_at;
          if (!expiresAt && data.expires_in) {
            expiresAt = Math.floor(Date.now() / 1000) + data.expires_in;
          }
          var newSession = {
            access_token: data.access_token,
            refresh_token: data.refresh_token || session.refresh_token,
            expires_at: expiresAt,
            user: data.user,
          };
          return setStoredSession(newSession).then(function () { return data.user; });
        });
      }
      return session.user || null;
    });
  }

  function signInWithPassword(email, password) {
    return fetch(SUPABASE_URL + '/auth/v1/token?grant_type=password', {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: email, password: password }),
    })
      .then(function (res) {
        return res.json()
          .then(function (data) {
            if (!res.ok || data.error) {
              var msg = (data && (data.msg || data.error_description || data.message)) || 'Login failed';
              throw new Error(msg);
            }
            if (!data.user) throw new Error('Invalid response from server.');
            var expiresAt = data.expires_at;
            if (!expiresAt && data.expires_in) {
              expiresAt = Math.floor(Date.now() / 1000) + data.expires_in;
            }
            var session = {
              access_token: data.access_token,
              refresh_token: data.refresh_token,
              expires_at: expiresAt,
              user: data.user,
            };
            return setStoredSession(session).then(function () { return data.user; });
          })
          .catch(function (parseErr) {
            if (parseErr && parseErr.message && parseErr.message.indexOf('Login failed') !== -1) throw parseErr;
            if (!res.ok) throw new Error('Login failed. Please try again.');
            throw parseErr;
          });
      });
  }

  function generateCodeVerifier() {
    var array = new Uint8Array(32);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      crypto.getRandomValues(array);
    } else {
      for (var i = 0; i < 32; i++) array[i] = Math.floor(Math.random() * 256);
    }
    return base64UrlEncode(array);
  }

  function base64UrlEncode(buffer) {
    var binary = '';
    var bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    for (var i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function sha256Base64Url(plain) {
    return new Promise(function (resolve, reject) {
      if (typeof crypto !== 'undefined' && crypto.subtle && crypto.subtle.digest) {
        crypto.subtle.digest('SHA-256', new TextEncoder().encode(plain))
          .then(function (hash) { resolve(base64UrlEncode(hash)); })
          .catch(reject);
      } else {
        reject(new Error('SHA-256 not available'));
      }
    });
  }

  function exchangeCodeForSession(code, redirectUri, codeVerifier) {
    var body = { code: code, redirect_uri: redirectUri };
    if (codeVerifier) body.code_verifier = codeVerifier;
    return fetch(SUPABASE_URL + '/auth/v1/token?grant_type=authorization_code', {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data.error) throw new Error(data.msg || data.error_description || data.message || 'Failed to complete sign in');
        var expiresAt = data.expires_at;
        if (!expiresAt && data.expires_in) {
          expiresAt = Math.floor(Date.now() / 1000) + data.expires_in;
        }
        var session = {
          access_token: data.access_token,
          refresh_token: data.refresh_token,
          expires_at: expiresAt,
          user: data.user,
        };
        return setStoredSession(session).then(function () { return data.user; });
      });
  }

  function signInWithGoogle() {
    if (!chrome.identity || !chrome.identity.launchWebAuthFlow) {
      return Promise.reject(new Error('Google sign-in is not available in this browser.'));
    }
    var redirectUri = chrome.identity.getRedirectURL();
    var codeVerifier = generateCodeVerifier();
    return sha256Base64Url(codeVerifier).then(function (codeChallenge) {
      var authUrl = SUPABASE_URL + '/auth/v1/authorize?provider=google'
        + '&redirect_to=' + encodeURIComponent(redirectUri)
        + '&code_challenge=' + encodeURIComponent(codeChallenge)
        + '&code_challenge_method=S256';
      return new Promise(function (resolve, reject) {
        chrome.identity.launchWebAuthFlow(
          { url: authUrl, interactive: true },
          function (callbackUrl) {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message || 'Sign-in was cancelled or failed.'));
              return;
            }
            if (!callbackUrl) {
              reject(new Error('No callback URL received.'));
              return;
            }
            var url;
            try {
              url = new URL(callbackUrl);
            } catch (e) {
              reject(new Error('Invalid callback URL.'));
              return;
            }
            var code = url.searchParams.get('code');
            var error = url.searchParams.get('error');
            if (error) {
              reject(new Error(url.searchParams.get('error_description') || error));
              return;
            }
            if (!code) {
              reject(new Error('No authorization code received.'));
              return;
            }
            exchangeCodeForSession(code, redirectUri, codeVerifier).then(resolve, reject);
          }
        );
      });
    });
  }

  function signOut() {
    return getStoredSession().then(function (session) {
      if (session && session.access_token) {
        fetch(SUPABASE_URL + '/auth/v1/logout', {
          method: 'POST',
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: 'Bearer ' + session.access_token,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ scope: 'local' }),
        }).catch(function () {});
      }
      return clearStoredSession();
    });
  }

  function showLoginForm() {
    document.getElementById('loginForm').style.display = 'block';
    document.querySelector('.success').style.display = 'none';
  }

  function showSuccessPanel(user) {
    document.getElementById('loginForm').style.display = 'none';
    var el = document.querySelector('.success');
    el.style.display = 'block';
    var pgcode = document.getElementById('pgcode');
    if (pgcode) pgcode.textContent = 'Welcome, ' + (user.email || user.user_metadata?.email || 'User');
  }

  function setError(elId, message) {
    var el = document.getElementById(elId);
    if (el) {
      el.textContent = message || '';
      el.style.display = message ? 'block' : 'none';
    }
  }

  function hideErrors() {
    setError('emailError', '');
    setError('passwordError', '');
    setError('loginError', '');
  }

  function initRememberEmail() {
    chrome.storage.local.get(STORAGE_KEYS.rememberEmail, function (data) {
      var saved = data[STORAGE_KEYS.rememberEmail];
      var emailInput = document.getElementById('login-email');
      var rememberCheck = document.getElementById('remember_me');
      if (saved && saved.email) {
        if (emailInput) emailInput.value = saved.email;
        if (rememberCheck) rememberCheck.checked = true;
      }
    });
  }

  function saveRememberEmail() {
    var rememberCheck = document.getElementById('remember_me');
    if (rememberCheck && rememberCheck.checked) {
      var emailInput = document.getElementById('login-email');
      chrome.storage.local.set({
        [STORAGE_KEYS.rememberEmail]: { email: emailInput ? emailInput.value : '' },
      });
    } else {
      chrome.storage.local.remove(STORAGE_KEYS.rememberEmail);
    }
  }

  function initPasswordToggle() {
    var toggle = document.getElementById('togglePassword');
    var input = document.getElementById('login-password');
    if (!toggle || !input) return;
    toggle.addEventListener('click', function () {
      var isPassword = input.type === 'password';
      input.type = isPassword ? 'text' : 'password';
      toggle.title = isPassword ? 'Hide password' : 'Show password';
      toggle.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');
      toggle.classList.toggle('is-visible', !isPassword);
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    var loginForm = document.getElementById('loginForm');
    var loginButton = document.getElementById('loginButton');
    var logoutButton = document.getElementById('logout');
    var accountLogin = document.getElementById('accountLogin');

    if (!accountLogin) return;

    initRememberEmail();
    initPasswordToggle();

    getCurrentUser().then(function (user) {
      if (user) {
        showSuccessPanel(user);
      } else {
        showLoginForm();
      }
    });

    if (loginButton) {
      loginButton.addEventListener('click', function (e) {
        e.preventDefault();
        hideErrors();
        var email = (accountLogin.querySelector('#login-email') || {}).value;
        var password = (accountLogin.querySelector('#login-password') || {}).value;
        email = email ? email.trim() : '';
        password = password ? password.trim() : '';

        if (!email) {
          setError('emailError', 'Email cannot be blank');
          return;
        }
        if (!password) {
          setError('passwordError', 'Password cannot be blank');
          return;
        }

        var regexEmail = /\w+([-+.']\w+)*@\w+([-.]\w+)*\.\w+([-.]\w+)*/;
        if (!regexEmail.test(email)) {
          setError('emailError', 'Please enter a valid email address.');
          return;
        }

        loginButton.disabled = true;
        loginButton.textContent = 'Signing in...';

        signInWithPassword(email, password)
          .then(function (user) {
            if (!user) {
              setError('loginError', 'Invalid response. Please try again.');
              return;
            }
            saveRememberEmail();
            showSuccessPanel(user);
          })
          .catch(function (err) {
            var msg = (err && err.message) || 'These credentials do not match our records.';
            if (msg.indexOf('Invalid login credentials') !== -1) msg = 'Invalid email or password.';
            else if (msg.indexOf('Email not confirmed') !== -1) msg = 'Please confirm your email before signing in.';
            else if (msg.indexOf('fetch') !== -1 || msg.indexOf('network') !== -1) msg = 'Network error. Check your connection.';
            setError('loginError', msg);
          })
          .finally(function () {
            loginButton.disabled = false;
            loginButton.textContent = 'Sign In';
          });
      });
    }

    if (logoutButton) {
      logoutButton.addEventListener('click', function () {
        signOut().then(function () {
          showLoginForm();
          hideErrors();
        });
      });
    }

    var googleSignInButton = document.getElementById('googleSignInButton');
    if (googleSignInButton) {
      googleSignInButton.addEventListener('click', function () {
        hideErrors();
        googleSignInButton.disabled = true;
        googleSignInButton.classList.add('loading');
        var originalHtml = googleSignInButton.innerHTML;
        googleSignInButton.innerHTML = 'Opening…';

        signInWithGoogle()
          .then(function (user) {
            if (!user) {
              setError('loginError', 'Sign-in failed. Please try again.');
              return;
            }
            showSuccessPanel(user);
          })
          .catch(function (err) {
            var msg = err.message || 'Google sign-in failed.';
            if (msg.indexOf('cancel') !== -1 || msg.indexOf('closed') !== -1) msg = 'Sign-in was cancelled.';
            setError('loginError', msg);
          })
          .finally(function () {
            googleSignInButton.disabled = false;
            googleSignInButton.classList.remove('loading');
            googleSignInButton.innerHTML = originalHtml;
          });
      });
    }
  });
})();
