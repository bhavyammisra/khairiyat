import { Appearance } from 'react-native';
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';

import type { ColorScheme } from '../lib/theme';
import { readSnapshot } from '../lib/widget';
import { ScanWidget } from './ScanWidget';
import { TodayWidget } from './TodayWidget';

/**
 * Runs headless, on a 30-minute timer and on widget add/update. No network,
 * no navigation — it renders the AsyncStorage snapshot the app wrote when it
 * last foregrounded.
 *
 * Widget names must match those declared in app.json, because they are baked
 * into the manifest at build time.
 */
export async function widgetTaskHandler(props: WidgetTaskHandlerProps) {
  const scheme: ColorScheme = Appearance.getColorScheme() === 'dark' ? 'dark' : 'light';
  const name = props.widgetInfo.widgetName;

  const render = async () => {
    if (name === 'Scan') {
      props.renderWidget(<ScanWidget scheme={scheme} />);
      return;
    }

    const snapshot = await readSnapshot();
    props.renderWidget(<TodayWidget snapshot={snapshot} scheme={scheme} />);
  };

  switch (props.widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED':
    case 'WIDGET_CLICK':
      await render();
      break;
    default:
      break;
  }
}
