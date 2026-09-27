/**
 * SOUL colour tokens (spec section 5, DECISIONS D-025, D-026).
 *
 * Black, white and one neutral grey ramp. Greys exist only for secondary text, dividers,
 * disabled controls, skeletons, subtle surfaces, input borders and state hierarchy.
 * One romantic accent (owner decision D-026) is reserved for like, match and heart
 * moments only: never for buttons in general, badges, links or decoration.
 * SOUL deliberately does not use Android dynamic (wallpaper) colours.
 * Colour is never the only state indicator: pair it with text, icon or weight.
 */
const romance = {
  /** Deep wine: 8.97:1 against white. */
  wine: '#8C1D35',
  /** Rose: 6.85:1 against black. */
  rose: '#E0708A',
} as const;

const grey = {
  0: '#FFFFFF',
  50: '#F7F7F7',
  100: '#EFEFEF',
  150: '#E6E6E6',
  200: '#D6D6D6',
  300: '#BDBDBD',
  400: '#9E9E9E',
  500: '#707070',
  600: '#5C5C5C',
  700: '#3D3D3D',
  800: '#262626',
  850: '#1C1C1C',
  900: '#121212',
  950: '#0A0A0A',
  1000: '#000000',
} as const;

export type ColorTokens = {
  /** Screen background. */
  background: string;
  /** Sheets, inputs and raised surfaces. */
  surface: string;
  /** Quiet grouping surface (skeleton base, subtle fills). */
  surfaceSubtle: string;
  /** Pressed-state fill for rows and quiet buttons. */
  surfacePressed: string;
  textPrimary: string;
  textSecondary: string;
  /** Lowest-emphasis text that still meets 4.5:1 on `background`. */
  textTertiary: string;
  textDisabled: string;
  /** Emphasis surface (primary button, badges, selected states). */
  inverseSurface: string;
  inverseText: string;
  divider: string;
  border: string;
  borderStrong: string;
  skeleton: string;
  skeletonHighlight: string;
  /** Scrim behind sheets and modals. */
  scrim: string;
  /** Photo overlay for text legibility on imagery. */
  photoScrim: string;
  /** Bottom-up fade on photos (CSS linear-gradient), behind text on swipe cards. */
  photoGradient: string;
  onPhoto: string;
  /** Like, match and heart moments only (D-026). */
  accent: string;
  /** Text or icon drawn on an `accent` fill. */
  onAccent: string;
  /** Fixed black surface for brand moments (welcome, match reveal) in both appearances. */
  moment: string;
  onMoment: string;
  onMomentSecondary: string;
  /** Accent drawn on `moment` surfaces. */
  accentOnMoment: string;
  /** Fixed white surface (black logo, light brand blocks) in both appearances. */
  paper: string;
};

export const lightColors: ColorTokens = {
  background: grey[0],
  surface: grey[0],
  surfaceSubtle: grey[50],
  surfacePressed: grey[100],
  textPrimary: grey[950],
  textSecondary: grey[600],
  textTertiary: grey[500],
  textDisabled: grey[400],
  inverseSurface: grey[950],
  inverseText: grey[0],
  divider: grey[150],
  border: grey[200],
  borderStrong: grey[950],
  skeleton: grey[100],
  skeletonHighlight: grey[50],
  scrim: 'rgba(0, 0, 0, 0.48)',
  photoScrim: 'rgba(0, 0, 0, 0.42)',
  photoGradient: 'linear-gradient(180deg, rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 0.72) 100%)',
  onPhoto: grey[0],
  accent: romance.wine,
  onAccent: grey[0],
  moment: grey[1000],
  onMoment: grey[0],
  onMomentSecondary: grey[300],
  accentOnMoment: romance.rose,
  paper: grey[0],
};

/** OLED-true black is a deliberate choice for SOUL's dark appearance (mobile-taste 6.2). */
export const darkColors: ColorTokens = {
  background: grey[1000],
  surface: grey[900],
  surfaceSubtle: grey[900],
  surfacePressed: grey[850],
  textPrimary: grey[50],
  textSecondary: grey[300],
  textTertiary: grey[400],
  textDisabled: grey[600],
  inverseSurface: grey[0],
  inverseText: grey[950],
  divider: grey[850],
  border: grey[800],
  borderStrong: grey[50],
  skeleton: grey[900],
  skeletonHighlight: grey[850],
  scrim: 'rgba(0, 0, 0, 0.64)',
  photoScrim: 'rgba(0, 0, 0, 0.42)',
  photoGradient: 'linear-gradient(180deg, rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 0.72) 100%)',
  onPhoto: grey[0],
  accent: romance.rose,
  onAccent: grey[950],
  moment: grey[1000],
  onMoment: grey[0],
  onMomentSecondary: grey[300],
  accentOnMoment: romance.rose,
  paper: grey[0],
};

export type ColorToken = keyof ColorTokens;
