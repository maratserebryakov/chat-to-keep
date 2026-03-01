(async function() {
  // Проверяем — не запущен ли уже
  if (document.getElementById('chat2gist-panel')) return;

  // Создаём панель
  var panel = document.createElement('div');
  panel.id = 'chat2gist-panel';
  panel.innerHTML = '\
    <div style="position:fixed;bottom:0;left:0;right:0;z-index:999999;\
      background:#1a1a2e;color:#fff;padding:16px;font-family:sans-serif;\
      font-size:15px;box-shadow:0 -4px 20px rgba(0,0,0,0.5);\
      border-top:3px solid #4CAF50;max-height:50vh;overflow-y:auto;" id="chat2gist-inner">\
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">\
        <b style="font-size:17px;">📋 Chat to Gist</b>\
        <span id="chat2gist-close" style="font-size:24px;cursor:pointer;padding:0 8px;">✕</span>\
      </div>\
      <div style="margin-bottom:10px;">\
        <input id="chat2gist-token" type="password" placeholder="GitHub Token (ghp_...)" \
          style="width:100%;padding:10px;border:1px solid #555;border-radius:8px;\
          background:#2a2a4a;color:#fff;font-size:14px;box-sizing:border-box;" />\
      </div>\
      <button id="chat2gist-save" style="width:100%;padding:12px;background:#4CAF50;\
        color:#fff;border:none;border-radius:8px;font-size:16px;font-weight:bold;\
        cursor:pointer;">📋 Сохранить чат в Gist</button>\
      <div id="chat2gist-status" style="display:none;margin-top:10px;padding:10px;\
        border-radius:8px;font-size:13px;word-break:break-all;"></div>\
      <div id="chat2gist-link" style="display:none;margin-top:8px;padding:10px;\
        background:#2a2a4a;border-radius:8px;word-break:break-all;">\
        <a id="chat2gist-url" href="#" target="_blank" style="color:#64B5F6;font-size:13px;"></a>\
      </div>\
      <button id="chat2gist-keep" style="display:none;width:100%;margin-top:8px;\
        padding:10px;background:#FF9800;color:#fff;border:none;border-radius:8px;\
        font-size:14px;cursor:pointer;">📌 Открыть Google Keep</button>\
    </div>';
  document.body.appendChild(panel);

  // Загрузить сохранённый токен
  chrome.storage.local.get('ghToken', function(data) {
    if (data.ghToken) {
      document.getElementById('chat2gist-token').value = data.ghToken;
    }
  });

  // Закрытие
  document.getElementById('chat2gist-close').addEventListener('click', function() {
    panel.remove();
  });

  // Keep
  document.getElementById('chat2gist-keep').addEventListener('click', function() {
    window.open('https://keep.google.com', '_blank');
  });

  // Сохранение
  document.getElementById('chat2gist-save').addEventListener('click', async function() {
    var token = document.getElementById('chat2gist-token').value.trim();
    var statusEl = document.getElementById('chat2gist-status');
    var linkEl = document.getElementById('chat2gist-link');
    var keepBtn = document.getElementById('chat2gist-keep');
    var saveBtn = document.getElementById('chat2gist-save');

    if (!token) {
      showStatus('Введите GitHub Token', false);
      return;
    }

    chrome.storage.local.set({ ghToken: token });
    saveBtn.disabled = true;
    saveBtn.textContent = '⏳ Прокрутка и сбор...';

    try {
      var data = await collectChat();

      if (!data.markdown || data.markdown.trim().length < 20) {
        throw new Error('Не удалось извлечь сообщения');
      }

      saveBtn.textContent = '⏳ Отправка в GitHub...';

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

      try { await navigator.clipboard.writeText(gistUrl); } catch(e) {}

      var urlEl = document.getElementById('chat2gist-url');
      urlEl.href = gistUrl;
      urlEl.textContent = gistUrl;
      linkEl.style.display = 'block';
      keepBtn.style.display = 'block';
      showStatus('✅ ' + data.count + ' сообщений сохранено!', true);

    } catch(err) {
      showStatus('❌ ' + err.message, false);
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = '📋 Сохранить чат в Gist';
    }
  });

  function showStatus(msg, ok) {
    var el = document.getElementById('chat2gist-status');
    el.textContent = msg;
    el.style.display = 'block';
    el.style.background = ok ? '#1b5e20' : '#b71c1c';
    el.style.color = '#fff';
  }

  // ==================== СБОР ЧАТА ====================
  async function collectChat() {
    var collected = [];
    var seenKeys = new Set();

    function htmlToMarkdown(el) {
      var md = '';
      var children = el.childNodes;
      for (var i = 0; i < children.length; i++) {
        var node = children[i];
        if (node.nodeType === 3) { md += node.textContent; continue; }
        if (node.nodeType !== 1) continue;
        var tag = node.tagName.toLowerCase();
        if (tag === 'pre') {
          var codeEl = node.querySelector('code');
          var codeText = codeEl ? codeEl.textContent : node.textContent;
          var lang = '';
          if (codeEl && codeEl.className) {
            var m = codeEl.className.match(/language-(\w+)/);
            if (m) lang = m[1];
          }
          md += '\n\n```' + lang + '\n' + codeText.trim() + '\n```\n\n';
        } else if (tag === 'code' && (!node.parentElement || node.parentElement.tagName.toLowerCase() !== 'pre')) {
          md += '`' + node.textContent + '`';
        } else if (tag === 'h1') { md += '\n\n# ' + node.textContent.trim() + '\n\n'; }
        else if (tag === 'h2') { md += '\n\n## ' + node.textContent.trim() + '\n\n'; }
        else if (tag === 'h3') { md += '\n\n### ' + node.textContent.trim() + '\n\n'; }
        else if (tag === 'h4') { md += '\n\n#### ' + node.textContent.trim() + '\n\n'; }
        else if (tag === 'p') { md += '\n\n' + htmlToMarkdown(node) + '\n\n'; }
        else if (tag === 'strong' || tag === 'b') { md += '**' + htmlToMarkdown(node) + '**'; }
        else if (tag === 'em' || tag === 'i') { md += '*' + htmlToMarkdown(node) + '*'; }
        else if (tag === 'a') { md += '[' + node.textContent + '](' + (node.getAttribute('href') || '') + ')'; }
        else if (tag === 'ul') {
          md += '\n\n';
          node.querySelectorAll(':scope > li').forEach(function(li) {
            md += '- ' + htmlToMarkdown(li).trim() + '\n';
          });
          md += '\n';
        } else if (tag === 'ol') {
          md += '\n\n';
          var lis = node.querySelectorAll(':scope > li');
          lis.forEach(function(li, idx) { md += (idx+1) + '. ' + htmlToMarkdown(li).trim() + '\n'; });
          md += '\n';
        } else if (tag === 'blockquote') {
          htmlToMarkdown(node).trim().split('\n').forEach(function(line) { md += '> ' + line + '\n'; });
        } else if (tag === 'table') {
          var rows = node.querySelectorAll('tr');
          md += '\n\n';
          rows.forEach(function(row, ri) {
            var cells = row.querySelectorAll('th, td');
            var line = '|';
            cells.forEach(function(c) { line += ' ' + c.textContent.trim() + ' |'; });
            md += line + '\n';
            if (ri === 0) { var sep = '|'; cells.forEach(function() { sep += ' --- |'; }); md += sep + '\n'; }
          });
          md += '\n';
        } else if (tag === 'hr') { md += '\n\n---\n\n'; }
        else if (tag === 'br') { md += '\n'; }
        else { md += htmlToMarkdown(node); }
      }
      return md;
    }

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
        var plainText = textEl.innerText.trim();
        if (plainText.length < 2) return;
        var key = role + ':' + plainText.substring(0, 80);
        if (seenKeys.has(key)) return;
        seenKeys.add(key);
        var text = (role === 'assistant') ? htmlToMarkdown(textEl).replace(/\n{4,}/g, '\n\n\n').trim() : plainText;
        collected.push({ role: role, text: text });
      });
    }

    // Найти скролл-контейнер
    var container = null;
    var firstMsg = document.querySelector('.routerai-chat-message');
    if (firstMsg) {
      var el = firstMsg.parentElement;
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

    var savedScroll = container.scrollTop;

    container.scrollTop = 0;
    await new Promise(function(r) { setTimeout(r, 1000); });
    grab();

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

    // Вернуть скролл
    container.scrollTop = savedScroll;

    var md = '';
    collected.forEach(function(m, i) {
      md += (m.role === 'user') ? '## 🧑 Вопрос\n\n' : '## 🤖 Ответ\n\n';
      md += m.text + '\n\n';
      if (i < collected.length - 1) md += '---\n\n';
    });

    return { markdown: md, count: collected.length };
  }

})();