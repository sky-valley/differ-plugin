export const problem = (code, message, recovery, details = {}) => Object.assign(new Error(message), { code, recovery, ...details });

export function connectionError(error, stage, endpoint) {
  const cause = [error, error?.cause, ...(error?.cause?.errors || [])]
    .map(e => e?.code || e?.name).find(code => /^(EACCES|EPERM|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ETIMEDOUT|TimeoutError|AbortError)$/.test(code)) || 'unavailable';
  const permission = ['EACCES', 'EPERM'].includes(cause);
  const recovery = permission ? 'Request network permission for this publisher; do not change credentials.'
    : ['ENOTFOUND', 'EAI_AGAIN'].includes(cause) ? 'Check DNS and network access; this is not evidence of a bad token.'
    : cause === 'ECONNREFUSED' ? 'Check that the publisher is running at this endpoint.'
    : 'Check network/sandbox access and publisher availability; use normal permission approval if restricted.';
  return problem(permission ? 'network_permission_required' : 'connection_failed', `Publisher ${stage} failed (${cause}).`, `${recovery} Preserve pending state; run status before retrying publication.`, { stage, endpoint, cause, retryable: true });
}

export function errorResult(error) {
  return { code: error.code || 'client_error', message: error.message, recovery: error.recovery || 'Check setup; retain pending publication state.',
    ...Object.fromEntries(['stage', 'endpoint', 'cause', 'retryable'].filter(k => error[k] !== undefined).map(k => [k, error[k]])) };
}
