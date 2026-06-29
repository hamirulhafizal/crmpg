/**
 * Extension version display, update checks, and sync gating.
 */
(function () {
  var VERSION_CACHE_KEY = 'extension_version_cache_v1';
  var CACHE_TTL_MS = 5 * 60 * 1000;

  function getConfig() {
    return typeof SUPABASE_CONFIG !== 'undefined' ? SUPABASE_CONFIG : {};
  }

  function getLocalVersion() {
    try {
      return chrome.runtime.getManifest().version || '0.0.0';
    } catch (e) {
      return '0.0.0';
    }
  }

  function parseSemver(version) {
    var match = /^(\d+)\.(\d+)\.(\d+)/.exec(String(version || '').trim());
    if (!match) return null;
    return [Number(match[1]), Number(match[2]), Number(match[3])];
  }

  function compareSemver(a, b) {
    var av = parseSemver(a);
    var bv = parseSemver(b);
    if (!av && !bv) return 0;
    if (!av) return -1;
    if (!bv) return 1;
    for (var i = 0; i < 3; i += 1) {
      if (av[i] > bv[i]) return 1;
      if (av[i] < bv[i]) return -1;
    }
    return 0;
  }

  function getWebappOrigin() {
    return (getConfig().WEBAPP_ORIGIN || '').replace(/\/$/, '');
  }

  function getStoreUrl(remoteInfo) {
    if (remoteInfo && remoteInfo.storeUrl) return remoteInfo.storeUrl;
    if (getConfig().CHROME_WEB_STORE_URL) return getConfig().CHROME_WEB_STORE_URL;
    return '';
  }

  function setText(id, text) {
    var el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function setVisible(id, visible) {
    var el = document.getElementById(id);
    if (el) el.style.display = visible ? 'block' : 'none';
  }

  function setUpdateMessage(message, type) {
    var el = document.getElementById('extensionUpdateMessage');
    if (!el) return;
    el.textContent = message || '';
    el.className = 'extension-update-message' + (type ? ' is-' + type : '');
    el.style.display = message ? 'block' : 'none';
  }

  function readCache() {
    return new Promise(function (resolve) {
      chrome.storage.local.get(VERSION_CACHE_KEY, function (data) {
        resolve(data[VERSION_CACHE_KEY] || null);
      });
    });
  }

  function writeCache(payload) {
    return new Promise(function (resolve) {
      chrome.storage.local.set({ [VERSION_CACHE_KEY]: payload }, resolve);
    });
  }

  function fetchRemoteVersionInfo(forceRefresh) {
    return readCache().then(function (cached) {
      if (
        !forceRefresh &&
        cached &&
        cached.fetchedAt &&
        Date.now() - cached.fetchedAt < CACHE_TTL_MS &&
        cached.data
      ) {
        return cached.data;
      }

      var origin = getWebappOrigin();
      if (!origin) {
        return Promise.reject(new Error('WEBAPP_ORIGIN is not configured.'));
      }

      return fetch(origin + '/api/extension/version?version=' + encodeURIComponent(getLocalVersion()), {
        method: 'GET',
        headers: { 'X-Extension-Version': getLocalVersion() },
        cache: 'no-store',
      })
        .then(function (res) { return res.json(); })
        .then(function (data) {
          var payload = {
            fetchedAt: Date.now(),
            data: data,
          };
          return writeCache(payload).then(function () { return data; });
        });
    });
  }

  function requestChromeStoreUpdate() {
    return new Promise(function (resolve) {
      if (!chrome.runtime.requestUpdateCheck) {
        resolve({ status: 'unsupported' });
        return;
      }
      chrome.runtime.requestUpdateCheck(function (status, details) {
        resolve({ status: status, details: details || null });
      });
    });
  }

  function reloadExtensionIfPending() {
    if (chrome.runtime.requestUpdateCheck) {
      chrome.runtime.requestUpdateCheck(function (status) {
        if (status === 'update_available' && chrome.runtime.reload) {
          chrome.runtime.reload();
        }
      });
      return;
    }
    if (chrome.runtime.reload) chrome.runtime.reload();
  }

  function applySyncAvailability(remoteInfo) {
    var blocked = !!(remoteInfo && remoteInfo.updateRequired);
    var syncButtons = document.querySelectorAll('.btn-sync');
    syncButtons.forEach(function (btn) {
      btn.disabled = blocked;
      btn.title = blocked ? 'Update the extension to continue syncing.' : '';
    });
    setVisible('extensionUpdateBanner', blocked);
    if (blocked) {
      var minVersion = remoteInfo.minVersion || remoteInfo.latestVersion || '';
      setText(
        'extensionUpdateBannerText',
        'Update required: please install v' + minVersion + ' or newer to sync.'
      );
    }
  }

  function renderVersionFooter() {
    setText('extensionVersionLabel', 'v' + getLocalVersion());
  }

  function applyVersionUI(remoteInfo) {
    renderVersionFooter();
    applySyncAvailability(remoteInfo);
    if (remoteInfo && remoteInfo.updateRequired) {
      setUpdateMessage(
        'Your extension is outdated. Update from the Chrome Web Store to continue syncing.',
        'error'
      );
    } else {
      setUpdateMessage('', '');
    }
  }

  function openStorePage(remoteInfo) {
    var storeUrl = getStoreUrl(remoteInfo);
    if (storeUrl) {
      chrome.tabs.create({ url: storeUrl });
      return;
    }
    chrome.tabs.create({ url: 'chrome://extensions/' });
  }

  function ensureCanSync() {
    return fetchRemoteVersionInfo(false).then(function (remoteInfo) {
      applyVersionUI(remoteInfo);
      if (remoteInfo && remoteInfo.updateRequired) {
        var err = new Error(
          'Extension update required. Please update to v' +
            (remoteInfo.minVersion || remoteInfo.latestVersion) +
            ' or newer.'
        );
        err.code = 'EXTENSION_OUTDATED';
        throw err;
      }
      return remoteInfo;
    });
  }

  function checkForUpdates(options) {
    var forceRefresh = !!(options && options.forceRefresh);
    var updateButton = document.getElementById('btn-check-extension-update');
    if (updateButton) {
      updateButton.disabled = true;
      updateButton.textContent = 'Checking...';
    }

    return fetchRemoteVersionInfo(forceRefresh)
      .then(function (remoteInfo) {
        applyVersionUI(remoteInfo);
        return requestChromeStoreUpdate().then(function (storeResult) {
          if (remoteInfo && remoteInfo.updateRequired) {
            setUpdateMessage(
              'Update required. Open the Chrome Web Store to install v' +
                (remoteInfo.latestVersion || remoteInfo.minVersion) +
                '.',
              'error'
            );
            return { remoteInfo: remoteInfo, storeResult: storeResult };
          }

          if (storeResult.status === 'update_available') {
            setUpdateMessage('Update downloaded. Reloading extension...', 'success');
            setTimeout(reloadExtensionIfPending, 800);
            return { remoteInfo: remoteInfo, storeResult: storeResult };
          }

          if (compareSemver(getLocalVersion(), remoteInfo.latestVersion || getLocalVersion()) < 0) {
            setUpdateMessage(
              'A newer version (v' + remoteInfo.latestVersion + ') is available on the Chrome Web Store.',
              'warning'
            );
            return { remoteInfo: remoteInfo, storeResult: storeResult };
          }

          setUpdateMessage('You are on the latest version.', 'success');
          return { remoteInfo: remoteInfo, storeResult: storeResult };
        });
      })
      .catch(function (err) {
        setUpdateMessage((err && err.message) || 'Could not check for updates.', 'error');
        throw err;
      })
      .finally(function () {
        if (updateButton) {
          updateButton.disabled = false;
          updateButton.textContent = 'Check for updates';
        }
      });
  }

  function initVersionUI() {
    renderVersionFooter();

    fetchRemoteVersionInfo(false)
      .then(applyVersionUI)
      .catch(function () {
        renderVersionFooter();
      });

    var updateButton = document.getElementById('btn-check-extension-update');
    if (updateButton) {
      updateButton.addEventListener('click', function () {
        checkForUpdates({ forceRefresh: true })
          .then(function (result) {
            if (result && result.remoteInfo && result.remoteInfo.updateRequired) {
              openStorePage(result.remoteInfo);
            }
          })
          .catch(function () {});
      });
    }

    var openStoreButton = document.getElementById('btn-open-extension-store');
    if (openStoreButton) {
      openStoreButton.addEventListener('click', function () {
        fetchRemoteVersionInfo(false)
          .then(openStorePage)
          .catch(function () { openStorePage(null); });
      });
    }
  }

  window.CRMPGExtensionUpdate = {
    getLocalVersion: getLocalVersion,
    compareSemver: compareSemver,
    fetchRemoteVersionInfo: fetchRemoteVersionInfo,
    renderVersionFooter: renderVersionFooter,
    applyVersionUI: applyVersionUI,
    ensureCanSync: ensureCanSync,
    checkForUpdates: checkForUpdates,
    initVersionUI: initVersionUI,
    openStorePage: openStorePage,
  };

  document.addEventListener('DOMContentLoaded', initVersionUI);
})();
