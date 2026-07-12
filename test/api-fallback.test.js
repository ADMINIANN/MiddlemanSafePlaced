const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');

function waitForServer(child, signalText) {
  return new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => {
      reject(new Error(`Server did not start. Output: ${output}`));
    }, 10000);

    child.stdout.on('data', (chunk) => {
      output += chunk.toString();
      if (output.includes(signalText)) {
        clearTimeout(timer);
        resolve();
      }
    });

    child.stderr.on('data', (chunk) => {
      output += chunk.toString();
    });

    child.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`Server exited early with code ${code}. Output: ${output}`));
    });
  });
}

test('unknown API route returns JSON error instead of HTML', async () => {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PORT: '3101' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  try {
    await waitForServer(child, 'running at http://localhost:3101');

    const response = await fetch('http://127.0.0.1:3101/api/not-a-real-route');
    const contentType = response.headers.get('content-type') || '';
    const bodyText = await response.text();

    assert.equal(response.status, 404);
    assert.match(contentType, /application\/json/);
    assert.match(bodyText, /"success"\s*:\s*false/);
    assert.match(bodyText, /"message"/);
  } finally {
    child.kill('SIGTERM');
  }
});
