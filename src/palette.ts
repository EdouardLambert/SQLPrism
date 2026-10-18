export interface ThemeColorPair {
  dark: string;
  light: string;
}

export interface CteColorFamily {
  base: ThemeColorPair;
  shades: ThemeColorPair[];
}

export const SHADES_PER_FAMILY = 1;
export const SLOTS_PER_FAMILY = 1 + SHADES_PER_FAMILY;

// 8 Colored Neutral CTE families (Distinct hues, but muted/dusty to remain subtle)
// Ordered to maximize contrast and keep less preferred colors (like Amber) at the end.
export const CTE_COLOR_FAMILIES: CteColorFamily[] = [
  // 1. Muted Blue (Bleu Rabattu)
  {
    base: { dark: '#6A8CAF', light: '#4A6B8C' },
    shades: [{ dark: '#85A6C9', light: '#2B4761' }]
  },
  // 2. Muted Fern (Fougère Douce) - Swapped up for better contrast with Blue
  {
    base: { dark: '#799979', light: '#476E47' },
    shades: [{ dark: '#94B394', light: '#2A452A' }]
  },
  // 3. Dusty Mauve (Mauve Cendré)
  {
    base: { dark: '#9980B3', light: '#6F5687' },
    shades: [{ dark: '#B39CCC', light: '#4C3761' }]
  },
  // 4. Dusty Rose (Vieux Rose)
  {
    base: { dark: '#B3738A', light: '#8C5163' },
    shades: [{ dark: '#CC8FA6', light: '#613141' }]
  },
  // 5. Slate Teal (Sarcelle Ardoise)
  {
    base: { dark: '#669999', light: '#3D6E6E' },
    shades: [{ dark: '#82B3B3', light: '#234545' }]
  },
  // 6. Muted Brick (Brique Douce)
  {
    base: { dark: '#B36666', light: '#8C4545' },
    shades: [{ dark: '#CC8282', light: '#612929' }]
  },
  // 7. Muted Olive (Olive Terne)
  {
    base: { dark: '#A69F68', light: '#7A7543' },
    shades: [{ dark: '#C2BB84', light: '#524E27' }]
  },
  // 8. Dusty Amber (Ambre Poussiéreux)
  {
    base: { dark: '#B38666', light: '#8C623E' },
    shades: [{ dark: '#CCA182', light: '#613E21' }]
  }
];

export enum TypeCategoryIndex {
  Integer = 0,
  Float = 1,
  Text = 2,
  DateTime = 3,
  Boolean = 4,
  Complex = 5
}

// Vibrant semantic palette for explicit SQL data types
export const TYPE_PALETTE: ThemeColorPair[] = [
  // 0: Integer (Red / Coral)
  { dark: '#FF5555', light: '#f11501' },
  // 1: Float & Precision (Blue)
  { dark: '#86c7f9', light: '#4199dc' },
  // 2: Textual (Green)
  { dark: '#50FA7B', light: '#3dc774' },
  // 3: Date & Time (Violet)
  { dark: '#c8a7f6', light: '#a05dff' },
  // 4: Logical / Boolean (Gold / Orange)
  { dark: '#ecbf92', light: '#f5a207' },
  // 5: Complex & Spatial (Pink / Magenta)
  { dark: '#f6bcdd', light: '#f66ab9' }
];