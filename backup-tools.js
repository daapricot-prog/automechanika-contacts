/* Local backup and manual transfer only. No data is sent to a server. */
(() => {
  'use strict';
  const FORMAT = 'automechanika-contacts-backup';
  const VERSION = 1;
  const MAX_BYTES = 10 * 1024 * 1024;
  const FIELD_KEY = /^contact:.+\|.*:(comment|mailtext|sent|inactive)$/u;
  const tableCard = document.querySelector('.card');
  if (!tableCard || document.getElementById('backup-tools')) return;

  const style = document.createElement('style');
  style.textContent = `
    #backup-tools{margin:0 0 12px;padding:12px;border:1px solid #b9cad8;border-radius:10px;background:#f0f6fa;line-height:1.4}
    #backup-tools .backup-toolbar{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
    #backup-tools button{height:auto;min-height:38px;padding:8px 12px;cursor:pointer;font:600 13px/1.3 'Segoe UI',Arial,sans-serif;white-space:normal}
    #backup-tools .backup-secondary{background:#fff;color:#1f4e78;border-color:#b9cad8}
    #backup-summary{font-size:13px;color:#27465f}
    #backup-tools .backup-help{font-size:12px;color:#4e5e6d;margin:8px 0 0}
    #backup-status{font-size:13px;color:#176035;margin:8px 0 0;white-space:pre-wrap;overflow-wrap:anywhere}
    #backup-status[data-error="true"]{color:#a52820}
    #backup-status:empty{display:none}
    #backup-file[hidden]{display:none!important}
    @media print{#backup-tools{display:none}}
  `;
  document.head.appendChild(style);
  const section = document.createElement('section');
  section.id = 'backup-tools';
  section.setAttribute('aria-label', 'Резервная копия данных');
  // Static UI only. Imported content is never inserted as HTML.
  section.innerHTML = `<div class="backup-toolbar">
    <button type="button" id="backup-export">Скачать резервную копию</button>
    <button type="button" id="backup-import" class="backup-secondary">Восстановить из файла</button>
    <span id="backup-summary"></span>
    <input type="file" id="backup-file" accept=".json,application/json" hidden>
    </div><p class="backup-help">Письма, комментарии и отметки пока хранятся только в этом браузере. Копия включает данные всей таблицы независимо от фильтра. Автоматическая синхронизация не подключена.</p>
    <p class="backup-help">Файл содержит ваши тексты в открытом виде. Храните его у себя и не загружайте в публичный репозиторий.</p>
    <p id="backup-status" role="status" aria-live="polite"></p>`;
  tableCard.before(section);
  const saveNote = document.querySelector('.save-note');
  if (saveNote) saveNote.textContent = 'Автосохранение только в этом браузере, без синхронизации. Нажмите на e-mail или конверт, чтобы скопировать.';
  const status = document.getElementById('backup-status');
  const summary = document.getElementById('backup-summary');
  const picker = document.getElementById('backup-file');

  function message(text, error = false) {
    status.textContent = text;
    status.dataset.error = String(error);
  }
  function fieldOf(k) {
    return k.slice(k.lastIndexOf(':') + 1);
  }
  function isFlag(k) {
    return /:(sent|inactive)$/.test(k);
  }
  function entriesFromBrowser() {
    const entries = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && FIELD_KEY.test(k)) {
        const value = localStorage.getItem(k);
        if (value !== null) entries.push({key: k, value});
      }
    }
    return entries.sort((a, b) => a.key.localeCompare(b.key));
  }
  function counts(entries) {
    const result = {mailtext: 0, comment: 0, sent: 0, inactive: 0};
    for (const entry of entries) {
      const field = fieldOf(entry.key);
      if (isFlag(entry.key) ? entry.value === '1' : entry.value.trim().length > 0) result[field]++;
    }
    return result;
  }
  function countText(c) {
    return `Писем: ${c.mailtext}; комментариев: ${c.comment}; отправленных: ${c.sent}; неактуальных: ${c.inactive}.`;
  }
  function refreshSummary() {
    try { summary.textContent = 'В этом браузере — ' + countText(counts(entriesFromBrowser())); }
    catch (_) { summary.textContent = 'Нет доступа к хранилищу браузера. Не закрывайте страницу с заполненными текстами.'; }
  }
  function makeSnapshot() {
    const entries = entriesFromBrowser();
    const contacts = typeof D === 'undefined' ? [] : D.map(r => ({key: 'contact:' + r[0] + '|' + r[1], company: r[0], person: r[1], email: r[6]}));
    return {format: FORMAT, version: VERSION, exportedAt: new Date().toISOString(), source: location.origin + location.pathname, counts: counts(entries), contacts, entries};
  }
  function exportBackup() {
    try {
      const snapshot = makeSnapshot();
      if (!Object.values(snapshot.counts).some(Boolean)) {
        message('В этом браузере нет заполненных писем, комментариев или включённых отметок. Откройте страницу на исходном компьютере в том браузере, где вводили данные.', true);
        return;
      }
      const blob = new Blob([JSON.stringify(snapshot, null, 2)], {type: 'application/json;charset=utf-8'});
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'automechanika-backup-' + snapshot.exportedAt.replace(/[:.]/g, '-') + '.json';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      message('Файл резервной копии сформирован. ' + countText(snapshot.counts) + ' Проверьте его в загрузках браузера. Исходные данные не изменены.');
    } catch (_) {
      message('Не удалось создать копию. Не очищайте данные и не закрывайте страницу с письмами. Проверьте разрешения браузера на хранение данных и скачивание файлов.', true);
    }
  }
  function validateBackup(data) {
    if (!data || data.format !== FORMAT || data.version !== VERSION || !Array.isArray(data.entries) || data.entries.length > 10000) throw new Error('Неподходящий формат резервной копии.');
    const seen = new Set();
    for (const entry of data.entries) {
      if (!entry || typeof entry.key !== 'string' || entry.key.length > 2000 || !FIELD_KEY.test(entry.key) || typeof entry.value !== 'string' || entry.value.length > MAX_BYTES || seen.has(entry.key)) throw new Error('Некорректные или повторяющиеся поля в файле.');
      if (isFlag(entry.key) && entry.value !== '0' && entry.value !== '1') throw new Error('Некорректная отметка в файле.');
      seen.add(entry.key);
    }
    return data.entries;
  }
  async function restoreBackup(file) {
    if (!file) return;
    try {
      if (file.size > MAX_BYTES) throw new Error('Файл слишком большой. Максимум — 10 МБ.');
      const incoming = validateBackup(JSON.parse((await file.text()).replace(/^\uFEFF/, '')));
      const plan = [];
      let conflicts = 0;
      for (const entry of incoming) {
        const old = localStorage.getItem(entry.key);
        if (old === entry.value) continue;
        const empty = old === null || (!isFlag(entry.key) && !old.trim());
        if (empty) {
          if (isFlag(entry.key) || entry.value.trim()) plan.push({...entry, old});
        } else { conflicts++; }
      }
      if (!plan.length) {
        message(conflicts ? `Заполненные поля не заменены. Отличающихся полей: ${conflicts}. Ручной перенос не объединяет разные версии автоматически.` : 'Все данные из этой копии уже есть в браузере.');
        return;
      }
      const prompt = 'В выбранном файле: ' + countText(counts(incoming)) + '\n\nБудут добавлены данные в пустые поля: ' + plan.length + '.\nУже заполненные отличающиеся поля останутся без изменений: ' + conflicts + '.\n\nВосстановить данные в этом браузере?';
      if (!window.confirm(prompt)) { message('Восстановление отменено. Данные не изменены.'); return; }
      const applied = [];
      try {
        for (const entry of plan) {
          // Another tab may have changed a field after the preview; never overwrite it.
          if (localStorage.getItem(entry.key) !== entry.old) { conflicts++; continue; }
          localStorage.setItem(entry.key, entry.value);
          applied.push(entry);
        }
      } catch (_) {
        let restored = true;
        for (const entry of applied.reverse()) {
          try {
            if (localStorage.getItem(entry.key) === entry.value) {
              if (entry.old === null) localStorage.removeItem(entry.key);
              else localStorage.setItem(entry.key, entry.old);
            }
          } catch (_) { restored = false; }
        }
        throw new Error(restored ? 'Не удалось записать копию. Внесённые при восстановлении изменения отменены.' : 'Хранилище недоступно. Восстановление выполнено частично; проверьте поля.');
      }
      if (typeof draw === 'function') draw();
      message(`Восстановлено полей: ${applied.length}. Не заменены отличающиеся поля: ${conflicts}. Это разовый перенос, не автоматическая синхронизация.`);
    } catch (error) {
      message(error instanceof SyntaxError ? 'Не удалось прочитать JSON. Выберите файл, созданный кнопкой резервной копии.' : (error.message || 'Не удалось восстановить данные.'), true);
    } finally {
      picker.value = '';
      refreshSummary();
    }
  }
  document.getElementById('backup-export').addEventListener('click', exportBackup);
  document.getElementById('backup-import').addEventListener('click', () => picker.click());
  picker.addEventListener('change', () => restoreBackup(picker.files[0]));
  document.getElementById('body')?.addEventListener('input', refreshSummary);
  document.getElementById('body')?.addEventListener('change', refreshSummary);
  window.addEventListener('storage', refreshSummary);
  refreshSummary();
})();
