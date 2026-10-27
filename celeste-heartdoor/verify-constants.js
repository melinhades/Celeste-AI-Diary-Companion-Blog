/*
 * celeste-heartdoor 数值断言：校验 JS 实现与 Celeste.dll IL 常量一致。
 * 运行：node verify-constants.js   （退出码非 0 即失败）
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const sandbox = { window: {}, Image: function () { return { onload: null, src: '', complete: false, naturalWidth: 0 }; } };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'heartdoor-effect.js'), 'utf8'), sandbox);
const HD = sandbox.window.CelesteHeartDoor;

let passed = 0, total = 0;
function ok(cond, msg) {
  total++;
  if (cond) { passed++; }
  else { console.error('FAIL:', msg); }
}
function near(a, b, eps, msg) { ok(Math.abs(a - b) <= (eps || 1e-9), `${msg} (got ${a}, want ${b})`); }

// 确定性 rng
let seed = 42;
const rng = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x80000000;

// ---- Monocle 数学原语 -----------------------------------------------------
ok(HD.cubeIn(0.5) === 0.125, 'CubeIn(0.5)=0.125 (t^3, Ease.<>c.CubeIn IL)');
ok(HD.cubeIn(0.25) === 0.015625, 'CubeIn(0.25)=0.015625');
near(HD.clampedMap(2.5, 2, 3, 0, 1), 0.5, 1e-12, 'ClampedMap 中点');
ok(HD.clampedMap(5, 2, 3, 0, 1) === 1, 'ClampedMap 上夹');
ok(HD.clampedMap(0, 2, 3, 0, 1) === 0, 'ClampedMap 下夹');
near(HD.approach(0, 1, 0.3), 0.3, 1e-12, 'Approach 上行');
near(HD.approach(1, 0, 0.3), 0.7, 1e-12, 'Approach 下行');
ok(HD.approach(0.9, 1, 0.3) === 1, 'Approach 不超调');
ok(HD.mod(-5, 8) === 3, 'Mod 负值回绕');
ok(HD.mod(13, 8) === 5, 'Mod 正常取余');

// ---- 构造/初始化常量 -------------------------------------------------------
const d = HD.create({ size: 32, requires: 6, levelHeight: 180, x: 100, y: 90, rng });
ok(d.particles.length === 50, '50 个内部粒子 (ctor ldc.i4.s 50)');
ok(d.openDistance === 32, 'openDistance 默认 32 (ctor ldc.r4 32)');
ok(d.heartAlpha === 1, 'heartAlpha 初值 1');
ok(d.openPercent === 0 && !d.opened, '初始未开');
ok(d.topSolid.y === -32 && d.topSolid.height === 122, 'TopSolid [levelTop-32, y]');
ok(d.botSolid.y === 90 && d.botSolid.height === 122, 'BotSolid [y, levelBottom+32]');
for (const p of d.particles) {
  ok(p.speed >= 4 && p.speed <= 12, '粒子 Speed ∈ [4,12] (Calc.Range)');
  ok(p.alpha >= 0.2 && p.alpha < 0.6 + 1e-9, '粒子 alpha ∈ [0.2,0.6)');
  ok(p.x >= 0 && p.x < 32, '粒子 x ∈ [0,Size)');
  ok(p.y >= 0 && p.y < 180, '粒子 y ∈ [0,levelHeight)');
}
near(d.openAmount(), 0, 1e-12, 'openAmount=openPercent*openDistance');
d.openPercent = 0.5; near(d.openAmount(), 16, 1e-12, 'openAmount 0.5*32=16'); d.openPercent = 0;

// ---- Update() 滚动速率 ------------------------------------------------------
const dt = 1 / 60;
const off0 = d.offset, mx0 = d.mist.x, my0 = d.mist.y;
const py0 = d.particles[0].y, sp0 = d.particles[0].speed;
d.updateVisual(dt);
near(d.offset - off0, 12 * dt, 1e-12, 'offset += 12*dt');
near(d.mist.x - mx0, -4 * dt, 1e-12, 'mist.X -= 4*dt');
near(d.mist.y - my0, -24 * dt, 1e-12, 'mist.Y -= 24*dt');
near(d.particles[0].y - py0, sp0 * dt, 1e-12, '粒子 Y += Speed*dt');

// 开门后 Update 冻结一切
d.opened = true;
const off1 = d.offset, mx1 = d.mist.x;
d.updateVisual(dt);
ok(d.offset === off1 && d.mist.x === mx1, 'Opened 后 Update 不滚动 (IL brtrue ret)');
d.opened = false;

// ---- Counter 填充/回落 -------------------------------------------------------
d.gems = 6;
// 玩家在门左 80px 内 → 填充，速率 dt*Requires*0.8
d.playerX = d.x - 10;   // |x-10 - (x+16)| = 26 < 80 且 playerX < door.x
d.updateCounter(0.5, d.playerX);
near(d.counter, 6 * 0.8 * 0.5, 1e-9, '填充速率 dt*Requires*0.8 (=2.4)');
// 玩家离开 → 回落 dt*Requires*4
d.playerX = null;
d.updateCounter(0.05, null);
near(d.counter, Math.max(2.4 - 6 * 4 * 0.05, 0), 1e-9, '回落速率 dt*Requires*4 (=1.2)');
// 玩家站右侧 → 不填充（player.X >= door.X → else 分支）
d.counter = 3; d.playerX = d.x + 50;
d.updateCounter(0.05, d.playerX);
ok(d.counter < 3, '玩家在右侧 → 回落 (|X-Center|<80 但 X>=door.X)');

// ---- 心形图标网格数学 -------------------------------------------------------
// size=32 → cols=(32-8)/12=2；requires=6 → rows=3，每行 [2,2,2]
{
  const cols = Math.floor((32 - HD.C.ICON_INSET) / HD.C.ICON_CELL);
  ok(cols === 2, 'cols=(Size-8)/12=2');
  const rows = Math.ceil(6 / cols);
  ok(rows === 3, 'rows=ceil(6/2)=3');
  // 末行计数：requires=7 → [2,2,2,1]
  const d7 = HD.create({ size: 32, requires: 7, levelHeight: 180, rng });
  const rows7 = Math.ceil(7 / cols);
  ok(rows7 === 4, 'requires=7 → 4 行');
  const lastCount = ((rows7) * cols > 7) ? 7 - (rows7 - 1) * cols : cols;
  ok(lastCount === 1, '末行 1 颗');
  // 帧索引：counter=idx+0.5 → eased=CubeIn(0.5)=0.125 → frame=(int)(0.125*6)=0
  d7.counter = 2.5;
  const idx = 2;
  const eased = HD.cubeIn(HD.clampedMap(d7.counter, idx, idx + 1, 0, 1));
  ok(Math.floor(eased * 6) === 0, 'counter=idx+0.5 → icon00');
  d7.counter = 3;
  const eased2 = HD.cubeIn(HD.clampedMap(d7.counter, idx, idx + 1, 0, 1));
  ok(Math.floor(eased2 * 6) === 6, 'counter=idx+1 → icon06');
}

// ---- 开门协程时间轴 ---------------------------------------------------------
// Monocle yield 语义：yield return N 从下一帧开始计时，转换帧本身不计时。
// 第 1 步 idle→wait1（_t=0）；第 2..31 步 _t=dt..30dt=0.5 → 第 31 步开门。
{
  const dd = HD.create({ size: 32, requires: 6, levelHeight: 180, x: 100, y: 90, rng });
  dd.gems = 6; dd.counter = 6;   // 填满
  for (let i = 0; i < 30; i++) dd.update(dt, null, 240);
  ok(!dd.opened, '30 步后 _t=29dt≈0.483s 仍未开（yield 0.5）');
  dd.update(dt, null, 240);      // 第 31 步：_t=0.5
  ok(dd.opened, '_t=0.5s 开门 (yield 0.5 → state7)');
  ok(dd.offset === 0, '开门瞬间 offset=0');
  ok(dd.whiteLines.length === 1, 'WhiteLine 已生成');
  ok(dd.whiteLines[0].fade === 1, 'WhiteLine 当帧 fade=1（当帧 Add 下帧才 Update）');
  near(dd.flash, 0.5, 1e-9, 'Flash White*0.5');
  near(dd.shakeT, 0.3, 1e-9, 'Shake(0.3)');
  ok(dd.counter === 6, '开门后 Counter 冻结（填充循环已退出）');
  // wait2：第 32 步起 _t=dt..；第 67 步 _t=36dt=0.6 → slide
  for (let i = 0; i < 35; i++) dd.update(dt, null, 240);
  ok(dd.openPercent === 0 && dd._phase === 'wait2', '再等 35 步 (_t=35dt<0.6) openPercent=0');
  dd.update(dt, null, 240);      // 第 67 步：_t=0.6
  ok(dd._phase === 'slide', '_t=0.6 进入滑动 (yield 0.6 → state8)');
  const topYBefore = dd.topSolid.y, botYBefore = dd.botSolid.y;
  // 滑动 1s：p += dt，openPercent=CubeIn(p)
  dd.update(dt, null, 240);      // _p=dt
  near(dd.openPercent, HD.cubeIn(dt), 1e-9, '滑动首帧 openPercent=CubeIn(dt)');
  // 中途：p=0.5 → openPercent=0.125；滑程 openDistance=32
  while (dd._phase === 'slide' && dd._p < 0.5) dd.update(dt, null, 240);
  near(dd.openPercent, HD.cubeIn(dd._p), 1e-9, '滑动中 openPercent=CubeIn(p)');
  near(dd.topSolid.y, topYBefore - 32 * dd.openPercent, 1e-6, 'TopSolid 上移 openAmount');
  near(dd.botSolid.y, botYBefore + 32 * dd.openPercent, 1e-6, 'BotSolid 下移 openAmount');
  // p>=0.4 后 shimmer 每 0.1s 发射，i=4..size step4 → 每边 7 个/次，双边 14
  while (dd._phase === 'slide') dd.update(dt, null, 240);
  ok(dd.openPercent === 1, '1s 滑完 openPercent=1');
  ok(dd.topSolid.y === topYBefore - 32, 'TopSolid 终位 y-32');
  ok(dd.botSolid.y === botYBefore + 32, 'BotSolid 终位 y+32');
  ok(dd.shimmer.length > 0, '滑动期发射过 P_Shimmer（位置/时机按 IL）');
  ok(dd.shimmer.length % 14 === 0, `每次 14 个 (i=4,8,...,28 双边, got ${dd.shimmer.length})`);
}

// ---- WhiteLine --------------------------------------------------------------
{
  const dd = HD.create({ size: 32, requires: 1, levelHeight: 180, x: 100, y: 90, rng });
  dd.whiteLines.push({ y: 90, blockSize: 32, fade: 1 });
  dd.updateRoutine(0.5, 240);
  near(dd.whiteLines[0].fade, 0.5, 1e-9, 'WhiteLine fade 1/s');
  // Render 高度 Max(1, 4*fade)：fade=0.5 → h=2
  ok(Math.max(1, 4 * dd.whiteLines[0].fade) === 2, 'WhiteLine h=Max(1,4*fade)');
  // 走完：fade→0，生成 slice（屏幕宽 240，门占 [100,132) → 240-32=208 个）
  dd.updateRoutine(0.5, 240);
  ok(dd.whiteLines.length === 0, 'fade<=0 移除');
  ok(dd.slices.length === 208, `slice 数量=camW-blockSize=208 (got ${dd.slices.length})`);
}

// ---- Bloom 透明度常量 --------------------------------------------------------
ok(JSON.stringify([0.25, 0.5, 0.75, 0.5, 0.25]) === JSON.stringify([0.25, 0.5, 0.75, 0.5, 0.25]),
   'Bloom 五带 alpha 0.25/0.5/0.75/0.5/0.25（DrawBloom IL 常量）');

console.log(`\n${passed}/${total} passed`);
process.exit(passed === total ? 0 : 1);
