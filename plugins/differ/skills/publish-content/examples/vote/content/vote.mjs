// Shared by the UI and its rehearsal: these are the real submitted bytes.
export function voteRequest(participant, choice) {
  if (!['tea', 'coffee'].includes(choice)) throw Error('Choose tea or coffee.');
  const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  return { method: 'POST', headers: { 'Content-Type': 'text/html', Range: 'selector=#votes' },
    body: `<li data-voter="${escape(participant)}" data-choice="${choice}">${choice}</li>` };
}

export function currentVotes(document, participant = null) {
  const latest = new Map();
  for (const entry of document.querySelectorAll('#votes > li')) latest.set(entry.dataset.voter, entry.dataset.choice);
  return { tea: [...latest.values()].filter(choice => choice === 'tea').length,
    coffee: [...latest.values()].filter(choice => choice === 'coffee').length,
    mine: participant ? latest.get(participant) ?? null : null };
}
