import { parsePushTarget } from '../pushTarget';

describe('parsePushTarget', () => {
  it('opens the search when the payload carries a search_id', () => {
    expect(parsePushTarget({ type: 'new_results', search_id: 'abc-123', category: 'immobili', count: 3 })).toEqual({
      kind: 'search',
      searchId: 'abc-123',
    });
  });

  it('falls back to the notifications screen otherwise', () => {
    expect(parsePushTarget({ type: 'new_results', count: 3 })).toEqual({ kind: 'notifications' });
    expect(parsePushTarget({ search_id: '   ' })).toEqual({ kind: 'notifications' });
    expect(parsePushTarget({ search_id: 42 })).toEqual({ kind: 'notifications' });
    expect(parsePushTarget(null)).toEqual({ kind: 'notifications' });
    expect(parsePushTarget(undefined)).toEqual({ kind: 'notifications' });
  });
});
