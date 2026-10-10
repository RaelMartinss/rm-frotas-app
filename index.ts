import { registerRootComponent } from 'expo';

import App from './App';
// Importa o serviço de localização no ponto de entrada para registrar a tarefa de background no TaskManager
import './src/services/location.service';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
