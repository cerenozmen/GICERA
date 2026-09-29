import { readIngredientList } from '../src/ingredients';

// Raw ML Kit blocks from a real blurry photo of a face cream label (Samsung S23). The extracted
// list is the BLURRY fixture in backend/src/services/ingredientCoverage.test.ts, where the server
// withholds its score.
const BLURRY_OCR = [
  ['INGREDIENTS: Aqua, Glycerin,', 'Isopropyl Palmitate, Glyceryl Stearate,', 'Parafinum Liquidum, Sorbitol,'],
  [
    'Leryl Alcohol, Stearic Aciá palmeearyl Alcohol,',
    'CAcid, Phenoxyethanol,',
    'Coco-Caprlate/Caprate, Potassium Cetyl Phosphate,',
    'Triethanolamine, Carbomer, Fragaria Vesca Fruit Extract, Parum,',
    'Inulin, BIS-Digiyceryl Polyacyladipate-2, PEG-40 Castor 0il, Tocopheryl',
    'Acetate, Panthenol, Sodium Cetearyl Sulfate, Ethylhexygjycein,',
    'Tetrasodium EDTA, Fructose,',
    'Tetramethyl',
    'Aceryloctahydronaphthalenes Potaceii D,',
    'A,. Citric Acid.',
  ],
  ['8"682276"606890'],
  ['Sorumlu Kişi: Anthemis Pharma Cosmetics Kozmetik San, ve Tic. AS', 'Deri Osb Mah. Kumpas Cad. No: 15/A Tuzla/(STANBUL', "+90 216640 00 20 Türkiye'de üretilmiştir."],
  ['30mln'],
  ['PP'],
];

describe('readIngredientList', () => {
  it('extracts the list from a real photo and stops before the barcode and address', () => {
    const reading = readIngredientList(BLURRY_OCR);
    expect(reading.status).toBe('ok');
    const items = reading.ingredientsText?.split(', ') ?? [];
    expect(items).toHaveLength(28);
    expect(items[0]).toBe('Aqua');
    expect(items[items.length - 1]).toBe('Citric Acid');
    expect(reading.ingredientsText).not.toMatch(/Sorumlu|Tuzla|606890/);
  });

  it('keeps parenthesised groups together', () => {
    const reading = readIngredientList([
      ['İçindekiler: Şeker, bitkisel yağ (ayçiçek', 'yağı, palm yağı), kakao, emülgatör (lesitin).'],
      ['Net 100 g'],
    ]);
    expect(reading).toEqual({
      status: 'ok',
      ingredientsText: 'Şeker, bitkisel yağ (ayçiçek yağı, palm yağı), kakao, emülgatör (lesitin)',
    });
  });

  it('reports a list that stops mid-item before the next section as partial', () => {
    // Real photo taken upside down: lines come out bottom-up, so after the heading only
    // "Aqua, Glycerin," is followed by "30ml". Scored as a 2-item list this gave 100/100.
    const upsideDown = [
      [
        'Acetyloctahydronaphthalenes, Potassium Phosphate, BHA,',
        'Citric Acid.',
        'Tetrasodíum EDTA, Fructose, Hexamethylindanopyran, Tetramethyl',
        'Acetate, Panthenol, Sodium Cetearyl Sulfate, Ethylhexylglycerin,',
        'Inulin, BIS-Digjyceryl Polyacyladipate-2, PEG-40 Castor Oi, Tocophery',
        'Triethanolamine,',
        'Carbomer, Fragaria Vesca Fruit Extract, Parfum,',
        'Coco-Capryate/Caprate, Potassium Cetyl Phosphate,',
        'Cetyl Alcohol, Stearic Acid, Palimitic',
        'Acid, Phenoxyethanol,',
        'Paraffinum Liquidum, Sorbitol, Cetearyl Alcohol,',
      ],
      ['8"682276"606890'],
      ["+90 216 640 00 20 Türkiye'de üretilmiştir.", 'Deri Osb Mah. Kumpas Cad. No: 15/A Tuzla/(iSTANBUL', 'Sorumlu Kişi: Anthemis Pharma Cosmetics Kozmetik San. ve Tic. AS.'],
      ['isopropy Pamitate, Giyceryl Stearate,'],
      ['INGREDIENTS: Aqua,', 'Glycerin,'],
      ['30ml'],
      ['OAETM)'],
      ['|'],
    ];
    expect(readIngredientList(upsideDown).status).toBe('partial');
  });

  it('ends the list at a final period followed by a batch code', () => {
    // Real blush label: recycling and distributor lines follow the list and used to be read as ingredients.
    const reading = readIngredientList([
      [
        'INGREDIENTS: TALC, MICA, MAGNESIUM MYRISTATE, SILICA,',
        'CI 77499, CI 73360, CI 77891. (LO519)',
        'EN: Primary pack PS6-Plastic recycling bin',
        'Pan holder: ALU 41- Metal recycling t',
        'Label: CIPAP 81- Paper recycling bin',
      ],
      ['DIST. MARKWINS BEAUTY BRANDS, INC'],
      ['CITY OF INDUSTRY, CA 91789.'],
    ]);
    expect(reading).toEqual({
      status: 'ok',
      // The server drops the parenthesised batch code and trailing period when matching: "ci 77891".
      ingredientsText: 'TALC, MICA, MAGNESIUM MYRISTATE, SILICA, CI 77499, CI 73360, CI 77891. (LO519)',
    });
  });

  it('reports a list as partial when most of the listed text lies outside it', () => {
    // Real upside-down photo: after the heading only "Aqua, Glycerin," and a stray "HEI A" follow,
    // while the rest of the list (30+ commas) comes before the heading. It used to score 100.
    const upsideDown = [
      [
        'Acetyloctahydronaphthalenes, Potassium Phosphate, BHA, Citric Acid.',
        'Tetrasodium EDTA, Fructose, Hexamethylindanopyran, Tetramethyl',
        'Acetate, Panthenol, Sodium Cetearyl Sulfate, Ethylhexylglycerin,',
        'Inulin, BlS-Digyceryl Polyacyladipate-2, PEG-40 Castor Oil, Tocopheryl',
        'Triethanolamine, Carbomer, Fragaria Vesca Frut Extract, Parfum,',
        'Coco-Caprylate/Caprate, Potassium Cetyl Phosphate,',
        'Cetyl Alcohol, Stearic Acid, Palmitic Acid, Phenoxyethanol,',
        'Paraffinum',
        'Liquidum, Sorbitol, Cetearyl Alcohol,',
        'Isopropy! Palmitate, Giyceryl Stearate,',
      ],
      ['8"682276"606890'],
      ['Deri Osb Mah. Kumpas Cad. No: 15/A Tula/ISTANBUL', 'Sorumlu Kişi: Anthemis Pharma Cosmetics Kozmetik Şan, ve Tic, A.Ș.'],
      ['30mle', 'ROZMEn'],
      ['INGREDIENTS: Aqua, Glycerin,'],
      ['HEI A'],
    ];
    expect(readIngredientList(upsideDown).status).toBe('partial');
  });

  it('reports a list cut off at the photo edge as partial', () => {
    expect(readIngredientList([['Ingredients: Aqua, Glycerin, Cetearyl Alcohol,', 'Dimethicone, Phenoxy-']]).status).toBe('partial');
  });
});

describe('garbledHeading: a list heading OCR garbled on small curved print', () => {
  const { garbledHeading, stripHeading } = require('../src/ingredients');

  it('finds the heading in the garbled readings of a real tube scan', () => {
    for (const row of ['lindeliler: :Aqua, I Dinethicone, tny', 'lçindeliler: Aqua, I Dimethicone, to', 'ondeliler: Aqua, C Dimethicone, b'.replace('ondeliler', 'lgindeliler')]) {
      expect(garbledHeading(row)).not.toBeNull();
    }
    expect(stripHeading('lindeliler: :Aqua, Dimethicone, Isoamyl')).toBe('Aqua, Dimethicone, Isoamyl');
  });

  it('ignores ordinary words and a heading-like word with no list after it', () => {
    for (const row of ['içindeki krem, göz çevresine', 'Kullanmadan önce, cildinizin', 'lçindekiler hakkında bilgi', 'İnceleyiniz: Aqua, Glycerin, Mica', 'lindeliler: Aqua cearate.', 'lindeliler: Aqua, Gycerin', 'INGREDIENTS Aqua,']) {
      expect(garbledHeading(row)).toBeNull();
    }
  });
});
