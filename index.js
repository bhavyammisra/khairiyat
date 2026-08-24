// Custom entry point.
//
// expo-router/entry must be imported FIRST and unconditionally — it is what
// actually starts the app. The widget registration is wrapped because it is
// the least important surface in the product: if react-native-android-widget
// throws, the widget should quietly not exist, never take the app down with
// it.

import 'expo-router/entry';

try {
  const { registerWidgetTaskHandler } = require('react-native-android-widget');
  const { widgetTaskHandler } = require('./widget/handler');

  registerWidgetTaskHandler(widgetTaskHandler);
} catch (error) {
  console.warn('Widget task handler not registered:', error);
}
