const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Elemen UI
const scoreEl = document.getElementById('score');
const comboEl = document.getElementById('combo');
const highScoreEl = document.getElementById('highScore');
const levelEl = document.getElementById('level');
const dashStatusEl = document.getElementById('dashStatus');
const ultStatusEl = document.getElementById('ultStatus');
const hpEl = document.getElementById('hp');
const xpBar = document.getElementById('xp-bar');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayDesc = document.getElementById('overlay-desc');
const charSelectEl = document.getElementById('charSelect');
const startBtn = document.getElementById('startBtn');
const upgradeModal = document.getElementById('upgradeModal');
const pauseOverlay = document.getElementById('pauseOverlay');
const resumeBtn = document.getElementById('resumeBtn');

let highScore = Number(localStorage.getItem('nusantaraSurvivorBest')) || 0;
highScoreEl.textContent = highScore;

// Definisi 3 Karakter Khas Nusantara
const CHARACTERS = {
    ojol: {
        name: 'Bang Ojol',
        color: '#10b981',
        accent: '#facc15',
        hp: 100,
        speed: 3.8,
        fireRate: 360,
        damage: 1.2,
        critChance: 0.12,
        bulletCount: 1,
        explosive: false
    },
    silat: {
        name: 'Jawara Silat',
        color: '#ef4444',
        accent: '#facc15',
        hp: 85,
        speed: 4.5,
        fireRate: 275,
        damage: 1.05,
        critChance: 0.35,
        bulletCount: 1,
        explosive: false
    },
    hansip: {
        name: 'Pak Hansip',
        color: '#65a30d',
        accent: '#bef264',
        hp: 150,
        speed: 3.0,
        fireRate: 510,
        damage: 1.85,
        critChance: 0.1,
        bulletCount: 1,
        explosive: true
    }
};

let selectedCharKey = 'ojol';
document.querySelectorAll('.char-card').forEach((card) => {
    card.addEventListener('click', () => {
        document.querySelectorAll('.char-card').forEach((c) => c.classList.remove('selected'));
        card.classList.add('selected');
        selectedCharKey = card.dataset.char;
        playSound(520, 'sine', 0.05, 0.06);
    });
});

// Web Audio API Synthesizer
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playSound(freq, type = 'sine', duration = 0.08, vol = 0.07) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(40, audioCtx.currentTime + duration);
    gain.gain.setValueAtTime(vol, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
}

// State Game
let gameRunning = false;
let isPaused = false;
let isLevelUpOpen = false;
let score = 0;
let combo = 1;
let comboTimer = 0;
let shakeTime = 0;
let frameCount = 0;
const keys = {};

let player, bullets, enemies, coins, powerUps, particles, trails, floatingTexts, shockwaves;
let lastShotTime = 0;
let lastSpawnTime = 0;
let lastPowerUpTime = 0;
let bossSpawnedForLevel = 0;

function initGame() {
    const spec = CHARACTERS[selectedCharKey];
    player = {
        type: selectedCharKey,
        color: spec.color,
        accent: spec.accent,
        x: canvas.width / 2,
        y: canvas.height / 2,
        angle: 0,
        radius: selectedCharKey === 'hansip' ? 17 : 14,
        speed: spec.speed,
        hp: spec.hp,
        maxHp: spec.hp,
        level: 1,
        xp: 0,
        nextXp: 50,
        fireRate: spec.fireRate,
        damage: spec.damage,
        critChance: spec.critChance,
        bulletCount: spec.bulletCount,
        explosive: spec.explosive,
        magnetRange: 105,
        dashCooldown: 0,
        dashActive: 0,
        dashDirX: 0,
        dashDirY: 0,
        ultCharge: 100,
        overdriveTimer: 0,
        shieldTimer: 0
    };

    bullets = [];
    enemies = [];
    coins = [];
    powerUps = [];
    particles = [];
    trails = [];
    floatingTexts = [];
    shockwaves = [];
    score = 0;
    combo = 1;
    comboTimer = 0;
    lastShotTime = 0;
    lastSpawnTime = 0;
    lastPowerUpTime = 0;
    bossSpawnedForLevel = 0;
    isPaused = false;
    isLevelUpOpen = false;
    gameRunning = true;

    updateHUD();
    overlay.classList.add('hidden');
    upgradeModal.classList.add('hidden');
    pauseOverlay.classList.add('hidden');
    requestAnimationFrame(gameLoop);
}

function triggerDash() {
    if (!gameRunning || isPaused || isLevelUpOpen || player.dashCooldown > 0) return;

    let dx = 0, dy = 0;
    if (keys['w'] || keys['arrowup']) dy -= 1;
    if (keys['s'] || keys['arrowdown']) dy += 1;
    if (keys['a'] || keys['arrowleft']) dx -= 1;
    if (keys['d'] || keys['arrowright']) dx += 1;

    if (dx === 0 && dy === 0) {
        dx = Math.cos(player.angle);
        dy = Math.sin(player.angle);
    }
    const len = Math.hypot(dx, dy);

    player.dashDirX = dx / len;
    player.dashDirY = dy / len;
    player.dashActive = 11;
    player.dashCooldown = selectedCharKey === 'silat' ? 95 : 130;
    playSound(540, 'triangle', 0.12, 0.12);

    if (player.type === 'hansip') {
        shockwaves.push({ x: player.x, y: player.y, radius: 10, maxRadius: 85, color: '#bef264', alpha: 1 });
    }
}

function triggerUltimate() {
    if (!gameRunning || isPaused || isLevelUpOpen || player.ultCharge < 100) return;
    player.ultCharge = 0;
    shakeTime = 12;
    playSound(210, 'sawtooth', 0.4, 0.16);

    if (player.type === 'ojol') {
        // Konvoi Paket Kilat 24 arah
        for (let i = 0; i < 24; i++) {
            const a = (Math.PI * 2 * i) / 24;
            bullets.push({
                x: player.x, y: player.y,
                vx: Math.cos(a) * 10, vy: Math.sin(a) * 10,
                radius: 6, damage: player.damage * 3, color: '#10b981', piercing: true
            });
        }
        floatingTexts.push({ x: player.x - 55, y: player.y - 32, text: 'KONVOI PAKET KILAT!', color: '#34d399', alpha: 1.5 });
    } else if (player.type === 'silat') {
        // Cakra Harimau Putih + Reset Dash
        player.dashCooldown = 0;
        for (let wave = 0; wave < 2; wave++) {
            for (let i = 0; i < 18; i++) {
                const a = (Math.PI * 2 * i) / 18 + wave * 0.15;
                bullets.push({
                    x: player.x, y: player.y,
                    vx: Math.cos(a) * (8.5 + wave * 3), vy: Math.sin(a) * (8.5 + wave * 3),
                    radius: 5, damage: player.damage * 2.5, color: '#facc15', piercing: false
                });
            }
        }
        floatingTexts.push({ x: player.x - 65, y: player.y - 32, text: 'CAKRA HARIMAU PUTIH!', color: '#facc15', alpha: 1.5 });
    } else if (player.type === 'hansip') {
        // Gelombang Kentongan + Perisai Ronda
        player.shieldTimer = 240;
        shockwaves.push({ x: player.x, y: player.y, radius: 15, maxRadius: 270, color: '#bef264', alpha: 1 });
        for (let i = enemies.length - 1; i >= 0; i--) {
            const e = enemies[i];
            if (Math.hypot(e.x - player.x, e.y - player.y) < 270) {
                damageEnemy(i, player.damage * 5, true);
            }
        }
        floatingTexts.push({ x: player.x - 60, y: player.y - 32, text: 'KENTONGAN RONDA!', color: '#bef264', alpha: 1.5 });
    }
    updateHUD();
}

function togglePause() {
    if (!gameRunning || isLevelUpOpen) return;
    isPaused = !isPaused;
    if (isPaused) {
        pauseOverlay.classList.remove('hidden');
    } else {
        pauseOverlay.classList.add('hidden');
        requestAnimationFrame(gameLoop);
    }
}

window.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    keys[key] = true;

    if (e.code === 'Space') {
        e.preventDefault();
        triggerDash();
    }
    if (key === 'e') {
        triggerUltimate();
    }
    if (key === 'p' || e.key === 'Escape') {
        togglePause();
    }
});
window.addEventListener('keyup', (e) => (keys[e.key.toLowerCase()] = false));

startBtn.addEventListener('click', initGame);
resumeBtn.addEventListener('click', togglePause);

document.querySelectorAll('.upgrade-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
        const type = btn.dataset.type;
        if (type === 'fireRate') player.fireRate = Math.max(95, player.fireRate * 0.78);
        if (type === 'multiShot') player.bulletCount += 1;
        if (type === 'damage') {
            player.damage *= 1.35;
            player.critChance = Math.min(0.85, player.critChance + 0.1);
        }
        if (type === 'magnet') {
            player.magnetRange += 45;
            player.hp = Math.min(player.maxHp, player.hp + 35);
        }

        upgradeModal.classList.add('hidden');
        isLevelUpOpen = false;
        isPaused = false;
        updateHUD();
        requestAnimationFrame(gameLoop);
    });
});

function spawnEnemy(forceBoss = false) {
    const edge = Math.floor(Math.random() * 4);
    let x, y;
    if (edge === 0) { x = Math.random() * canvas.width; y = -25; }
    else if (edge === 1) { x = canvas.width + 25; y = Math.random() * canvas.height; }
    else if (edge === 2) { x = Math.random() * canvas.width; y = canvas.height + 25; }
    else { x = -25; y = Math.random() * canvas.height; }

    if (forceBoss) {
        const bossHp = 48 + player.level * 16;
        enemies.push({
            x, y,
            radius: 32,
            speed: 0.9,
            hp: bossHp,
            maxHp: bossHp,
            color: '#22c55e',
            xpValue: 150,
            kind: 'butoijo',
            rot: 0
        });
        floatingTexts.push({ x: canvas.width / 2 - 115, y: 78, text: '⚠️ BOSS BUTO IJO MECHA MUNCUL!', color: '#4ade80', alpha: 1.7 });
        playSound(140, 'sawtooth', 0.45, 0.16);
        return;
    }

    const roll = Math.random();
    if (roll < 0.18 + player.level * 0.015) {
        // Kuntilanak Drone (Ungu melayang)
        const hp = 3.5 + Math.floor(player.level * 0.7);
        enemies.push({
            x, y, radius: 18, speed: 1.25, hp, maxHp: hp,
            color: '#c084fc', xpValue: 28, kind: 'kuntilanak', rot: 0
        });
    } else if (roll < 0.36) {
        // Tuyul Pencuri Koin (Kecil super cepat)
        const hp = 1 + Math.floor(player.level / 4);
        enemies.push({
            x, y, radius: 10, speed: 2.7 + Math.min(1.2, player.level * 0.08), hp, maxHp: hp,
            color: '#facc15', xpValue: 16, kind: 'tuyul', rot: 0
        });
    } else {
        // Pocong Cyber (Putih bercahaya mata merah, gerak melompat)
        const hp = 1.2 + Math.floor(player.level / 3);
        enemies.push({
            x, y, radius: 13, speed: 1.85 + Math.min(1.2, player.level * 0.09), hp, maxHp: hp,
            color: '#f8fafc', xpValue: 12, kind: 'pocong', rot: 0
        });
    }
}

function spawnPowerUp() {
    const types = [
        { type: 'kopi', label: '☕', color: '#f97316', name: 'KOPI SACHET! (OVERDRIVE)' },
        { type: 'esteh', label: '🧋', color: '#10b981', name: 'ES TEH JUMBO! (+35 HP)' },
        { type: 'mercon', label: '🧨', color: '#ef4444', name: 'PETASAN BANTING! (BOOM)' }
    ];
    const picked = types[Math.floor(Math.random() * types.length)];
    powerUps.push({
        x: 70 + Math.random() * (canvas.width - 140),
        y: 70 + Math.random() * (canvas.height - 140),
        ...picked,
        life: 620
    });
}

function shootNearestEnemy() {
    if (enemies.length === 0) return;

    let nearest = null;
    let minDist = Infinity;
    for (const enemy of enemies) {
        const dist = Math.hypot(enemy.x - player.x, enemy.y - player.y);
        if (dist < minDist) {
            minDist = dist;
            nearest = enemy;
        }
    }

    if (!nearest) return;

    player.angle = Math.atan2(nearest.y - player.y, nearest.x - player.x);
    const spread = 0.14;

    for (let i = 0; i < player.bulletCount; i++) {
        const offset = (i - (player.bulletCount - 1) / 2) * spread;
        const angle = player.angle + offset;
        const isCrit = Math.random() < player.critChance;
        bullets.push({
            x: player.x + Math.cos(angle) * 14,
            y: player.y + Math.sin(angle) * 14,
            vx: Math.cos(angle) * 8.5,
            vy: Math.sin(angle) * 8.5,
            radius: player.explosive ? 5.5 : 4,
            damage: isCrit ? player.damage * 2 : player.damage,
            isCrit,
            explosive: player.explosive,
            color: isCrit ? '#facc15' : player.color,
            piercing: false
        });
    }
    playSound(player.type === 'hansip' ? 310 : 680, 'sine', 0.05, 0.04);
}

function damageEnemy(index, dmg, isCrit = false) {
    const e = enemies[index];
    if (!e) return;

    e.hp -= dmg;
    floatingTexts.push({
        x: e.x + (Math.random() - 0.5) * 14,
        y: e.y - 10,
        text: isCrit ? `${Math.round(dmg * 10)}!` : `${Math.round(dmg * 10)}`,
        color: isCrit ? '#facc15' : '#ffffff',
        alpha: 0.95
    });

    if (e.hp <= 0) {
        createExplosion(e.x, e.y, e.color, e.kind === 'butoijo' ? 28 : 10);
        playSound(230, 'square', 0.08, 0.05);
        coins.push({ x: e.x, y: e.y, value: e.xpValue });

        combo = Math.min(10, combo + 1);
        comboTimer = 160;
        const gained = e.xpValue * combo;
        score += gained;
        player.ultCharge = Math.min(100, player.ultCharge + (e.kind === 'butoijo' ? 40 : 4));

        enemies.splice(index, 1);
        updateHUD();
    }
}

function createExplosion(x, y, color, count = 10) {
    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 3.5 + 1;
        particles.push({
            x, y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            alpha: 1,
            color
        });
    }
}

function updateHUD() {
    scoreEl.textContent = score;
    comboEl.textContent = `x${combo}`;
    highScoreEl.textContent = highScore;
    levelEl.textContent = player.level;
    hpEl.textContent = Math.max(0, Math.ceil(player.hp));
    xpBar.style.width = `${Math.min(100, (player.xp / player.nextXp) * 100)}%`;

    if (player.dashCooldown <= 0) {
        dashStatusEl.textContent = 'SIAP';
        dashStatusEl.className = 'ready';
    } else {
        dashStatusEl.textContent = `${Math.ceil(player.dashCooldown / 60)}s`;
        dashStatusEl.className = 'cooldown';
    }

    if (player.ultCharge >= 100) {
        ultStatusEl.textContent = 'PENUH!';
        ultStatusEl.className = 'ready';
    } else {
        ultStatusEl.textContent = `${Math.floor(player.ultCharge)}%`;
        ultStatusEl.className = 'cooldown';
    }
}

function gameOver() {
    gameRunning = false;
    playSound(110, 'sawtooth', 0.45, 0.16);
    if (score > highScore) {
        highScore = score;
        localStorage.setItem('nusantaraSurvivorBest', highScore);
    }
    updateHUD();
    charSelectEl.classList.remove('hidden');
    overlayTitle.textContent = 'RONDA SELESAI (GAME OVER)';
    overlayDesc.innerHTML = `Skor Akhir: <strong>${score}</strong> • Level: <strong>${player.level}</strong> • Rekor: <strong>${highScore}</strong><br>Pilih jagoan untuk turun ke jalan lagi:`;
    startBtn.textContent = 'MAIN LAGI';
    overlay.classList.remove('hidden');
}

function gameLoop(timestamp) {
    if (!gameRunning || isPaused) return;
    frameCount++;

    if (comboTimer > 0) {
        comboTimer--;
        if (comboTimer === 0) {
            combo = 1;
            updateHUD();
        }
    }

    if (player.overdriveTimer > 0) player.overdriveTimer--;
    if (player.shieldTimer > 0) player.shieldTimer--;

    if (player.dashCooldown > 0) {
        player.dashCooldown--;
        if (player.dashCooldown % 15 === 0) updateHUD();
    }

    // Gerakan Player
    if (player.dashActive > 0) {
        player.x += player.dashDirX * 11.5;
        player.y += player.dashDirY * 11.5;
        player.dashActive--;
        trails.push({ x: player.x, y: player.y, alpha: 0.7, color: player.color });
    } else {
        let dx = 0, dy = 0;
        if (keys['w'] || keys['arrowup']) dy -= 1;
        if (keys['s'] || keys['arrowdown']) dy += 1;
        if (keys['a'] || keys['arrowleft']) dx -= 1;
        if (keys['d'] || keys['arrowright']) dx += 1;

        if (dx !== 0 || dy !== 0) {
            const len = Math.hypot(dx, dy);
            player.x += (dx / len) * player.speed;
            player.y += (dy / len) * player.speed;
            if (enemies.length === 0) player.angle = Math.atan2(dy, dx);
            if (frameCount % 3 === 0) {
                particles.push({
                    x: player.x - Math.cos(player.angle) * 12,
                    y: player.y - Math.sin(player.angle) * 12,
                    vx: (Math.random() - 0.5) * 1.5,
                    vy: (Math.random() - 0.5) * 1.5,
                    alpha: 0.7,
                    color: player.accent
                });
            }
        }
    }

    player.x = Math.max(player.radius + 18, Math.min(canvas.width - player.radius - 18, player.x));
    player.y = Math.max(player.radius + 18, Math.min(canvas.height - player.radius - 18, player.y));

    // Spawn Boss Buto Ijo setiap kelipatan level 3
    if (player.level % 3 === 0 && bossSpawnedForLevel !== player.level) {
        spawnEnemy(true);
        bossSpawnedForLevel = player.level;
    }

    const spawnInterval = Math.max(280, 1050 - player.level * 65);
    if (timestamp - lastSpawnTime > spawnInterval) {
        spawnEnemy(false);
        lastSpawnTime = timestamp;
    }

    if (timestamp - lastPowerUpTime > 13500) {
        spawnPowerUp();
        lastPowerUpTime = timestamp;
    }

    const effectiveFireRate = player.overdriveTimer > 0 ? player.fireRate * 0.48 : player.fireRate;
    if (timestamp - lastShotTime > effectiveFireRate) {
        shootNearestEnemy();
        lastShotTime = timestamp;
    }

    for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        b.x += b.vx;
        b.y += b.vy;
        if (b.x < 0 || b.x > canvas.width || b.y < 0 || b.y > canvas.height) {
            bullets.splice(i, 1);
        }
    }

    for (let i = enemies.length - 1; i >= 0; i--) {
        const e = enemies[i];
        const angle = Math.atan2(player.y - e.y, player.x - e.x);

        // Efek lompat untuk Pocong Cyber
        const hopMultiplier = e.kind === 'pocong' ? (0.6 + Math.abs(Math.sin(frameCount * 0.14)) * 0.9) : 1;
        e.x += Math.cos(angle) * e.speed * hopMultiplier;
        e.y += Math.sin(angle) * e.speed * hopMultiplier;
        e.rot += 0.04;

        if (player.dashActive <= 0 && player.shieldTimer <= 0 && Math.hypot(player.x - e.x, player.y - e.y) < player.radius + e.radius) {
            player.hp -= e.kind === 'butoijo' ? 0.95 : 0.45;
            shakeTime = 5;
            updateHUD();
            if (player.hp <= 0) return gameOver();
        }

        for (let j = bullets.length - 1; j >= 0; j--) {
            const b = bullets[j];
            if (Math.hypot(b.x - e.x, b.y - e.y) < e.radius + b.radius) {
                if (b.explosive) {
                    shockwaves.push({ x: b.x, y: b.y, radius: 5, maxRadius: 55, color: '#bef264', alpha: 0.9 });
                    for (let k = enemies.length - 1; k >= 0; k--) {
                        if (k !== i && Math.hypot(enemies[k].x - b.x, enemies[k].y - b.y) < 55) {
                            damageEnemy(k, b.damage * 0.6, false);
                        }
                    }
                }
                if (!b.piercing) bullets.splice(j, 1);
                damageEnemy(i, b.damage, b.isCrit);
                break;
            }
        }
    }

    for (let i = powerUps.length - 1; i >= 0; i--) {
        const p = powerUps[i];
        p.life--;
        if (p.life <= 0) {
            powerUps.splice(i, 1);
            continue;
        }
        if (Math.hypot(player.x - p.x, player.y - p.y) < player.radius + 16) {
            playSound(960, 'triangle', 0.18, 0.1);
            if (p.type === 'kopi') {
                player.overdriveTimer = 300;
                floatingTexts.push({ x: player.x - 65, y: player.y - 25, text: p.name, color: '#f97316', alpha: 1.4 });
            } else if (p.type === 'esteh') {
                player.hp = Math.min(player.maxHp, player.hp + 35);
                floatingTexts.push({ x: player.x - 55, y: player.y - 25, text: p.name, color: '#34d399', alpha: 1.4 });
            } else if (p.type === 'mercon') {
                shockwaves.push({ x: player.x, y: player.y, radius: 10, maxRadius: 430, color: '#ef4444', alpha: 1 });
                for (let k = enemies.length - 1; k >= 0; k--) {
                    if (enemies[k].kind !== 'butoijo') damageEnemy(k, 999, true);
                }
                floatingTexts.push({ x: player.x - 60, y: player.y - 25, text: p.name, color: '#ef4444', alpha: 1.4 });
            }
            powerUps.splice(i, 1);
            updateHUD();
        }
    }

    for (let i = coins.length - 1; i >= 0; i--) {
        const g = coins[i];
        const dist = Math.hypot(player.x - g.x, player.y - g.y);
        if (dist < player.magnetRange) {
            const angle = Math.atan2(player.y - g.y, player.x - g.x);
            g.x += Math.cos(angle) * 5.5;
            g.y += Math.sin(angle) * 5.5;
        }
        if (dist < player.radius + 6) {
            player.xp += g.value;
            coins.splice(i, 1);
            playSound(880, 'sine', 0.04, 0.03);

            if (player.xp >= player.nextXp) {
                player.xp -= player.nextXp;
                player.level += 1;
                player.nextXp = Math.floor(player.nextXp * 1.35);
                isPaused = true;
                isLevelUpOpen = true;
                playSound(740, 'triangle', 0.25, 0.1);
                upgradeModal.classList.remove('hidden');
            }
            updateHUD();
        }
    }

    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.alpha -= 0.03;
        if (p.alpha <= 0) particles.splice(i, 1);
    }

    for (let i = trails.length - 1; i >= 0; i--) {
        trails[i].alpha -= 0.06;
        if (trails[i].alpha <= 0) trails.splice(i, 1);
    }

    for (let i = shockwaves.length - 1; i >= 0; i--) {
        const sw = shockwaves[i];
        sw.radius += (sw.maxRadius - sw.radius) * 0.18;
        sw.alpha -= 0.04;
        if (sw.alpha <= 0) shockwaves.splice(i, 1);
    }

    for (let i = floatingTexts.length - 1; i >= 0; i--) {
        floatingTexts[i].y -= 0.65;
        floatingTexts[i].alpha -= 0.022;
        if (floatingTexts[i].alpha <= 0) floatingTexts.splice(i, 1);
    }

    draw();
    requestAnimationFrame(gameLoop);
}

// Latar Jalanan Malam Kota Indonesia + Neon Sign Warung
function drawIndonesianStreetBackground() {
    // Aspal gelap
    ctx.fillStyle = '#11151c';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Trotoar Kuning-Hitam Khas Jalan Raya Indonesia di tepi atas & bawah
    const tileW = 30;
    for (let x = 0; x < canvas.width; x += tileW) {
        ctx.fillStyle = (x / tileW) % 2 === 0 ? '#eab308' : '#1f2937';
        ctx.fillRect(x, 0, tileW, 12);
        ctx.fillRect(x, canvas.height - 12, tileW, 12);
    }

    // Zebra Cross Tengah
    ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
    for (let y = 60; y < canvas.height - 60; y += 48) {
        ctx.fillRect(canvas.width / 2 - 45, y, 90, 24);
    }

    // Garis Marka Jalan Putus-Putus Horizontal
    ctx.strokeStyle = 'rgba(250, 204, 21, 0.18)';
    ctx.lineWidth = 3;
    ctx.setLineDash([28, 22]);
    ctx.beginPath();
    ctx.moveTo(0, canvas.height / 2);
    ctx.lineTo(canvas.width, canvas.height / 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Neon Sign Lokal di Pojok Arena
    ctx.save();
    ctx.font = 'bold 11px Segoe UI';
    ctx.fillStyle = 'rgba(52, 211, 153, 0.25)';
    ctx.fillText('[ WARTEG CYBER 24 JAM ]', 24, 34);
    ctx.fillStyle = 'rgba(250, 204, 21, 0.25)';
    ctx.fillText('[ TAMBAL BAN & WIFI GRATIS ]', canvas.width - 195, 34);
    ctx.fillStyle = 'rgba(248, 113, 113, 0.22)';
    ctx.fillText('[ POS RONDA SEKTOR 07 ]', 24, canvas.height - 22);
    ctx.restore();
}

function drawPlayer() {
    ctx.save();
    ctx.translate(player.x, player.y);

    if (player.shieldTimer > 0) {
        ctx.strokeStyle = '#bef264';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, player.radius + 8, 0, Math.PI * 2);
        ctx.stroke();
    } else if (player.overdriveTimer > 0) {
        ctx.strokeStyle = '#f97316';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.arc(0, 0, player.radius + 7, frameCount * 0.1, frameCount * 0.1 + Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    ctx.rotate(player.angle);
    ctx.shadowColor = player.color;
    ctx.shadowBlur = 14;

    if (player.type === 'ojol') {
        // Tas Delivery di belakang + Jaket & Helm Hijau Ojol
        ctx.fillStyle = '#065f46';
        ctx.fillRect(-14, -8, 8, 16);

        ctx.fillStyle = '#10b981';
        ctx.beginPath();
        ctx.arc(0, 0, player.radius, 0, Math.PI * 2);
        ctx.fill();

        // Garis Kuning Helm & Visor Gelap
        ctx.fillStyle = '#facc15';
        ctx.fillRect(-4, -12, 5, 24);
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(4, -7, 7, 14);
    } else if (player.type === 'silat') {
        // Selendang Merah + Udeng Kuning + Keris Energi
        ctx.fillStyle = '#facc15';
        ctx.fillRect(8, -2, 14, 4); // Bilah Keris

        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.moveTo(15, 0);
        ctx.lineTo(-11, -13);
        ctx.lineTo(-6, 0);
        ctx.lineTo(-11, 13);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#facc15';
        ctx.beginPath();
        ctx.arc(0, 0, 6, 0, Math.PI * 2);
        ctx.fill();
    } else if (player.type === 'hansip') {
        // Seragam Hijau Hansip + Pentungan Listrik Besar
        ctx.fillStyle = '#bef264';
        ctx.fillRect(6, -4, 16, 8);

        ctx.fillStyle = '#4d7c0f';
        ctx.fillRect(-14, -14, 28, 28);
        ctx.strokeStyle = '#bef264';
        ctx.lineWidth = 2;
        ctx.strokeRect(-14, -14, 28, 28);

        ctx.fillStyle = '#1e293b';
        ctx.fillRect(4, -8, 6, 16);
    }

    ctx.restore();
}

function draw() {
    ctx.save();
    if (shakeTime > 0) {
        ctx.translate((Math.random() - 0.5) * 7, (Math.random() - 0.5) * 7);
        shakeTime--;
    }

    drawIndonesianStreetBackground();

    // Shockwaves
    for (const sw of shockwaves) {
        ctx.strokeStyle = sw.color;
        ctx.globalAlpha = Math.max(0, sw.alpha);
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2);
        ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Dash Trails
    for (const t of trails) {
        ctx.fillStyle = t.color;
        ctx.globalAlpha = t.alpha * 0.35;
        ctx.beginPath();
        ctx.arc(t.x, t.y, player.radius, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Power-Ups Kuliner Lokal
    for (const p of powerUps) {
        ctx.save();
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 12;
        ctx.fillStyle = '#1e293b';
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 16, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.font = '15px Segoe UI';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(p.label, p.x, p.y);
        ctx.restore();
    }

    // Koin Receh Rupiah Neon (XP)
    for (const g of coins) {
        ctx.save();
        ctx.fillStyle = '#facc15';
        ctx.strokeStyle = '#ca8a04';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(g.x, g.y, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }

    // Peluru
    for (const b of bullets) {
        ctx.fillStyle = b.color;
        ctx.shadowColor = b.color;
        ctx.shadowBlur = b.isCrit ? 10 : 4;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.shadowBlur = 0;

    // Gambar Musuh Urban Legend
    for (const e of enemies) {
        ctx.save();
        ctx.translate(e.x, e.y);

        if (e.kind === 'pocong') {
            // Pocong Cyber (Kapsul putih tali ikat + mata merah menyala)
            ctx.fillStyle = '#f8fafc';
            ctx.beginPath();
            ctx.ellipse(0, 0, 10, 15, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#ef4444';
            ctx.fillRect(-4, -5, 3, 3);
            ctx.fillRect(2, -5, 3, 3);
        } else if (e.kind === 'tuyul') {
            // Tuyul Cepat (Kepala botak berkilau + cakar kuning)
            ctx.fillStyle = '#fde047';
            ctx.beginPath();
            ctx.arc(0, 0, e.radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#0f172a';
            ctx.fillRect(-4, -2, 3, 3);
            ctx.fillRect(2, -2, 3, 3);
        } else if (e.kind === 'kuntilanak') {
            // Kuntilanak Drone (Aura ungu melayang)
            ctx.fillStyle = '#c084fc';
            ctx.beginPath();
            ctx.moveTo(0, -18);
            ctx.lineTo(14, 14);
            ctx.lineTo(0, 8);
            ctx.lineTo(-14, 14);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = '#ef4444';
            ctx.fillRect(-4, -4, 3, 3);
            ctx.fillRect(2, -4, 3, 3);
        } else if (e.kind === 'butoijo') {
            // Boss Buto Ijo Mecha (Raksasa hijau bertanduk emas)
            ctx.fillStyle = '#16a34a';
            ctx.strokeStyle = '#86efac';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(0, 0, e.radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            // Tanduk Emas
            ctx.fillStyle = '#facc15';
            ctx.beginPath();
            ctx.moveTo(-18, -22); ctx.lineTo(-8, -36); ctx.lineTo(-4, -22);
            ctx.moveTo(18, -22); ctx.lineTo(8, -36); ctx.lineTo(4, -22);
            ctx.fill();

            // Mata Merah Menyala
            ctx.fillStyle = '#ef4444';
            ctx.fillRect(-12, -6, 8, 5);
            ctx.fillRect(4, -6, 8, 5);

            // HP Bar Boss
            const barW = 68;
            ctx.fillStyle = '#1e293b';
            ctx.fillRect(-barW / 2, -e.radius - 18, barW, 6);
            ctx.fillStyle = '#4ade80';
            ctx.fillRect(-barW / 2, -e.radius - 18, barW * (e.hp / e.maxHp), 6);
        }
        ctx.restore();
    }

    drawPlayer();

    // Partikel
    for (const p of particles) {
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x, p.y, 4, 4);
    }
    ctx.globalAlpha = 1;

    // Floating Text
    ctx.font = 'bold 12px Segoe UI';
    for (const ft of floatingTexts) {
        ctx.globalAlpha = Math.min(1, ft.alpha);
        ctx.fillStyle = ft.color;
        ctx.fillText(ft.text, ft.x, ft.y);
    }
    ctx.globalAlpha = 1;

    ctx.restore();
}