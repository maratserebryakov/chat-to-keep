// Selectors for different sites
const SITE_SELECTORS = {
  'routerai': {
    messageSelector: '.routerai-chat-message',
    userClass: 'routerai-chat-message--user',
    assistantClass: 'routerai-chat-message--assistant',
    textSelector: '.routerai-chat-markdown, .routerai-chat-message__text, .routerai-chat-message__content'
  },
  'deepseek': {
    // These are guesses – adjust if needed after inspecting the page
    messageSelector: '.chat-message, .message, [class*="message-item"]',
    userClass: 'user',                // class that marks user messages
    assistantClass: 'assistant',      // class that marks assistant messages
    textSelector: '.markdown, .message-content, .text, .whitespace-pre-wrap'
  }
};

// Detect which site we are on
function getSiteConfig(url) {
  if (url.includes('routerai')) return SITE_SELECTORS.routerai;
  if (url.includes('deepseek')) return SITE_SELECTORS.deepseek;
  return null; // unsupported site
}

document.addEventListener('DOMContentLoaded', () => {
  const tokenInput = document.getElementById('token');
  const saveBtn = document.getElementById('saveBtn');
  const keepBtn = document.getElementById('keepBtn');
  const linkBox = document.getElementById('linkBox');
  const statusEl = document.getElementById('status');

  chrome.storage.local.get('ghToken', data => {
    if (data.ghToken) tokenInput.value = data.ghToken;
  });

  saveBtn.addEventListener('click', async () => {
    const token = tokenInput.value.trim();
    if (!token) {
      showStatus('Введите GitHub Token', false);
      return;
    }

    chrome.storage.local.set({ ghToken: token });
    saveBtn.disabled = true;
    saveBtn.textContent = '⏳ Прокрутка и сбор...';
    keepBtn.style.display = 'none';
    linkBox.style.display = 'none';
    statusEl.textContent = '';

    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const tab = tabs[0];

      // Inject a script that will extract messages using the right selectors
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: async (siteConfig) => {
          // Helper: wait a bit
          const delay = ms => new Promise(r => setTimeout(r, ms));

          const collected = [];
          const seenKeys = new Set();

          function grab() {
            const messages = document.querySelectorAll(siteConfig.messageSelector);
            for (const msg of messages) {
              // Determine role by class presence
              let role = null;
              if (msg.classList.contains(siteConfig.userClass)) role = 'user';
              else if (msg.classList.contains(siteConfig.assistantClass)) role = 'assistant';

              // Fallback: check data-role or any class containing 'user'/'assistant'
              if (!role) {
                if (msg.getAttribute('data-role') === 'user') role = 'user';
                else if (msg.getAttribute('data-role') === 'assistant') role = 'assistant';
                else {
                  const classNames = msg.className;
                  if (classNames.includes('user')) role = 'user';
                  else if (classNames.includes('assistant')) role = 'assistant';
                }
              }
              if (!role) continue;

              // Find text container
              let textEl = msg.querySelector(siteConfig.textSelector);
              if (!textEl) {
                // fallback: any div/p inside that might contain the text
                textEl = msg.querySelector('div:not(:empty), p:not(:empty)');
              }
              if (!textEl) continue;

              const text = textEl.innerText.trim();
              if (text.length < 2) continue;

              const key = `${role}:${text.substring(0, 80)}`;
              if (seenKeys.has(key)) continue;
              seenKeys.add(key);

              collected.push({ role, text });
            }
          }

          // Find scroll container
          let container = null;
          const firstMsg = document.querySelector(siteConfig.messageSelector);
          if (firstMsg) {
            let el = firstMsg.parentElement;
            while (el && el !== document.body) {
              const s = window.getComputedStyle(el);
              if ((s.overflowY === 'auto' || s.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 50) {
                container = el;
                break;
              }
              el = el.parentElement;
            }
          }
          if (!container) container = document.documentElement;

          // Scroll up
          container.scrollTop = 0;
          await delay(1000);
          grab();

          // Scroll down step by step
          const step = container.clientHeight * 0.4;
          for (let i = 0; i < 500; i++) {
            container.scrollTop += step;
            await delay(300);
            grab();
            if (container.scrollTop + container.clientHeight >= container.scrollHeight - 10) {
              await delay(500);
              grab();
              break;
            }
          }

          // Build Markdown
          let md = '';
          collected.forEach((m, idx) => {
            if (m.role === 'user') {
              md += '## 🧑 Вопрос\n\n' + m.text + '\n\n';
            } else {
              md += '## 🤖 Ответ\n\n' + m.text + '\n\n';
            }
            if (idx < collected.length - 1) md += '---\n\n';
          });

          console.log(`Extracted ${collected.length} messages for ${window.location.hostname}`);
          return { markdown: md, count: collected.length };
        },
        args: [getSiteConfig(tab.url)]
      });

      const data = results[0].result;
      if (!data || !data.markdown || data.markdown.trim().length < 20) {
        throw new Error('Не удалось извлечь сообщения (проверьте селекторы на этой странице)');
      }

      const now = new Date();
      const filename = `chat_${now.toISOString().slice(0, 10)}.md`;
      const gistBody = {
        description: `DeepSeek Chat — ${now.toISOString().slice(0, 10)} (${data.count} messages)`,
        public: false,
        files: { [filename]: { content: data.markdown } }
      };

      const resp = await fetch('https://api.github.com/gists', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(gistBody)
      });

      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.message || resp.statusText);
      }

      const gist = await resp.json();
      const gistUrl = gist.html_url;
      await navigator.clipboard.writeText(gistUrl);

      linkBox.textContent = gistUrl;
      linkBox.style.display = 'block';
      keepBtn.style.display = 'block';
      showStatus(`✅ ${data.count} сообщений сохранено! Ссылка скопирована.`, true);

    } catch (err) {
      showStatus(`❌ ${err.message}`, false);
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = '📋 Сохранить чат в Gist';
    }
  });

  keepBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://keep.google.com' });
  });

  function showStatus(msg, ok) {
    statusEl.textContent = msg;
    statusEl.style.display = 'block';
    statusEl.style.background = ok ? '#e6f4ea' : '#fce8e6';
    statusEl.style.color = ok ? '#1e7e34' : '#c62828';
  }
});
