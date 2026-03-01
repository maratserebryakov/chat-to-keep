var tokenInput = document.getElementById('token');
var saveBtn = document.getElementById('saveBtn');
var keepBtn = document.getElementById('keepBtn');
var linkBox = document.getElementById('linkBox');
var statusEl = document.getElementById('status');

chrome.storage.local.get('ghToken', function(data) {
  if (data.ghToken) tokenInput.value = data.ghToken;
});

saveBtn.addEventListener('click', async function() {
  var token = tokenInput.value.trim();
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
    var tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    var tab = tabs[0];

    var results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: async function() {
        var collected = [];
        var seenKeys = new Set();

        function grab() {
          var msgs = document.querySelectorAll('.routerai-chat-message');
          msgs.forEach(function(msg) {
            var isUser = msg.classList.contains('routerai-chat-message--user');
            var isAssistant = msg.classList.contains('routerai-chat-message--assistant');
            if (!isUser && !isAssistant) return;

            var role = isUser ? 'user' : 'assistant';
            var textEl = msg.querySelector('.routerai-chat-markdown')
              || msg.querySelector('.routerai-chat-message__text')
              || msg.querySelector('.routerai-chat-message__content');
            if (!textEl) return;

            var text = textEl.innerText.trim();
            if (text.length < 2) return;

            var key = role + ':' + text.substring(0, 80);
            if (seenKeys.has(key)) return;
            seenKeys.add(key);

            collected.push({ role: role, text: text });
          });
        }

        // Найти скролл-контейнер
        var container = null;
        var msg = document.querySelector('.routerai-chat-message');
        if (msg) {
          var el = msg.parentElement;
          while (el && el !== document.body) {
            var s = window.getComputedStyle(el);
            if ((s.overflowY === 'auto' || s.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 50) {
              container = el;
              break;
            }
            el = el.parentElement;
          }
        }
        if (!container) container = document.documentElement;

        // Вверх
        container.scrollTop = 0;
        await new Promise(function(r) { setTimeout(r, 1000); });
        grab();

        // Вниз по шагам
        var step = container.clientHeight * 0.4;
        for (var i = 0; i < 500; i++) {
          container.scrollTop += step;
          await new Promise(function(r) { setTimeout(r, 300); });
          grab();
          if (container.scrollTop + container.clientHeight >= container.scrollHeight - 10) {
            await new Promise(function(r) { setTimeout(r, 500); });
            grab();
            break;
          }
        }

        // Формируем Markdown
        var md = '';
        collected.forEach(function(m, i) {
          if (m.role === 'user') {
            md += '## 🧑 Вопрос\n\n' + m.text + '\n\n';
          } else {
            md += '## 🤖 Ответ\n\n' + m.text + '\n\n';
          }
          if (i < collected.length - 1) {
            md += '---\n\n';
          }
        });

        return { markdown: md, count: collected.length };
      }
    });

    var data = results[0].result;

    if (!data || !data.markdown || data.markdown.trim().length < 20) {
      throw new Error('Не удалось извлечь сообщения');
    }

    var now = new Date();
    var d = now.toISOString().slice(0, 10);
    var filename = 'chat_' + d + '.md';

    var body = {
      description: 'RouterAI Chat — ' + d + ' (' + data.count + ' messages)',
      public: false,
      files: {}
    };
    body.files[filename] = { content: data.markdown };

    var resp = await fetch('https://api.github.com/gists', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!resp.ok) {
      var errData = await resp.json();
      throw new Error(errData.message || resp.statusText);
    }

    var gist = await resp.json();
    var gistUrl = gist.html_url;

    await navigator.clipboard.writeText(gistUrl);

    linkBox.textContent = gistUrl;
    linkBox.style.display = 'block';
    keepBtn.style.display = 'block';
    showStatus('✅ ' + data.count + ' сообщений сохранено! Ссылка скопирована.', true);

  } catch(err) {
    showStatus('❌ ' + err.message, false);
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = '📋 Сохранить чат в Gist';
  }
});

keepBtn.addEventListener('click', function() {
  chrome.tabs.create({ url: 'https://keep.google.com' });
});

function showStatus(msg, ok) {
  statusEl.textContent = msg;
  statusEl.style.display = 'block';
  if (ok) {
    statusEl.style.background = '#e6f4ea';
    statusEl.style.color = '#1e7e34';
  } else {
    statusEl.style.background = '#fce8e6';
    statusEl.style.color = '#c62828';
  }
}