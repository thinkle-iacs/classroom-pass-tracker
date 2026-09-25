// The Functions emulator wants values for declared secrets. Fixture mode never uses them.
import { copyFileSync, existsSync } from 'node:fs';
if (!existsSync('functions/.secret.local')) copyFileSync('functions/.secret.local.example', 'functions/.secret.local');
