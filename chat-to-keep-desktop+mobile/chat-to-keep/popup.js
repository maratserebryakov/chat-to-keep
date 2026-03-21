function grab() {
  const messages = document.querySelectorAll(siteConfig.messageSelector);
  console.log(`[Extract] Found ${messages.length} message elements`);

  for (const msg of messages) {
    let role = null;

    // Проверка по классам сообщения (для RouterAI)
    if (msg.classList.contains(siteConfig.userClass)) {
      role = 'user';
    } else if (msg.classList.contains(siteConfig.assistantClass)) {
      role = 'assistant';
    }

    // Если не определили, пробуем искать внутренние признаки (для DeepSeek)
    if (!role) {
      // Проверяем наличие дочернего элемента с классом ds-think-content (ассистент)
      if (msg.querySelector('.ds-think-content')) {
        role = 'assistant';
      }
      // Проверяем наличие класса _5cadb25 (пользователь)
      else if (msg.classList.contains('_5cadb25')) {
        role = 'user';
      }
    }

    // Fallback: data-role или наличие слов в классе
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

    // Поиск текстового контейнера
    let textEl = msg.querySelector(siteConfig.textSelector);
    if (!textEl) {
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
