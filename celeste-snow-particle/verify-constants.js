/**
 * 数值断言：校验前端实现 (snow-effect.js) 的常量与行为，与 IL 反编译结果一致。
 * 运行：node verify-constants.js
 *
 * 断言分两层：
 *   A. 常量值 == IL 中的字面量（逐条对应 README「常量速查表」）
 *   B. 用确定性随机源跑 particleReset / Reset / Update，校验取值范围与位移方向
 */
'use strict';
const assert = require('assert');
const S = require('./snow-effect.js');

let pass = 0;
function ok(name, fn) { fn(); pass++; console.log('  ok  ' + name); }

/** 确定性 RNG（线性同余），让断言可复现 */
function makeRng(seed) {
  let s = seed >>> 0;
  return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

console.log('A. 常量对齐 IL');
// HiresSnow.orig_ctor  newarr Particle[50]
ok('PARTICLE_COUNT == 50', () => assert.strictEqual(S.IL.PARTICLE_COUNT, 50));
// HiresSnow.orig_ctor  GetSubtexture(1,1,254,254,null)
ok('SNOW_SUBRECT == 1,1,254,254', () =>
  assert.deepStrictEqual(S.IL.SNOW_SUBRECT, { x: 1, y: 1, w: 254, h: 254 }));
// HiresSnow.Render  ldc.i4 1920 / ldc.i4 1080
ok('OVERLAY_RECT == 1920x1080', () =>
  assert.deepStrictEqual(S.IL.OVERLAY_RECT, { w: 1920, h: 1080 }));
// HiresSnow.Render  timer*32f , timer*20f
ok('OVERLAY_SCROLL == 32,20', () =>
  assert.deepStrictEqual(S.IL.OVERLAY_SCROLL, { x: 32, y: 20 }));
// Particle.Reset  Calc.Map(n,0f,1f,0.05f,0.8f)
ok('SCALE_MAP == 0..1 -> 0.05..0.8', () =>
  assert.deepStrictEqual(S.IL.SCALE_MAP, { inMin: 0, inMax: 1, outMin: 0.05, outMax: 0.8 }));
// Particle.Reset  Calc.Range(2500,5000)
ok('SPEED_RANGE == 2500..5000', () =>
  assert.deepStrictEqual(S.IL.SPEED_RANGE, { min: 2500, max: 5000 }));
// Particle.Reset  Lerp(White,Transparent, n*0.8f)
ok('COLOR_LERP == 0.8', () => assert.strictEqual(S.IL.COLOR_LERP, 0.8));
// HiresSnow.Update  ldc.r4 100
ok('SIN_AMPLITUDE == 100', () => assert.strictEqual(S.IL.SIN_AMPLITUDE, 100));
// HiresSnow.Update  ±128
ok('BOUNDARY == 128', () => assert.strictEqual(S.IL.BOUNDARY, 128));
// HiresSnow.Render  Clamp(len,0f,20f)
ok('CLAMP_DIR_MAX == 20', () => assert.strictEqual(S.IL.CLAMP_DIR_MAX, 20));
// GameLoader..ctor  ldc.r4 0.45 -> newobj HiresSnow(0.45f)
ok('DEFAULT_OVERLAY_ALPHA == 0.45f', () =>
  assert.strictEqual(Math.fround(S.IL.DEFAULT_OVERLAY_ALPHA), 0.44999998807907104));
// IL  ldc.r4 6.2831854820251465
ok('TAU == 6.2831855f', () => assert.strictEqual(S.TAU, 6.2831854820251465));

console.log('\nB. 行为对齐 IL');

// map / clamp 与 Monocle.Calc 语义
ok('Calc.Map / Calc.Clamp', () => {
  assert.strictEqual(S.map(0.5, 0, 1, 0, 10), 5);
  assert.strictEqual(S.clamp(-3, 0, 20), 0);
  assert.strictEqual(S.clamp(99, 0, 20), 20);
});

// particleReset：Scale/Speed/Color/出生位置 的取值范围
ok('particleReset 取值范围与出生边', () => {
  const rng = makeRng(12345);
  const W = 1920, H = 1080, B = S.IL.BOUNDARY;
  for (let i = 0; i < 20000; i++) {
    const p = { Scale: 0, Position: { x: 0, y: 0 }, Speed: 0, Sin: 0, Rotation: 0, Color: {} };
    S.particleReset(p, { x: -1, y: 0 }, W, H, rng);
    // Scale = Map(n^4,0,1,0.05,0.8) => [0.05, 0.8]
    assert.ok(p.Scale >= 0.05 - 1e-9 && p.Scale <= 0.8 + 1e-9, 'Scale 越界 ' + p.Scale);
    // Speed = Scale * Range(2500,5000)
    assert.ok(p.Speed >= p.Scale * 2500 - 1e-6 && p.Speed <= p.Scale * 5000 + 1e-6, 'Speed 越界');
    // Color = Lerp(White,Transparent, n*0.8f) => alpha in [0.2,1]
    assert.ok(p.Color.a >= 255 * 0.2 - 1e-6 && p.Color.a <= 255 + 1e-6, 'Alpha 越界');
    assert.strictEqual(p.Color.r, 255);
    // Direction.x < 0 => 在右边屏幕外 128px 出生，Y 为 [0,H)
    assert.strictEqual(p.Position.x, W + B, 'X 出生点错'); // 注：随后被 Reset() 覆盖
    assert.ok(p.Position.y >= 0 && p.Position.y < H);
    assert.ok(p.Sin >= 0 && p.Sin < S.TAU);
    assert.ok(p.Rotation >= 0 && p.Rotation < S.TAU);
  }
});

// n^4 分布：Scale 大量集中在低位（验证是 4 次方而非线性）
ok('n^4 分布（Scale 中位数偏低）', () => {
  const rng = makeRng(7);
  const scales = [];
  for (let i = 0; i < 20000; i++) {
    const p = { Scale: 0, Position: {}, Speed: 0, Sin: 0, Rotation: 0, Color: {} };
    S.particleReset(p, { x: -1, y: 0 }, 1920, 1080, rng);
    scales.push(p.Scale);
  }
  scales.sort((a, b) => a - b);
  const median = scales[scales.length >> 1];
  // uniform n 的 n^4 中位数 = 0.5^4 = 0.0625 → Scale≈0.05+0.0625*0.75≈0.097
  assert.ok(median < 0.15, '中位数过高，可能不是 n^4: ' + median);
});

// Reset()：整屏均匀覆盖 X/Y（IL @44/@82 覆盖边外出生点）
ok('Reset() 用整屏均匀值覆盖出生点', () => {
  const rng = makeRng(999);
  const snow = new S.HiresSnow({
    width: 1920, height: 1080, random: rng,
    snowImage: { width: 256, height: 256 },
    overlayImage: { width: 1920, height: 1080 }
  });
  assert.strictEqual(snow.particles.length, 50);
  assert.strictEqual(snow.Direction.x, -1);
  assert.strictEqual(snow.Direction.y, 0);
  assert.strictEqual(snow.Alpha, 1);
  assert.strictEqual(snow.ParticleAlpha, 1);
  assert.strictEqual(Math.fround(snow.overlayAlpha), 0.44999998807907104);
  assert.strictEqual(snow.timer, 0);
  for (const p of snow.particles) {
    assert.ok(p.Position.x >= 0 && p.Position.x < 1920, 'X 未均匀覆盖');
    assert.ok(p.Position.y >= 0 && p.Position.y < 1080, 'Y 未均匀覆盖');
  }
});

// Update()：Position += Direction*Speed*dt（x 减小）；Sin/timer 累加；出界重生
ok('Update() 位移方向 / 累加 / 出界重生', () => {
  const snow = new S.HiresSnow({
    width: 1920, height: 1080, random: makeRng(2024),
    snowImage: { width: 256, height: 256 },
    overlayImage: { width: 1920, height: 1080 }
  });
  const dt = 1 / 60;
  const before = snow.particles.map(p => ({ x: p.Position.x, y: p.Position.y, sin: p.Sin, rot: p.Rotation, scale: p.Scale, speed: p.Speed }));

  snow.Update(dt);

  for (let i = 0; i < snow.particles.length; i++) {
    const p = snow.particles[i], b = before[i];
    if (p.Position.x === b.x) continue;             // 可能触发了重生
    // 水平推进量 == -Speed*dt（Direction.x=-1），不含 Y 抖动
    const dx = p.Position.x - b.x;
    assert.ok(Math.abs(dx - (-b.speed * dt)) < 1e-6, 'X 位移不等于 -Speed*dt: ' + dx);
    // Sin 累加
    assert.ok(Math.abs(p.Sin - (b.sin + dt)) < 1e-9 || p.Sin < b.sin, 'Sin 未累加');
  }
  assert.ok(Math.abs(snow.timer - dt) < 1e-12, 'timer 未累加');

  // Y 抖动：|Δy| <= |Speed*Direction.y*dt| + 100*dt = 100*dt（Direction.y=0）
  for (let i = 0; i < snow.particles.length; i++) {
    const dy = Math.abs(snow.particles[i].Position.y - before[i].y);
    assert.ok(dy <= 100 * dt + 1e-6, 'Y 抖动超过 sin 振幅: ' + dy);
  }
});

// 出界重生：把某粒子推到屏幕外，Update 后应回到界内视野
ok('越界粒子被 Reset 重生', () => {
  const snow = new S.HiresSnow({
    width: 1920, height: 1080, random: makeRng(31337),
    snowImage: { width: 256, height: 256 },
    overlayImage: { width: 1920, height: 1080 }
  });
  snow.particles[0].Position.x = -129;             // < -128
  snow.Update(1 / 60);
  const p = snow.particles[0];
  assert.ok(p.Position.x >= -128 && p.Position.x <= 1920 + 128, '未重生: ' + p.Position.x);
});

console.log('\n全部通过：' + pass + ' 组断言');