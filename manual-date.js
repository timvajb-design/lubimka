// Keep the original ISO field for form submission and existing app listeners.
// Its visible editor uses a numeric keyboard and the same local date on every platform.
(() => {
  'use strict';
  const fields = new WeakMap();
  const selector = 'input[type="date"],input[type="datetime-local"]';
  let serial = 0;
  function displayDate(iso) {
    if (!iso) return '';
    const [year, month, day] = iso.slice(0, 10).split('-');
    return day + '.' + month + '.' + year;
  }
  function parseDate(text) {
    const match = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(text);
    if (!match) return '';
    const [, dd, mm, yyyy] = match;
    const month = Number(mm), year = Number(yyyy), day = Number(dd);
    if (year < 1 || month < 1 || month > 12 || day < 1) return '';
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return day <= days[month - 1] ? yyyy + '-' + mm.padStart(2,'0') + '-' + dd.padStart(2,'0') : '';
  }
  function mask(raw) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return displayDate(raw);
    if (/[^\d./-]/.test(raw)) return raw;
    const parts = [''];
    for (const char of raw) {
      let at = parts.length - 1;
      if (/\D/.test(char)) {
        if (at < 2 && parts[at]) {
          parts.push('');
        }
      } else {
        if (at < 2 && parts[at].length === 2) { parts.push(''); at++; }
        if (at < 2 || parts[at].length < 4) parts[at] += char;
      }
    }
    return parts.join('.');
  }
  const value = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  function relabel(label) {
    const source = label.htmlFor ? document.getElementById(label.htmlFor) : label.querySelector(selector);
    const field = fields.get(source);
    if (field) label.htmlFor = field.editor.id;
  }
  function install(source) {
    if (fields.has(source) || source.hidden) return;
    const wasFocused = document.activeElement === source;
    const editor = document.createElement('input');
    const withTime = source.type === 'datetime-local';
    const time = withTime ? document.createElement('input') : null;
    const labels = Array.from(source.labels || []);
    editor.type = 'text';
    editor.inputMode = 'numeric';
    editor.placeholder = 'ДД.ММ.ГГГГ';
    editor.autocomplete = source.autocomplete || 'off';
    editor.maxLength = 16;
    editor.id = (source.id || 'local-date-' + ++serial) + '-manual';
    editor.dataset.manualDate = source.id || source.name || '';
    editor.className = source.className;
    editor.style.cssText = source.style.cssText;
    for (const attr of ['aria-label', 'aria-labelledby', 'aria-describedby', 'form']) {
      if (source.hasAttribute(attr)) editor.setAttribute(attr, source.getAttribute(attr));
    }
    if (!labels.length && !editor.hasAttribute('aria-label') && !editor.hasAttribute('aria-labelledby')) {
      if (source.id === 'pfDate') editor.setAttribute('aria-labelledby', 'pfDateLbl');
      else editor.setAttribute('aria-label', 'Дата');
    }
    source.before(editor);
    if (time) {
      time.type = 'time';
      time.className = source.className;
      time.dataset.manualDateTime = '';
      time.setAttribute('aria-label', 'Местное время');
      editor.after(time);
    }
    const controls = time ? [editor, time] : [editor];
    source.hidden = true;
    source.style.setProperty('display', 'none', 'important');
    source.focus = options => editor.focus(options);
    source.scrollIntoView = options => editor.scrollIntoView(options);
    function validate() {
      const input = editor.value, iso = parseDate(input);
      let message = '';
      if (input && !iso) message = 'Введите существующую дату в формате ДД.ММ.ГГГГ.';
      else if (time && Boolean(input) !== Boolean(time.value)) message = 'Укажите дату и местное время.';
      else if (source.validity.rangeUnderflow) message = 'Введите дату не раньше ' + displayDate(source.min) + '.';
      else if (source.validity.rangeOverflow) message = 'Введите дату не позже ' + displayDate(source.max) + '.';
      else if (source.validity.stepMismatch) message = 'Проверьте шаг даты или времени.';
      editor.setCustomValidity(message);
      if (!message) editor.removeAttribute('aria-invalid');
      return !message;
    }
    function syncConstraints() {
      for (const control of controls) {
        control.disabled = source.disabled;
        control.readOnly = source.readOnly;
        control.required = source.required;
      }
      if (time && source.hasAttribute('step')) time.step = source.step;
      validate();
    }
    function showValue() {
      const iso = value.get.call(source);
      editor.value = displayDate(iso);
      if (time) time.value = (iso.split('T')[1] || '');
      validate();
    }
    function setCanonical(event) {
      event.stopPropagation();
      if (event.target === editor && event.type === 'input') {
        const raw = editor.value, cursor = editor.selectionStart ?? raw.length;
        const formatted = mask(raw);
        if (formatted !== raw) {
          const tailDigits = raw.slice(cursor).replace(/\D/g, '').length;
          editor.value = formatted;
          let next = formatted.length, remaining = tailDigits;
          while (next && remaining) { if (/\d/.test(formatted[--next])) remaining--; }
          editor.setSelectionRange(next, next);
        }
      }
      const date = parseDate(editor.value);
      if (date && event.type === 'change') editor.value = displayDate(date);
      const iso = time ? (date && time.value ? date + 'T' + time.value : '') : date;
      value.set.call(source, iso);
      validate();
      source.dispatchEvent(new Event(event.type, {bubbles: true}));
    }
    fields.set(source, {editor, showValue, syncConstraints});
    for (const label of labels) label.htmlFor = editor.id;
    for (const control of controls) {
      control.addEventListener('input', setCanonical);
      control.addEventListener('change', setCanonical);
    }
    // The existing editors assign .value directly when opening a saved card or resetting a dialog.
    Object.defineProperty(source, 'value', {
      configurable: true, get() { return value.get.call(this); },
      set(next) { value.set.call(this, next); showValue(); }
    });
    // Native forms validate the visible editor; suppress the duplicate message on the hidden ISO control.
    source.addEventListener('invalid', event => event.preventDefault());
    editor.addEventListener('invalid', () => editor.setAttribute('aria-invalid', 'true'));
    syncConstraints(); showValue();
    if (wasFocused) editor.focus({preventScroll:true});
  }
  function scan(root) {
    if (root.nodeType !== 1 && root.nodeType !== 9) return;
    if (root.matches?.(selector)) install(root);
    if (root.matches?.('label')) relabel(root);
    for (const node of root.querySelectorAll(selector + ',label')) {
      if (node.tagName === 'LABEL') relabel(node); else install(node);
    }
  }
  function valid(source) {
    const field = fields.get(source);
    if (!field || !field.editor.getClientRects().length) return true;
    field.syncConstraints();
    if (field.editor.reportValidity()) return true;
    field.editor.focus(); return false;
  }
  function reject(event) { event.preventDefault(); event.stopImmediatePropagation(); }
  // These Mini App actions predate native forms and save with direct onclick handlers.
  const actions = [
    ['#regNextBtn', ['petBirth']], ['#recordSaveButton', ['recDate']],
    ['button[onclick="saveEdit()"]', ['editBirth']], ['#pfSave', ['pfDate']],
    ['#careReportBuildButton', ['careReportFrom', 'careReportTo']]
  ];
  document.addEventListener('click', event => {
    const button = event.target.closest?.('button');
    if (!button) return;
    const action = actions.find(([match]) => button.matches(match));
    if (action && !action[1].every(id => valid(document.getElementById(id)))) reject(event);
  }, true);
  document.addEventListener('submit', event => {
    for (const el of event.target.elements) {
      if (fields.has(el) && !valid(el)) { reject(event); break; }
    }
  }, true);
  document.addEventListener('reset', event => {
    queueMicrotask(() => {
      if (!event.defaultPrevented) for (const el of event.target.elements) fields.get(el)?.showValue();
    });
  });
  scan(document);
  new MutationObserver(changes => {
    for (const change of changes) {
      if (change.type === 'attributes') {
        const field = fields.get(change.target);
        if (field) { field.syncConstraints(); if (change.attributeName === 'value') field.showValue(); }
        else if (change.attributeName === 'type' && change.target.matches(selector)) install(change.target);
      } else for (const node of change.addedNodes) scan(node);
    }
  }).observe(document.documentElement, {childList:true, subtree:true, attributes:true, attributeFilter:['min','max','step','required','readonly','disabled','value','type']});
})();
