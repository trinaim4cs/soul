import { Asset } from 'expo-asset';
import { useEffect, useState } from 'react';

import { fontFamily } from './typography';
import { iconFontFamily } from './icons';

type Face = { family: string; weight: string; style: 'normal' | 'italic'; source: number };

/**
 * The same families and weights the Android build embeds (app.config.ts). Registering each
 * file with its weight and style descriptors keeps `fontWeight` behaving as it does on
 * Android. (expo-font's web loader registers one file per family name, without weights.)
 */
const FACES: Face[] = [
  {
    family: fontFamily.body,
    weight: '400',
    style: 'normal',
    source: require('../../assets/fonts/PlusJakartaSans-Regular.ttf'),
  },
  {
    family: fontFamily.body,
    weight: '500',
    style: 'normal',
    source: require('../../assets/fonts/PlusJakartaSans-Medium.ttf'),
  },
  {
    family: fontFamily.body,
    weight: '600',
    style: 'normal',
    source: require('../../assets/fonts/PlusJakartaSans-SemiBold.ttf'),
  },
  {
    family: fontFamily.display,
    weight: '400',
    style: 'normal',
    source: require('../../assets/fonts/InstrumentSerif-Regular.ttf'),
  },
  {
    family: fontFamily.display,
    weight: '400',
    style: 'italic',
    source: require('../../assets/fonts/InstrumentSerif-Italic.ttf'),
  },
  {
    family: iconFontFamily,
    weight: '300',
    style: 'normal',
    source: require('../../assets/fonts/SoulIcons-Light.ttf'),
  },
  {
    family: iconFontFamily,
    weight: '400',
    style: 'normal',
    source: require('../../assets/fonts/SoulIcons-Regular.ttf'),
  },
];

/** Render anyway after this long (slow network): system fonts beat a blank screen. */
const TIMEOUT_MS = 3000;

let loading: Promise<void> | null = null;

function loadFonts(): Promise<void> {
  loading ??= Promise.all(
    FACES.map(async ({ family, weight, style, source }) => {
      const face = new FontFace(family, `url(${JSON.stringify(Asset.fromModule(source).uri)})`, {
        weight,
        style,
        display: 'block',
      });
      document.fonts.add(await face.load());
    }),
  ).then(() => undefined);
  return loading;
}

/** Web: true once the brand and icon fonts are registered (or the timeout passes). */
export function useFontsReady(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    const done = () => {
      if (active) setReady(true);
    };
    const timer = setTimeout(done, TIMEOUT_MS);
    loadFonts()
      .catch(() => undefined)
      .finally(() => {
        clearTimeout(timer);
        done();
      });
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, []);
  return ready;
}
