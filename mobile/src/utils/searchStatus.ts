import type { ResultStatus, Search, SearchRunStatus } from '@/api/types';

/** A run is in flight: the UI shows a spinner and the detail query polls. */
export function isSearchBusy(search: Pick<Search, 'last_run_status'> | undefined | null): boolean {
  const status = search?.last_run_status;
  return status === 'pending' || status === 'running';
}

export type RunState = 'running' | 'ok' | 'error' | 'no_provider';

/** Collapses the server run status into the states the UI distinguishes. */
export function getRunState(status: SearchRunStatus): RunState {
  switch (status) {
    case 'pending':
    case 'running':
      return 'running';
    case 'error':
      return 'error';
    case 'no_provider':
      return 'no_provider';
    default:
      return 'ok';
  }
}

export type StatusTone = 'success' | 'danger' | 'neutral';

/** Colour family of the result status badge. ATTIVO is green; expired is red; unknown is neutral. */
export function getResultStatusTone(status: ResultStatus | string | null | undefined): StatusTone {
  switch (status) {
    case 'ATTIVO':
      return 'success';
    case 'SCADUTO':
      return 'danger';
    default:
      return 'neutral';
  }
}
