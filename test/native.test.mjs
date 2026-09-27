import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { vectors } from '../tools/vectors.mjs';

const root = new URL('..', import.meta.url).pathname;
const file = join(root, 'test/vectors/streams.txt');

test('test/vectors/streams.txt is what the reference implementation produces', () => {
  assert.equal(readFileSync(file, 'utf8'), vectors(), 'run: node tools/vectors.mjs');
});

const cxx = ['c++', 'g++', 'clang++'].find(c => spawnSync(c, ['--version']).status === 0);

test('the C++ core reproduces the vectors', { skip: !cxx && 'no C++ compiler' }, () => {
  const exe = join(mkdtempSync(join(tmpdir(), 'qretina-native-')), 'test');
  execFileSync(cxx, ['-std=c++17', '-O2', '-Wall', '-Wextra', '-Werror', '-o', exe, 'native/core/qretina.cpp', 'native/core/test.cpp'], { cwd: root });
  const out = execFileSync(exe, [file], { encoding: 'utf8' });
  console.log('  ' + out.trim());
});
