export interface ThemeColorPair {
  dark: string;
  light: string;
}

export const CTE_PALETTE: ThemeColorPair[] = [
  // 1. Pastel Sky Blue
  { dark: '#7DCFFF', light: '#0062A3' },
  // 2. Pastel Mint / Emerald
  { dark: '#73DACA', light: '#0D7A5F' },
  // 3. Pastel Peach / Coral
  { dark: '#FF9E64', light: '#B84B11' },
  // 4. Pastel Lavender
  { dark: '#BB9AF7', light: '#673AB7' },
  // 5. Pastel Lemon / Butter
  { dark: '#E0AF68', light: '#8F6200' },
  // 6. Pastel Rose / Flamingo
  { dark: '#F7768E', light: '#AD1457' },
  // 7. Pastel Aqua / Cyan
  { dark: '#2AC3DE', light: '#007C91' },
  // 8. Pastel Lime / Pistachio
  { dark: '#9ECE6A', light: '#3E7516' }
];

export enum TypeCategoryIndex {
  Integer = 0,
  Float = 1,
  Text = 2,
  DateTime = 3,
  Boolean = 4,
  Complex = 5
}

export const DATA_TYPE_PALETTE: ThemeColorPair[] = [
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