import { getResultStatusTone, getRunState, isSearchBusy } from '../searchStatus';

describe('isSearchBusy', () => {
  it('is true only while a run is pending or running', () => {
    expect(isSearchBusy({ last_run_status: 'pending' })).toBe(true);
    expect(isSearchBusy({ last_run_status: 'running' })).toBe(true);
    expect(isSearchBusy({ last_run_status: 'ok' })).toBe(false);
    expect(isSearchBusy({ last_run_status: 'error' })).toBe(false);
    expect(isSearchBusy({ last_run_status: 'no_provider' })).toBe(false);
    expect(isSearchBusy(undefined)).toBe(false);
  });
});

describe('getRunState', () => {
  it('collapses server statuses into UI states', () => {
    expect(getRunState('pending')).toBe('running');
    expect(getRunState('running')).toBe('running');
    expect(getRunState('ok')).toBe('ok');
    expect(getRunState('error')).toBe('error');
    expect(getRunState('no_provider')).toBe('no_provider');
  });
});

describe('getResultStatusTone', () => {
  it('colours ATTIVO green, SCADUTO red and anything else neutral', () => {
    expect(getResultStatusTone('ATTIVO')).toBe('success');
    expect(getResultStatusTone('SCADUTO')).toBe('danger');
    expect(getResultStatusTone('SCONOSCIUTO')).toBe('neutral');
    expect(getResultStatusTone(null)).toBe('neutral');
  });
});
