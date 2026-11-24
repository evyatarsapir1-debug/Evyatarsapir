const { chromium } = require('playwright'); const fs = require('fs');
const OUT = '/tmp/claude-0/-home-user-Evyatarsapir/2b495504-d66a-516a-8140-113d77293197/scratchpad/rbxout';
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await (await b.newContext()).newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text().slice(0, 200)); });
  await p.goto('http://localhost:8090/poc/convert.html'); await p.waitForFunction(() => window.ready, null, { timeout: 60000 });
  const names = fs.readdirSync('/tmp/claude-0/-home-user-Evyatarsapir/2b495504-d66a-516a-8140-113d77293197/scratchpad/rbx/av').filter((n) => !process.argv[2] || process.argv[2].split(',').includes(n));
  for (const n of names) {
    const r = await p.evaluate((n) => window.convertAvatar(n), n);
    fs.writeFileSync(`${OUT}/av/${n}.glb`, Buffer.from(r.b64, 'base64'));
    console.log(n, (Buffer.from(r.b64, 'base64').length / 1024 | 0) + 'KB', 'h', r.h.toFixed(1), 'tris', r.tris, JSON.stringify(r.info.map((i) => i.key || i.mat)), r.bones.slice(0, 3).join('|'));
  }
  if (!process.argv[2]) {
    const anims = fs.readdirSync('/tmp/claude-0/-home-user-Evyatarsapir/2b495504-d66a-516a-8140-113d77293197/scratchpad/rbx/anim').map((f) => f.replace('.fbx', ''));
    const r = await p.evaluate((a) => window.convertAnims(a), anims);
    fs.writeFileSync(`${OUT}/anims.glb`, Buffer.from(r.b64, 'base64'));
    console.log('anims', (Buffer.from(r.b64, 'base64').length / 1024 | 0) + 'KB', JSON.stringify(r.clips));
  }
  console.log([...new Set(errs)].slice(0, 8).join('\n') || 'no errors'); await b.close();
})();
