(function () {
  const companionInput = document.getElementById('companion-base-url');
  const statusEl = document.getElementById('status');

  async function loadSettings() {
    const settings = await HtmlMarkdownStorage.getSettings();
    companionInput.value = settings.companionBaseUrl || 'http://localhost:3000';
  }

  async function saveSettings() {
    const value = (companionInput.value || '').trim();
    const normalized = value || 'http://localhost:3000';
    await HtmlMarkdownStorage.saveSettings({ companionBaseUrl: normalized });
    setStatus('Saved companion app URL.', 'success');
  }

  async function testConnection() {
    const baseUrl = (companionInput.value || '').trim() || 'http://localhost:3000';
    setStatus('Testing companion app connection…', 'info');

    try {
      const response = await fetch(`${baseUrl}/companion-app-connection-test`, { method: 'GET' });
      if (!response.ok) {
        throw new Error(`Health check returned ${response.status}`);
      }
      setStatus('Companion app responded successfully.', 'success');
    } catch (error) {
      setStatus(`Companion app is unavailable: ${error.message}`, 'error');
    }
  }

  function setStatus(message, type) {
    statusEl.textContent = message;
    statusEl.className = `status ${type || ''}`.trim();
  }

  document.getElementById('save-btn').addEventListener('click', saveSettings);
  document.getElementById('test-btn').addEventListener('click', testConnection);

  loadSettings().catch((error) => {
    setStatus(`Unable to load settings: ${error.message}`, 'error');
  });
})();
