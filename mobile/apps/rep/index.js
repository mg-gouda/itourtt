import 'react-native-gesture-handler';
import { AppRegistry } from 'react-native';
import { configureApi, registerBackgroundSync } from '@itour/shared';
import { App } from './src/App';
import { name as appName } from './app.json';

// Same server + database as the web portals (no Firebase).
configureApi();
// The background sync service task must be registered outside React.
registerBackgroundSync();

AppRegistry.registerComponent(appName, () => App);
