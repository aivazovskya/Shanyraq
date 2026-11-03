const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

// Only starts Metro. Never changes firewall settings or exposes a public tunnel.
async function main() {
  const args = process.argv.slice(2);
  const option = (name, fallback) => {
    const index = args.indexOf(name);
    return index < 0 ? fallback : args[index + 1];
  };
  const candidates = Object.entries(os.networkInterfaces()).flatMap(([name, items]) =>
    /virtual|vethernet|wsl|docker|vmware|loopback/i.test(name) ? [] :
      items.filter(item => item.family === 'IPv4' && !item.internal && !item.address.startsWith('169.254.')).map(item => item.address)
  );
  const host = option('--host', candidates.length === 1 ? candidates[0] : undefined);
  if (!host || !/^(?:\d{1,3}\.){3}\d{1,3}$/.test(host) || host.split('.').some(part => Number(part) > 255)) {
    throw new Error(`Specify your computer's Wi-Fi IPv4 address with --host. Candidates: ${candidates.join(', ') || 'none'}`);
  }
  const port = Number(option('--api-port', '4000'));
  const metroPort = Number(option('--port', '8183'));
  if (![port, metroPort].every(value => Number.isInteger(value) && value > 0 && value < 65536)) {
    throw new Error('Ports must be integers between 1 and 65535.');
  }
  const origin = `http://${host}:${port}`;
  const response = await fetch(`${origin}/health`, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error(`API health check failed: HTTP ${response.status}`);
  console.log(`API ready: ${origin}/api/v1`);
  console.log(`Phone check: open ${origin}/health on the same Wi-Fi network.`);
  if (args.includes('--check')) return;
  const child = spawn(process.execPath, [path.resolve(__dirname, '../node_modules/expo/bin/cli'), 'start', '--lan', '--port', String(metroPort)], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, EXPO_PUBLIC_API_URL: `${origin}/api/v1`, EXPO_PUBLIC_SOCKET_URL: origin },
    stdio: 'inherit',
    windowsHide: true,
  });
  child.on('error', error => { console.error(error.message); process.exitCode = 1; });
  child.on('exit', code => { process.exitCode = code ?? 1; });
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
