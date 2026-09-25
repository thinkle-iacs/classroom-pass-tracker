// Public Firebase web configuration for iacs-pass-tracker. Not a secret: access
// is enforced by Auth, Firestore rules, and callable Functions.
export const firebaseConfig = {
  projectId: 'iacs-pass-tracker',
  appId: '1:603770513882:web:c679f431d766b42e4338e3',
  apiKey: 'AIzaSyD6mZZDgjBz8wumM9G5Z5HAmAADyVGGmTc',
  authDomain: 'iacs-pass-tracker.firebaseapp.com',
  messagingSenderId: '603770513882',
};

export const EMULATOR_PROJECT_ID = 'demo-pass-tracker';
export const EMULATOR_PORTS = { auth: 9119, functions: 5011, firestore: 8181 } as const;
