export interface ThemeColorPair {
  dark: string;
  light: string;
  darkBg: string;
  lightBg: string;
}

export interface CteColorFamily {
  base: ThemeColorPair;
  shades: ThemeColorPair[];
}

export const SHADES_PER_FAMILY = 3;
export const SLOTS_PER_FAMILY = 1 + SHADES_PER_FAMILY; // 1 base + 3 derived shades

export const CTE_COLOR_FAMILIES: CteColorFamily[] = [
  // 1. Blue Family
  {
    base: {
      light: '#0066B8',
      dark: '#3794FF',
      lightBg: 'rgba(0, 102, 184, 0.08)',
      darkBg: 'rgba(55, 148, 255, 0.10)'
    },
    shades: [
      {
        // Lighter blue
        light: '#2B88D8',
        dark: '#75BEFF',
        lightBg: 'rgba(43, 136, 216, 0.06)',
        darkBg: 'rgba(117, 190, 255, 0.07)'
      },
      {
        // Darker blue
        light: '#004578',
        dark: '#1B6EC2',
        lightBg: 'rgba(0, 69, 120, 0.06)',
        darkBg: 'rgba(27, 110, 194, 0.07)'
      },
      {
        // Steel blue
        light: '#4A7A96',
        dark: '#569CD6',
        lightBg: 'rgba(74, 122, 150, 0.06)',
        darkBg: 'rgba(86, 156, 214, 0.07)'
      }
    ]
  },

  // 2. Amber / Orange Family
  {
    base: {
      light: '#B24716',
      dark: '#CE9178',
      lightBg: 'rgba(178, 71, 22, 0.08)',
      darkBg: 'rgba(206, 145, 120, 0.10)'
    },
    shades: [
      {
        // Lighter terracotta
        light: '#D86934',
        dark: '#E8B59F',
        lightBg: 'rgba(216, 105, 52, 0.06)',
        darkBg: 'rgba(232, 181, 159, 0.07)'
      },
      {
        // Darker copper
        light: '#7A2E0B',
        dark: '#A86448',
        lightBg: 'rgba(122, 46, 11, 0.06)',
        darkBg: 'rgba(168, 100, 72, 0.07)'
      },
      {
        // Muted sienna
        light: '#9E6347',
        dark: '#C47D5B',
        lightBg: 'rgba(158, 99, 71, 0.06)',
        darkBg: 'rgba(196, 125, 91, 0.07)'
      }
    ]
  },

  // 3. Emerald / Green Family
  {
    base: {
      light: '#147A54',
      dark: '#4EC9B0',
      lightBg: 'rgba(20, 122, 84, 0.08)',
      darkBg: 'rgba(78, 201, 176, 0.10)'
    },
    shades: [
      {
        // Lighter emerald / mint
        light: '#28A375',
        dark: '#82E0CC',
        lightBg: 'rgba(40, 163, 117, 0.06)',
        darkBg: 'rgba(130, 224, 204, 0.07)'
      },
      {
        // Darker forest green
        light: '#0B4F36',
        dark: '#2C9680',
        lightBg: 'rgba(11, 79, 54, 0.06)',
        darkBg: 'rgba(44, 150, 128, 0.07)'
      },
      {
        // Sage green
        light: '#49856E',
        dark: '#68B0A0',
        lightBg: 'rgba(73, 133, 110, 0.06)',
        darkBg: 'rgba(104, 176, 160, 0.07)'
      }
    ]
  },

  // 4. Purple / Violet Family
  {
    base: {
      light: '#7A3E9D',
      dark: '#C586C0',
      lightBg: 'rgba(122, 62, 157, 0.08)',
      darkBg: 'rgba(197, 134, 192, 0.10)'
    },
    shades: [
      {
        // Lighter violet / lavender
        light: '#9F5CC4',
        dark: '#DFB2DC',
        lightBg: 'rgba(159, 92, 196, 0.06)',
        darkBg: 'rgba(223, 178, 220, 0.07)'
      },
      {
        // Darker plum
        light: '#51236B',
        dark: '#9B5696',
        lightBg: 'rgba(81, 35, 107, 0.06)',
        darkBg: 'rgba(155, 86, 150, 0.07)'
      },
      {
        // Muted mauve
        light: '#7C608F',
        dark: '#B070AB',
        lightBg: 'rgba(124, 96, 143, 0.06)',
        darkBg: 'rgba(176, 112, 171, 0.07)'
      }
    ]
  },

  // 5. Crimson / Coral Family
  {
    base: {
      light: '#B81D33',
      dark: '#F48771',
      lightBg: 'rgba(184, 29, 51, 0.08)',
      darkBg: 'rgba(244, 135, 113, 0.10)'
    },
    shades: [
      {
        light: '#DE455B',
        dark: '#F9B1A2',
        lightBg: 'rgba(222, 69, 91, 0.06)',
        darkBg: 'rgba(249, 177, 162, 0.07)'
      },
      {
        light: '#7D1020',
        dark: '#C95640',
        lightBg: 'rgba(125, 16, 32, 0.06)',
        darkBg: 'rgba(201, 86, 64, 0.07)'
      },
      {
        light: '#9E4B57',
        dark: '#E06C55',
        lightBg: 'rgba(158, 75, 87, 0.06)',
        darkBg: 'rgba(224, 108, 85, 0.07)'
      }
    ]
  },

  // 6. Ochre / Gold Family
  {
    base: {
      light: '#8A6814',
      dark: '#DCDCAA',
      lightBg: 'rgba(138, 104, 20, 0.08)',
      darkBg: 'rgba(220, 220, 170, 0.10)'
    },
    shades: [
      {
        light: '#B58B24',
        dark: '#EFEFC6',
        lightBg: 'rgba(181, 139, 36, 0.06)',
        darkBg: 'rgba(239, 239, 198, 0.07)'
      },
      {
        light: '#5C4408',
        dark: '#B3B374',
        lightBg: 'rgba(92, 68, 8, 0.06)',
        darkBg: 'rgba(179, 179, 116, 0.07)'
      },
      {
        light: '#8C7847',
        dark: '#C9C98B',
        lightBg: 'rgba(140, 120, 71, 0.06)',
        darkBg: 'rgba(201, 201, 139, 0.07)'
      }
    ]
  },

  // 7. Cyan / Teal Family
  {
    base: {
      light: '#007A87',
      dark: '#4FC1FF',
      lightBg: 'rgba(0, 122, 135, 0.08)',
      darkBg: 'rgba(79, 193, 255, 0.10)'
    },
    shades: [
      {
        light: '#1FA3B0',
        dark: '#8CDDFF',
        lightBg: 'rgba(31, 163, 176, 0.06)',
        darkBg: 'rgba(140, 221, 255, 0.07)'
      },
      {
        light: '#004E57',
        dark: '#1E88C7',
        lightBg: 'rgba(0, 78, 87, 0.06)',
        darkBg: 'rgba(30, 136, 199, 0.07)'
      },
      {
        light: '#43858C',
        dark: '#63A7CC',
        lightBg: 'rgba(67, 133, 140, 0.06)',
        darkBg: 'rgba(99, 167, 204, 0.07)'
      }
    ]
  },

  // 8. Berry / Magenta Family
  {
    base: {
      light: '#A62675',
      dark: '#D16D9E',
      lightBg: 'rgba(166, 38, 117, 0.08)',
      darkBg: 'rgba(209, 109, 158, 0.10)'
    },
    shades: [
      {
        light: '#CC4B9A',
        dark: '#E89FC3',
        lightBg: 'rgba(204, 75, 154, 0.06)',
        darkBg: 'rgba(232, 159, 195, 0.07)'
      },
      {
        light: '#6E144B',
        dark: '#A34373',
        lightBg: 'rgba(110, 20, 75, 0.06)',
        darkBg: 'rgba(163, 67, 115, 0.07)'
      },
      {
        light: '#96547C',
        dark: '#BA5989',
        lightBg: 'rgba(150, 84, 124, 0.06)',
        darkBg: 'rgba(186, 89, 137, 0.07)'
      }
    ]
  }
];