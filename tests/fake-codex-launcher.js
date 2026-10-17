#!/usr/bin/env node
// Mimics the npm launcher/native-binary process tree. Stdio remains open if its child survives.
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const child=spawn(process.execPath,[fileURLToPath(new URL('./fake-codex.js',import.meta.url))],{stdio:'inherit'});
child.on('exit',code=>process.exit(code ?? 1));
