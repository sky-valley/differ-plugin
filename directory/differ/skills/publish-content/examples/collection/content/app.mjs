const status = document.querySelector('#status'), button = document.querySelector('button');
let reading = false, dirty = false;
async function refresh() {
  dirty = true; if (reading) return; reading = true;
  try {
    while (dirty) {
      dirty = false;
      const response = await fetch('/data/skies.html', { cache: 'no-store' });
      if (!response.ok) throw Error('The sky gallery could not be loaded.');
      const data = new DOMParser().parseFromString(await response.text(), 'text/html');
      document.querySelector('#gallery').replaceChildren(...[...data.querySelectorAll('#skies > li')].map(node => document.importNode(node, true)));
    }
  } catch (error) { status.textContent = error.message; }
  finally { reading = false; }
}
const events = new EventSource('/data/skies.html');
for (const name of ['open', 'mutation', 'reset']) events.addEventListener(name, refresh);
events.addEventListener('error', () => { status.textContent = 'Live updates interrupted. Reconnecting…'; });
window.addEventListener('online', refresh);
window.addEventListener('pagehide', () => events.close(), { once: true });
document.querySelector('form').addEventListener('submit', async event => {
  event.preventDefault(); button.disabled = true;
  try {
    const file = document.querySelector('#photo').files[0];
    const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif' }[file?.type];
    if (!ext || file.size > 10 * 1024 * 1024) throw Error('Choose a JPEG, PNG or GIF up to 10 MiB and 16 megapixels.');
    const participant = await pagelike.participate();
    const path = `/uploads/${encodeURIComponent(participant)}/${crypto.randomUUID()}.${ext}`;
    const uploaded = await fetch(path, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
    if (!uploaded.ok) throw Error(`Photo rejected (${uploaded.status}). Use a valid image up to 16 megapixels.`);
    const entry = document.createElement('li'); entry.dataset.owner = participant;
    const image = document.createElement('img'); image.src = path; image.alt = 'A participant’s sky'; entry.append(image);
    const saved = await fetch('/data/skies.html', { method: 'POST', headers: { 'Content-Type': 'text/html', Range: 'selector=#skies' }, body: entry.outerHTML });
    if (!saved.ok) throw Error(`Entry not saved (${saved.status}). Your uploaded photo can be removed through Your participation.`);
    status.textContent = 'Your sky is shared.'; document.querySelector('form').reset(); await refresh();
  } catch (error) { status.textContent = error.message; }
  finally { button.disabled = false; }
});
await refresh();
