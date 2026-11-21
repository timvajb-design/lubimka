(() => {
  if (location.origin !== 'https://lubimka-app.netlify.app' || window.__lubimkaExport) return;
  const maximum = 12 * 1024 * 1024;
  const types = new Set(['image/png', 'image/jpeg', 'application/pdf']);
  let pending;
  window.__lubimkaExport = true;
  window.addEventListener('click', event => {
    const a = event.target?.closest?.('a[download]');
    if (!a || !a.href.startsWith('blob:' + location.origin + '/')) return;
    event.preventDefault();
    const item = { id: crypto.randomUUID(), name: a.download || 'Любимка' };
    pending = item;
    // Retain the Blob before the page revokes its temporary URL.
    item.blob = fetch(a.href).then(r => r.blob()).catch(() => null);
    const activate = () => {
      if (pending !== item || !navigator.userActivation?.isActive) return;
      const params = new URLSearchParams({id:item.id, name:item.name.slice(0,100)});
      location.href = 'lubimka-save://file?' + params;
    };
    if (navigator.userActivation?.isActive) { activate(); return; }
    // Asynchronous PDF generation may finish after the original activation expires.
    item.prompt = document.createElement('dialog');
    const save = document.createElement('button');
    const cancel = document.createElement('button');
    save.textContent = 'Сохранить файл';
    cancel.textContent = 'Отмена';
    save.onclick = () => {item.prompt.close();activate();};
    cancel.onclick = () => {if (pending === item) pending = null;item.prompt.close();};
    item.prompt.addEventListener('close', () => item.prompt.remove(), {once:true});
    item.prompt.append(save, cancel);
    document.body.append(item.prompt);
    item.prompt.showModal();
  }, true);
  window.addEventListener('message', async e => {
    const item = pending;
    const port = e.ports?.[0];
    if (!item || !port || e.data !== 'lubimka-export:' + item.id) return;
    pending = null;
    try {
      const blob = await item.blob;
      if (!blob || !types.has(blob.type) || !blob.size || blob.size > maximum) throw Error();
      let offset = 0;
      port.onmessage = async event => {
        try {
          if (event.data !== 'next') return;
          if (offset === blob.size) { port.postMessage('end');port.close();return; }
          const bytes = new Uint8Array(await blob.slice(offset, offset + 32768).arrayBuffer());
          offset += bytes.length;
          port.postMessage(btoa(String.fromCharCode(...bytes)));
        } catch { port.postMessage('error');port.close(); }
      };
      port.postMessage(JSON.stringify({type:blob.type,size:blob.size}));
    } catch { port.postMessage('error');port.close(); }
  });
})();
