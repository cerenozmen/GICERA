import { scoreBlockers } from '../src/api';

describe('scoreBlockers: the names that withheld a score', () => {
  it('names a misread that may be a flagged substance, and a name missing from the dictionary, apart', () => {
    const blockers = scoreBlockers([
      { text: 'Aqua', status: 'matched', matchedName: 'aqua' },
      // A real tube: "Isoamyl Laurate" read so badly it could be a flagged laurate.
      { text: 'Mony Laurate', status: 'unknown', kind: 'resembles_flagged', ocrSuspect: true },
      { text: 'Qwertzia Ferment', status: 'unknown', kind: 'unrecognizable', ocrSuspect: true },
      { text: 'Propylene Glutathione Carbonate', status: 'unknown', kind: 'unrecognizable', ocrSuspect: false },
      // Harmless: can't change the score, so not named as a reason.
      { text: 'Dibutyl Adlipate', status: 'unknown', kind: 'resembles_safe', ocrSuspect: true },
      { text: 'Deinococcus Ferment Extract Filtrate', status: 'unknown', kind: 'unlisted', ocrSuspect: false },
    ]);
    expect(blockers).toEqual({ misread: ['Mony Laurate', 'Qwertzia Ferment'], notInDictionary: ['Propylene Glutathione Carbonate'] });
  });
});
