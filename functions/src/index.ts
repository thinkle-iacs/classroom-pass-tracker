// Callable Function entry point. See docs/ARCHITECTURE.md for the endpoint list
// (contracts live in shared/src/api.ts). Implementation is still to do.
import { initializeApp } from 'firebase-admin/app';
import { setGlobalOptions } from 'firebase-functions/v2';

initializeApp();
setGlobalOptions({ region: 'us-central1', maxInstances: 10, timeoutSeconds: 60, memory: '256MiB' });

export {};
