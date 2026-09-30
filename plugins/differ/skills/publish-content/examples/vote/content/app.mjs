import { voteRequest, currentVotes } from './vote.mjs';
const status = document.querySelector('#status');
let reading = false, dirty = false;
let participant = null;
async function refresh() {
  dirty = true;
  if (reading) return;
  reading = true;
  try {
    while (dirty) {
      dirty = false;
      const response = await fetch('/data/votes.html', { cache: 'no-store' });
      if (!response.ok) throw Error('The room could not be loaded. Reconnecting…');
      const votes = currentVotes(new DOMParser().parseFromString(await response.text(), 'text/html'), participant);
      document.querySelector('#totals').textContent = `Tea ${votes.tea} · Coffee ${votes.coffee}`;
      document.querySelector('#mine').textContent = votes.mine ? `Your current choice: ${votes.mine}.` : '';
      for (const button of document.querySelectorAll('[data-choice]')) button.setAttribute('aria-pressed', String(button.dataset.choice === votes.mine));
    }
  } catch (error) { status.textContent = error.message; }
  finally { reading = false; }
}
const events = new EventSource('/data/votes.html');
for (const event of ['open', 'mutation', 'reset']) events.addEventListener(event, refresh);
events.addEventListener('error', () => { status.textContent = 'Live updates interrupted. Reconnecting…'; });
events.addEventListener('open', () => { status.textContent = ''; });
window.addEventListener('online', refresh);
window.addEventListener('pagehide', () => events.close(), { once: true });
for (const button of document.querySelectorAll('[data-choice]')) button.addEventListener('click', async () => {
  const buttons = [...document.querySelectorAll('button')];
  buttons.forEach(item => { item.disabled = true; });
  try {
    participant = await pagelike.participate();
    const response = await fetch('/data/votes.html', voteRequest(participant, button.dataset.choice));
    if (!response.ok) throw Error(`Your choice was not saved (${response.status}). Please try again.`);
    status.textContent = 'Your latest choice counts.';
    await refresh(); // A writer may not receive its own mutation event.
  } catch (error) { status.textContent = error.message; }
  finally { buttons.forEach(item => { item.disabled = false; }); }
});
await refresh();
participant = await pagelike.identity();
if (participant) await refresh();
