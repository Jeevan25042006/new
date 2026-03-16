/**
 * BlinkPass SDK v1.0
 * Embeddable "Continue with BlinkPass" button and OAuth2 PKCE flow.
 *
 * Usage:
 *   <script src="/sdk.js"></script>
 *   <script>
 *     BlinkPass.init({ clientId: 'YOUR_CLIENT_ID', redirectUri: 'https://yourapp.com/callback' });
 *     BlinkPass.renderButton('container-id', { text: 'Continue with BlinkPass' });
 *   </script>
 */
(function (window) {
  'use strict';

  var BASE_URL = 'http://localhost:8005';

  function generateCodeVerifier() {
    var array = new Uint8Array(32);
    window.crypto.getRandomValues(array);
    return btoa(String.fromCharCode.apply(null, Array.from(array)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  }

  function generateCodeChallenge(verifier) {
    return window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
      .then(function (hash) {
        return btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(hash))))
          .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
      });
  }

  function generateState() {
    var array = new Uint8Array(16);
    window.crypto.getRandomValues(array);
    return Array.from(array, function (b) { return b.toString(16).padStart(2, '0'); }).join('');
  }

  var BlinkPass = {
    _config: null,

    /**
     * Initialize the SDK.
     * @param {Object} config
     * @param {string} config.clientId - Your OAuth2 client ID
     * @param {string} config.redirectUri - Your callback URL
     * @param {string} [config.scope] - OAuth2 scopes (default: 'openid profile email')
     * @param {string} [config.baseUrl] - BlinkPass server URL
     */
    init: function (config) {
      if (!config.clientId) throw new Error('BlinkPass SDK: clientId is required');
      if (!config.redirectUri) throw new Error('BlinkPass SDK: redirectUri is required');
      this._config = {
        clientId: config.clientId,
        redirectUri: config.redirectUri,
        scope: config.scope || 'openid profile email',
        baseUrl: config.baseUrl || BASE_URL,
      };
    },

    /**
     * Render a "Continue with BlinkPass" button in the given container.
     * @param {string} containerId - DOM element ID
     * @param {Object} [options]
     * @param {string} [options.text] - Button label
     * @param {string} [options.theme] - 'dark' (default) or 'light'
     */
    renderButton: function (containerId, options) {
      var container = document.getElementById(containerId);
      if (!container) {
        console.error('BlinkPass SDK: container #' + containerId + ' not found');
        return;
      }
      options = options || {};
      var text = options.text || 'Continue with BlinkPass';
      var theme = options.theme || 'dark';

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = '⚡ ' + text;
      btn.style.cssText = [
        'display: inline-flex',
        'align-items: center',
        'gap: 8px',
        'padding: 12px 24px',
        'font-size: 15px',
        'font-weight: 600',
        'border: none',
        'border-radius: 12px',
        'cursor: pointer',
        'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        'transition: all 0.2s ease',
        theme === 'light'
          ? 'background: #f3f3f3; color: #1a1a1a;'
          : 'background: linear-gradient(135deg, #0078d4, #8764b8); color: white;',
        'box-shadow: 0 4px 16px rgba(0, 120, 212, 0.35)',
      ].join(';');

      btn.addEventListener('mouseenter', function () {
        btn.style.transform = 'translateY(-1px)';
        btn.style.boxShadow = '0 6px 24px rgba(0, 120, 212, 0.5)';
      });
      btn.addEventListener('mouseleave', function () {
        btn.style.transform = 'translateY(0)';
        btn.style.boxShadow = '0 4px 16px rgba(0, 120, 212, 0.35)';
      });
      btn.addEventListener('click', function () {
        BlinkPass.startAuth();
      });

      container.appendChild(btn);
    },

    /**
     * Start the OAuth2 PKCE authentication flow.
     * Stores state + code_verifier in sessionStorage, then redirects to the auth server.
     */
    startAuth: function () {
      if (!this._config) {
        console.error('BlinkPass SDK: call BlinkPass.init() first');
        return;
      }
      var cfg = this._config;
      var state = generateState();
      var verifier = generateCodeVerifier();

      sessionStorage.setItem('blinkpass_state', state);
      sessionStorage.setItem('blinkpass_verifier', verifier);

      generateCodeChallenge(verifier).then(function (challenge) {
        var params = new URLSearchParams({
          response_type: 'code',
          client_id: cfg.clientId,
          redirect_uri: cfg.redirectUri,
          scope: cfg.scope,
          state: state,
          code_challenge: challenge,
          code_challenge_method: 'S256',
        });
        window.location.href = cfg.baseUrl + '/oauth2/authorize?' + params.toString();
      });
    },

    /**
     * Handle the OAuth2 callback. Call this on your redirect URI page.
     * Returns a promise that resolves with { access_token, refresh_token, id_token }.
     *
     * @param {Object} [options]
     * @param {string} [options.clientSecret] - Client secret (server-side only, not for SPAs)
     * @returns {Promise<Object>}
     */
    handleCallback: function (options) {
      if (!this._config) return Promise.reject(new Error('BlinkPass SDK: call BlinkPass.init() first'));
      options = options || {};

      var params = new URLSearchParams(window.location.search);
      var code = params.get('code');
      var state = params.get('state');
      var error = params.get('error');

      if (error) return Promise.reject(new Error('OAuth2 error: ' + error));
      if (!code) return Promise.reject(new Error('No authorization code in URL'));

      var storedState = sessionStorage.getItem('blinkpass_state');
      var verifier = sessionStorage.getItem('blinkpass_verifier');

      if (state !== storedState) return Promise.reject(new Error('State mismatch — possible CSRF'));

      sessionStorage.removeItem('blinkpass_state');
      sessionStorage.removeItem('blinkpass_verifier');

      var cfg = this._config;
      var body = new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        client_id: cfg.clientId,
        redirect_uri: cfg.redirectUri,
        code_verifier: verifier || '',
      });
      if (options.clientSecret) body.set('client_secret', options.clientSecret);

      return fetch(cfg.baseUrl + '/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      }).then(function (res) {
        if (!res.ok) return res.json().then(function (e) { throw new Error(e.error_description || e.detail || 'Token exchange failed'); });
        return res.json();
      });
    },

    /**
     * Fetch the authenticated user's profile using an access token.
     * @param {string} accessToken
     * @returns {Promise<Object>}
     */
    getUserInfo: function (accessToken) {
      if (!this._config) return Promise.reject(new Error('BlinkPass SDK: call BlinkPass.init() first'));
      return fetch(this._config.baseUrl + '/oauth2/userinfo', {
        headers: { Authorization: 'Bearer ' + accessToken },
      }).then(function (res) {
        if (!res.ok) throw new Error('Failed to fetch user info');
        return res.json();
      });
    },
  };

  window.BlinkPass = BlinkPass;
})(window);
