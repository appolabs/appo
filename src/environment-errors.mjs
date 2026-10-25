// Sandbox-aware failures: an agent sandbox may block the network or make the
// configuration folder read-only. The messages are fixed, one line each, and
// written to be relayed to the user; the original error is kept only as
// `cause` and is never printed (it can carry URLs and request details).

const NETWORK_MESSAGE =
  'Appo could not reach the network from here. If an AI agent ran this command, ask the user to run it in their own terminal or to approve network access for it.';
const CONFIG_MESSAGE =
  'Appo could not save its settings here (the folder is read-only). If an AI agent ran this command, ask the user to run it in their own terminal or to allow writing to it.';

const NETWORK_CODES = new Set([
  'EAI_AGAIN', 'ENOTFOUND', 'ECONNREFUSED', 'ENETUNREACH', 'EHOSTUNREACH', 'ETIMEDOUT', 'EPERM', 'EACCES',
]);
const WRITE_CODES = new Set(['EROFS', 'EACCES', 'EPERM']);

export class EnvironmentError extends Error {
  /**
   * @param {'network_unavailable' | 'config_not_writable'} code
   * @param {unknown} [cause]
   */
  constructor(code, cause) {
    super(code === 'network_unavailable' ? NETWORK_MESSAGE : CONFIG_MESSAGE, { cause });
    this.name = 'EnvironmentError';
    this.code = code;
    this.envelope = { error: 'environment', code, message: this.message };
  }
}

/** Classify a rejected fetch. Returns an EnvironmentError, or the original error when unrelated. */
export function fromFetchFailure(err) {
  if (err instanceof EnvironmentError) { return err; }
  const code = err?.cause?.code ?? err?.code;
  const isFetchFailed = err instanceof TypeError && err.message === 'fetch failed';
  if (isFetchFailed || (typeof code === 'string' && NETWORK_CODES.has(code))) {
    return new EnvironmentError('network_unavailable', err);
  }
  return err;
}

/** Classify a failed filesystem write. Returns an EnvironmentError, or the original error when unrelated. */
export function fromWriteFailure(err) {
  if (err instanceof EnvironmentError) { return err; }
  if (typeof err?.code === 'string' && WRITE_CODES.has(err.code)) {
    return new EnvironmentError('config_not_writable', err);
  }
  return err;
}
