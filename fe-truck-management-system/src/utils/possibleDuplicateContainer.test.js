import { describe, expect, it } from 'vitest';
import { describeDuplicateContainerMatch, getPossibleDuplicateContainer } from './possibleDuplicateContainer';

const apiError = (code, details) => Object.assign(new Error('Pesan server'), {
  status: 409,
  payload: { error: { code, message: 'Container X sedang dititip pada SO-2.', details } },
});

describe('possibleDuplicateContainer', () => {
  it('mengenali error potensi container ganda dari backend', () => {
    const duplicate = getPossibleDuplicateContainer(apiError('CONTAINER_NUMBER_POSSIBLE_DUPLICATE', {
      containerNumber: 'SITU2688029',
      matches: [{ containerJobId: 'j-2', soNumber: 'SO-2', status: 'repo_stored' }],
    }));
    expect(duplicate.message).toBe('Container X sedang dititip pada SO-2.');
    expect(duplicate.containerNumber).toBe('SITU2688029');
    expect(duplicate.matches).toHaveLength(1);
  });

  it('container masih aktif/dititip (blokir backend) tidak pernah membuka konfirmasi pemakaian ulang', () => {
    expect(getPossibleDuplicateContainer(apiError('CONTAINER_NUMBER_IN_ACTIVE_JOB', {
      containerNumber: 'SITU2688029',
      matches: [{ containerJobId: 'j-2', status: 'repo_stored' }],
    }))).toBeNull();
  });

  it('error lain tidak dianggap duplikat', () => {
    expect(getPossibleDuplicateContainer(apiError('CONTAINER_JOB_TIMELINE_INVALID', []))).toBeNull();
    expect(getPossibleDuplicateContainer(new Error('jaringan'))).toBeNull();
    expect(getPossibleDuplicateContainer(null)).toBeNull();
  });

  it('details yang tidak lengkap tetap aman', () => {
    expect(getPossibleDuplicateContainer(apiError('CONTAINER_NUMBER_POSSIBLE_DUPLICATE', [])).matches).toEqual([]);
  });

  it('ringkasan job pembanding', () => {
    expect(describeDuplicateContainerMatch({ soNumber: 'SO-2', customerName: 'PT A', status: 'repo_stored', driverName: 'Setyadi' }))
      .toBe('SO-2 · PT A · Dititip · Sopir Setyadi');
    expect(describeDuplicateContainerMatch({})).toBe('SO -');
  });
});
