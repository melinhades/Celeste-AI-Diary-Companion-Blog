// ================================================================
// ===== Celeste 头发系统（逐行对齐反编译 Celeste.PlayerHair / PlayerSprite）=====
// 用法：
//   const tex = await CelesteHair.load('Atlases/Gameplay/characters/player', CelesteHair.MADELINE);
//   const hair = new CelesteHair.Hair(tex);            // 默认 4 节
//   hair.reset(feetX, feetY, 1);                        // 初始化（原作 Start）
//   每帧：hair.update(feetX, feetY, facing, offX, offY, dt);
//        hair.draw(ctx, toScreen, zoom, bangIdx);      // toScreen: 游戏单位→屏幕坐标
// 说明：所有模拟都在"游戏单位"空间进行（原作 1 单位 = 1 游戏像素），
//       draw 时经 toScreen/zoom 映射到屏幕，缩放不改手感。
// ================================================================
(function () {
    // 原作 Player.cs 发色常量
    const MADELINE = '#AC3232';   // NormalHairColor 红
    const BADELINE = '#9B3FB5';   // BadelineOldsite.HairColor 紫
    const USED_HAIR = '#44B7FF';  // UsedHairColor（dashes=0 时蓝）
    const FLASH_HAIR = '#FFFFFF'; // FlashHairColor（lastDashes != Dashes 时闪白 0.12s）
    const TWO_DASHES_HAIR = '#FF6DEF'; // TwoDashesHairColor（2 格冲刺时粉）
    const FLY_POWER_HAIR = '#F2EB6D'; // FlyPowerHairColor（羽毛 / star-fly 专用，与冲刺无关）
    // 顺序必须与 load() 里 baseColors 一致
    const HAIR_COLORS = { normal: 0, used: 1, flash: 2, two: 3, fly: 4 };

    function loadImage(src) {
        return new Promise(res => {
            const i = new Image();
            i.onload = () => res(i);
            i.onerror = () => res(null);
            i.src = src;
        });
    }

    // 原作贴图是白色 × 绘制时颜色通道（SpriteBatch tint=multiply），这里离线染色
    function tint(img, color) {
        if (!img) return null;
        const c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        const g = c.getContext('2d');
        g.drawImage(img, 0, 0);
        g.globalCompositeOperation = 'multiply';
        g.fillStyle = color;
        g.fillRect(0, 0, c.width, c.height);
        g.globalCompositeOperation = 'destination-in';
        g.drawImage(img, 0, 0);
        return c;
    }

    // 加载 hair00 + bangs00~02，并预生成 5 套发色版 + 黑色描边版
    async function load(base, color) {
        const [hair, b0, b1, b2] = await Promise.all([
            loadImage(base + '/hair00.png'),
            loadImage(base + '/bangs00.png'),
            loadImage(base + '/bangs01.png'),
            loadImage(base + '/bangs02.png')
        ]);
        const bangs = [b0, b1, b2].filter(Boolean);
        // 顺序：normal / used / flash / two / fly（必须与 HAIR_COLORS 一致）
        const baseColors = [color || MADELINE, USED_HAIR, FLASH_HAIR, TWO_DASHES_HAIR, FLY_POWER_HAIR];
        function tintSet(c) {
            return {
                hair: tint(hair, c),
                bangs: bangs.map(b => tint(b, c)),
                hairOutline: tint(hair, '#000000'),
                bangsOutline: bangs.map(b => tint(b, '#000000'))
            };
        }
        return baseColors.map(tintSet);
    }

    class Hair {
        constructor(tex, count) {
            // tex 可以是单套对象（向后兼容）或多套数组（见 HAIR_COLORS）
            this.allTex = Array.isArray(tex) ? tex : [tex, tex, tex, tex, tex];
            this.colorIdx = 0;                      // 0=normal 1=used 2=flash 3=two 4=fly
            this.tex = this.allTex[0];
            this.count = count || 4;          // 原作默认 4 节
            this.nodes = [];                  // 第 0 节=刘海锚点，其余=发团
            this.wave = 0;                    // 原作私有 wave 时钟
            this.border = '#000000';
            this.facing = 1;
            // ===== 原作 PlayerHair 可调参数（风场会改写它们）=====
            this.stepPerSegment = { x: 0, y: 2 };  // 每节默认下垂 2px
            this.stepInFacing = 0.5;               // 逆朝向拖拽（第一节 ×2）
            this.stepApproach = 64;                // 追赶速度基准
            this.stepYSine = 0;                    // 每节正弦摆幅（风中为 1）
            this.rigid = false;                    // 原作 SimulateMotion=false（金羽毛飞行）：只剩钳制
        }

        // 原作 PlayerHair.LoadedHairColor 切换（mode: 'normal'|'used'|'flash'|'two'|'fly'|数字）
        setColor(mode) {
            const idx = typeof mode === 'number'
                ? mode
                : (HAIR_COLORS[mode] === undefined ? 0 : HAIR_COLORS[mode]);
            if (idx === this.colorIdx) return;
            this.colorIdx = idx;
            this.tex = this.allTex[idx] || this.allTex[0];
        }

        // 原作 Start()：全节点塞到身后下方 200px，获得"甩回来"的入场
        reset(x, y, facing) {
            this.facing = facing || 1;
            this.nodes = [];
            for (let i = 0; i < this.count; i++)
                this.nodes.push({ x: x - this.facing * 200, y: y + 200 });
        }

        // 原作 AfterUpdate()：feetX/feetY = 角色脚底中心（精灵 RenderPosition）
        // offX/offY = 当前帧 hair 元数据（x 会乘朝向）
        update(feetX, feetY, facing, offX, offY, dt, scaleY) {
            scaleY = scaleY === undefined ? 1 : scaleY;
            this.facing = facing;
            this.wave += dt * 4;
            if (!this.nodes.length) this.reset(feetX, feetY, facing);
            // 锚点：RenderPosition + (0, -9*Scale.Y) + HairOffset*(Facing, 1)
            const n0 = this.nodes[0];
            n0.x = feetX + offX * facing;
            n0.y = feetY - 9 * scaleY + offY;
            for (let i = 1; i < this.nodes.length; i++) {
                const p = this.nodes[i - 1], n = this.nodes[i];
                if (this.rigid) {
                    // 刚性模式（原作 SimulateMotion=false）：不做追赶，仅保持 ≤3px 链式约束
                    let rx = n.x - p.x, ry = n.y - p.y;
                    const rd = Math.hypot(rx, ry);
                    if (rd > 3) { n.x = p.x + rx / rd * 3; n.y = p.y + ry / rd * 3; }
                    continue;
                }
                // 目标点 = 上一节 + 逆朝向拖拽 + 正弦摆动（第 i 节相位 wave+(i-1)*0.8）+ 每节偏移
                const tx = p.x - facing * this.stepInFacing * (i === 1 ? 2 : 1);
                const ty = p.y + Math.sin(this.wave + (i - 1) * 0.8) * this.stepYSine;
                const gx = tx + this.stepPerSegment.x;
                const gy = ty + this.stepPerSegment.y;
                // Approach：越靠后的节越慢（惯性拖尾）
                const sp = (1 - i / this.count * 0.5) * this.stepApproach * dt;
                let dx = gx - n.x, dy = gy - n.y;
                const d = Math.hypot(dx, dy);
                if (d > sp && d > 0) { dx = dx / d * sp; dy = dy / d * sp; }
                n.x += dx; n.y += dy;
                // 硬约束：相邻节距离 ≤ 3px（原作 PublicUpdate 钳制）
                let cx = n.x - p.x, cy = n.y - p.y;
                const cd = Math.hypot(cx, cy);
                if (cd > 3) { n.x = p.x + cx / cd * 3; n.y = p.y + cy / cd * 3; }
            }
        }

        // 原作 GetHairScale：刘海恒 1（只随朝向翻转），发团逐节缩小
        nodeScale(i) {
            return i === 0 ? 1 : 0.25 + (1 - i / this.count) * 0.75;
        }

        // 原作 Render()：先 4 向 ±1px 黑色描边，再 从发尾倒序画到刘海
        // toScreen(node) -> {x, y}；zoom = 屏幕像素/游戏单位
        draw(ctx, toScreen, zoom, bangIdx, spriteScaleX) {
            const T = this.tex;
            if (!T || !T.hair || !this.nodes.length) return;
            // 原作 GetHairScale：x 缩放要乘 |Sprite.Scale.X|（squash 时头发同步变宽）
            this.squashX = Math.abs(spriteScaleX === undefined ? 1 : spriteScaleX);
            const o = Math.max(1, zoom);  // 原作描边偏移 1 游戏像素
            // —— 描边：上下左右 ±1 ——
            for (let i = 0; i < this.nodes.length; i++) {
                const img = i === 0 ? T.bangsOutline[bangIdx || 0] : T.hairOutline;
                if (!img) continue;
                this.drawNode(ctx, img, i, toScreen, zoom, o);
            }
            // —— 本体：倒序（发尾压前节） ——
            for (let i = this.nodes.length - 1; i >= 0; i--) {
                const img = i === 0 ? T.bangs[bangIdx || 0] : T.hair;
                if (!img) continue;
                this.drawNode(ctx, img, i, toScreen, zoom, 0);
            }
        }

        drawNode(ctx, img, i, toScreen, zoom, outlineOff) {
            const s = toScreen(this.nodes[i]);
            const sc = this.nodeScale(i);
            const w = img.width * sc * (this.squashX || 1) * zoom, h = img.height * sc * zoom;
            const offs = outlineOff ? [[o2(), 0], [-o2(), 0], [0, o2()], [0, -o2()]] : [[0, 0]];
            function o2() { return outlineOff; }
            for (const [ox, oy] of offs) {
                ctx.save();
                ctx.translate(Math.round(s.x + ox), Math.round(s.y + oy));
                if (i === 0) ctx.scale(this.facing, 1);   // 刘海随朝向翻转
                ctx.drawImage(img, -w / 2, -h / 2, w, h);
                ctx.restore();
            }
        }
    }

    // 原作强风参数预设（Player.cs ForceStrongWindHair 分支）
    function applyWindX(hair, windX, timer) {
        hair.stepPerSegment = { x: windX * 5, y: Math.sin(timer) };
        hair.stepInFacing = 0;
        hair.stepApproach = 128;
    }
    function resetWind(hair) {
        hair.stepPerSegment = { x: 0, y: 2 };
        hair.stepInFacing = 0.5;
        hair.stepApproach = 64;
        hair.stepYSine = 0;
    }

    window.CelesteHair = { Hair, load, applyWindX, resetWind, MADELINE, BADELINE, USED_HAIR, FLASH_HAIR, TWO_DASHES_HAIR, FLY_POWER_HAIR, HAIR_COLORS };
})();
