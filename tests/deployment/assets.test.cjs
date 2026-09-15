const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn, execFile } = require('node:child_process');
const { promisify } = require('node:util');
const exec = promisify(execFile);
const root = path.resolve(__dirname, '../..');
const cli = path.join(root, 'node_modules/wrangler/wrangler-dist/cli.js');
const publicFiles = ['index.html', 'app.js', 'styles.css', 'favicon.png'];

test('Workers deployment publishes only website assets', { timeout: 60000 }, async t => {
  // Isolate Wrangler's generated state and seed files that must never be public.
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'toolbox-assets-'));
  let child, exited;
  t.after(async () => {
    if (child) {
      if (child.exitCode === null) child.kill('SIGTERM');
      const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
      await exited;
      clearTimeout(timer);
    }
    await fs.rm(dir, { recursive: true, force: true });
  });
  for (const file of [...publicFiles, '.assetsignore', 'wrangler.jsonc', 'package.json', 'package-lock.json', 'README.md']) {
    await fs.copyFile(path.join(root, file), path.join(dir, file));
  }
  const excluded = ['node_modules/workerd/bin/workerd', 'tests/private.txt', '.git/config', '.env', 'test-results/private.txt'];
  for (const file of excluded) {
    await fs.mkdir(path.dirname(path.join(dir, file)), { recursive: true });
    await fs.writeFile(path.join(dir, file), 'not a website asset');
  }
  await fs.truncate(path.join(dir, excluded[0]), 26 * 1024 * 1024);
  const options = { cwd: dir, env: { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: 'true' }, timeout: 20000, maxBuffer: 1024 * 1024 };
  const dryRun = () => exec(process.execPath, [cli, 'deploy', '--dry-run'], options);
  // Prove the same preflight rejects an unfiltered oversized dependency.
  const ignore = await fs.readFile(path.join(dir, '.assetsignore'));
  await fs.unlink(path.join(dir, '.assetsignore'));
  await assert.rejects(dryRun(), error => /Asset too large/.test(error.stdout + error.stderr));
  await fs.writeFile(path.join(dir, '.assetsignore'), ignore);
  await dryRun();

  child = spawn(process.execPath, [cli, 'dev', '--local', '--ip', '127.0.0.1', '--port', '0', '--inspector-port', '0'], { cwd: dir, env: options.env, stdio: ['ignore', 'pipe', 'pipe'] });
  exited = new Promise(resolve => child.once('close', resolve));
  let output = '';
  const address = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Wrangler startup timed out: ' + output)), 20000);
    const read = chunk => {
      output += chunk.toString();
      const match = output.match(/Ready on (http:\/\/127\.0\.0\.1:\d+)/);
      if (match) { clearTimeout(timer); resolve(match[1]); }
    };
    child.stdout.on('data', read); child.stderr.on('data', read);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => { clearTimeout(timer); reject(new Error('Wrangler exited ' + code + ': ' + output)); });
  });
  for (const file of publicFiles) {
    const response = await fetch(address + (file === 'index.html' ? '/' : '/' + file));
    assert.equal(response.status, 200, file);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), await fs.readFile(path.join(root, file)), file);
  }
  for (const file of [...excluded, 'package.json', 'package-lock.json', 'README.md', 'wrangler.jsonc', '.assetsignore']) {
    const response = await fetch(address + '/' + file);
    assert.equal(response.status, 404, file);
    await response.arrayBuffer();
  }
});
