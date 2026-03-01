# chat-to-keep
keep the whole routerai.ru chat greed with AI Model to the Google Keep app in shape of a link to your gist.github.com
therefor you need to get your gist token to use this chrome based browser extension (Yandex browser et cetera)

**One click → chat turns into Markdown → uploaded to hosting with rendering → short link drops to Google Keep.**



---

## How to install

1. Create a folder, put all the files there
2. Save any 128×128 image as `icon128.png`
3. Chrome → `chrome://extensions` → turn on "Developer Mode" → "Download unpacked" → select a folder
4. Create a GitHub token once using the link in the \ popup (scope `gist` only)
5.Open the chat on RouterAI → click the extension icon → **"Save chat in Keep"**
Create a folder, put all the files there.

---

## Result

- В **Google Keep** появляется заметка с **короткой ссылкой** на GitHub Gist
- По ссылке — **красиво отрендеренный Markdown** с подсветкой кода, заголовками, списками и таблицами
- Gist **secret** (не индексируется, но доступен по ссылке)

Хочешь — могу допилить экстрактор конкретно под DOM-структуру RouterAI, чтобы парсинг был чище?
