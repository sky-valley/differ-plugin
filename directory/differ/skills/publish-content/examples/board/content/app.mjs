const status = document.querySelector('#status');
let reading = false, dirty = false;
async function refresh() {
  dirty = true; if (reading) return; reading = true;
  try {
    while (dirty) {
      dirty = false;
      const response = await fetch('/data/notes.html', { cache: 'no-store' });
      if (!response.ok) throw Error('The wall could not be loaded.');
      const data = new DOMParser().parseFromString(await response.text(), 'text/html');
      const notes = [...data.querySelectorAll('#notes > li')].map(note => {
        const card = document.createElement('li'), text = document.createElement('p'); text.textContent = note.textContent; card.append(text);
        for (const action of ['Rewrite', 'Remove']) {
          const button = document.createElement('button'); button.textContent = action;
          button.addEventListener('click', async () => {
            const next = action === 'Rewrite' ? prompt('Rewrite this note', note.textContent) : null;
            if (action === 'Rewrite' && next === null) return;
            button.disabled = true;
            await write(action === 'Rewrite' ? 'PUT' : 'DELETE', `#notes > li#${CSS.escape(note.id)}`, next, note.id);
            button.disabled = false;
          }); card.append(button);
        }
        return card;
      });
      document.querySelector('#wall').replaceChildren(...notes);
    }
  } catch (error) { status.textContent = error.message; }
  finally { reading = false; }
}
async function write(method, selector, text, id = `note_${crypto.randomUUID()}`) {
  try {
    await pagelike.participate();
    const entry = document.createElement('li'); entry.id = id; entry.textContent = text;
    const response = await fetch('/data/notes.html', { method, headers: { 'Content-Type': 'text/html', Range: `selector=${selector}` }, ...(method !== 'DELETE' ? { body: entry.outerHTML } : {}) });
    if (!response.ok) throw Error(`The wall was not changed (${response.status}). It may have changed elsewhere; refresh and try again.`);
    status.textContent = 'The wall has changed.'; await refresh();
  } catch (error) { status.textContent = error.message; }
}
document.querySelector('form').addEventListener('submit', async event => {
  event.preventDefault(); const button = event.submitter; button.disabled = true;
  await write('POST', '#notes', document.querySelector('#thought').value);
  button.disabled = false;
});
const events = new EventSource('/data/notes.html');
for (const name of ['open', 'mutation', 'reset']) events.addEventListener(name, refresh);
events.addEventListener('error', () => { status.textContent = 'Live updates interrupted. Reconnecting…'; });
window.addEventListener('online', refresh);
window.addEventListener('pagehide', () => events.close(), { once: true });
await refresh();
