// ==========================================
// DIRT PITCH - 2 jogadores + goleiros bots
// P1 (vermelho, esquerda): WASD + Q (forte) + E (fraco) + F (dash)
// P2 (azul, direita):      OKLÇ + P (forte) + I (fraco) + J (dash)
// ==========================================

// ==========================================
// CONFIG
// ==========================================
const CONFIG = {
    PIXEL_SCALE: 3,
    VIEW_W: 480,
    VIEW_H: 180,

    FIELD_MARGIN: 6,

    GOAL_HEIGHT: 50,
    GOAL_DEPTH: 8,

    AREA_W: 40,
    AREA_H: 90,

    PLAYER_RADIUS: 6,
    PLAYER_SPEED: 90,
    PLAYER_ACCEL: 900,
    PLAYER_DECEL: 1400,
    PLAYER_PUSH_FRICTION: 0.5,
    BALL_OFFSET: 3,

    BALL_RADIUS: 4,
    BALL_DEFAULT_FRICTION: 1.8,
    BALL_WALL_BOUNCE: 0.6,

    KICK_TYPES: {
        strong: { baseSpeed: 300, friction: 1.8, cooldown: 60.00 },
        weak:   { baseSpeed: 270, friction: 3.5, cooldown: 0.12 },
    },

    STEAL_MARGIN: 0.5,

    DASH_DISTANCE: 28,
    DASH_DURATION: 0.18,
    DASH_COOLDOWN: 10.0,
    DASH_TRAIL_LIFE: 0.25,

    // Goleiro
    GOALKEEPER_RADIUS: 5,
    GOALKEEPER_SPEED: 55,
    GOALKEEPER_HOLD_TIME: 0.8,
    GOALKEEPER_KICK_SPEED: 220,
    GOALKEEPER_KICK_RANDOM_X: 30,
    GOALKEEPER_KICK_RANDOM_Y: 20,
    GOALKEEPER_DEPTH: 8,
    GOALKEEPER_BALL_OFFSET: 6,

    // Margem de erro do goleiro
    GOALKEEPER_ERROR_CHANCE: 0.10,        // 1 em 10
    GOALKEEPER_DECISION_RANGE_X: 80,      // px da linha do gol que dispara a decisão
    GOALKEEPER_DECISION_LEAD_TIME: 0.6,   // projeção da trajetória (s)

    MAX_DT: 0.033,
};

const {
    PIXEL_SCALE, VIEW_W, VIEW_H,
    FIELD_MARGIN, GOAL_HEIGHT, GOAL_DEPTH,
    AREA_W, AREA_H,
    PLAYER_RADIUS, PLAYER_SPEED, PLAYER_ACCEL, PLAYER_DECEL,
    PLAYER_PUSH_FRICTION, BALL_OFFSET,
    BALL_RADIUS, BALL_DEFAULT_FRICTION, BALL_WALL_BOUNCE,
    KICK_TYPES, STEAL_MARGIN, MAX_DT,
    DASH_DISTANCE, DASH_DURATION, DASH_COOLDOWN, DASH_TRAIL_LIFE,
    GOALKEEPER_RADIUS, GOALKEEPER_SPEED, GOALKEEPER_HOLD_TIME,
    GOALKEEPER_KICK_SPEED, GOALKEEPER_KICK_RANDOM_X, GOALKEEPER_KICK_RANDOM_Y,
    GOALKEEPER_DEPTH, GOALKEEPER_BALL_OFFSET,
    GOALKEEPER_ERROR_CHANCE, GOALKEEPER_DECISION_RANGE_X, GOALKEEPER_DECISION_LEAD_TIME,
} = CONFIG;

const GOAL_TOP    = (VIEW_H - GOAL_HEIGHT) / 2;
const GOAL_BOTTOM = GOAL_TOP + GOAL_HEIGHT;
const AREA_TOP    = (VIEW_H - AREA_H) / 2;
const AREA_BOTTOM = AREA_TOP + AREA_H;

// ==========================================
// ASSETS
// ==========================================
const ballImage = new Image();
ballImage.src = 'assets/ball.png';

// ==========================================
// CANVAS
// ==========================================
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width  = VIEW_W * PIXEL_SCALE;
canvas.height = VIEW_H * PIXEL_SCALE;
ctx.imageSmoothingEnabled = false;

// ==========================================
// TELA INICIAL
// ==========================================
const titleScreen = document.getElementById('titleScreen');
const playButton  = document.getElementById('playButton');

let gameStarted = false;

if (playButton) {
    playButton.addEventListener('click', () => {
        if (gameStarted) return;
        gameStarted = true;

        titleScreen.classList.add('fade-out');

        titleScreen.addEventListener('transitionend', () => {
            titleScreen.remove();
            startGame();
        }, { once: true });
    });
}

// ==========================================
// INPUT
// ==========================================
const keys = {};

function normalizeKey(k) {
    k = k.toLowerCase();
    if (k === 'c') return 'ç';
    return k;
}

window.addEventListener('keydown', e => {
    const k = normalizeKey(e.key);
    keys[k] = true;
    const blocked = ['w','a','s','d','q','e','f','o','k','l','p','i','j','ç',' '];
    if (blocked.includes(k)) e.preventDefault();
});

window.addEventListener('keyup', e => {
    const k = normalizeKey(e.key);
    keys[k] = false;
});

window.addEventListener('blur', () => {
    for (const k in keys) keys[k] = false;
});

// ==========================================
// UTILITÁRIOS
// ==========================================
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const dist  = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
}

// ==========================================
// ESTADO DO JOGO
// ==========================================
const gameState = {
    scoreRed: 0,
    scoreBlue: 0,
    goalPause: 0,
    lastScorer: null,
};

function resetPositions() {
    p1.x = VIEW_W / 2 - 60;
    p1.y = VIEW_H / 2;
    p1.vx = 0; p1.vy = 0;
    p1.facing.x = 1; p1.facing.y = 0;
    p1.kickCooldownStrong = 0;
    p1.kickCooldownWeak   = 0;
    p1.dashCooldown = 0;
    p1.dashTimeLeft = 0;
    p1.trail = [];

    p2.x = VIEW_W / 2 + 60;
    p2.y = VIEW_H / 2;
    p2.vx = 0; p2.vy = 0;
    p2.facing.x = -1; p2.facing.y = 0;
    p2.kickCooldownStrong = 0;
    p2.kickCooldownWeak   = 0;
    p2.dashCooldown = 0;
    p2.dashTimeLeft = 0;
    p2.trail = [];

    ball.x = VIEW_W / 2;
    ball.y = VIEW_H / 2;
    ball.vx = 0; ball.vy = 0;
    ball.friction = BALL_DEFAULT_FRICTION;
    ball.owner = null;

    gkRed.reset();
    gkBlue.reset();
}

// ==========================================
// CLASSE BASE: Actor
// ==========================================
class Actor {
    constructor(x, y, team) {
        this.x = x;
        this.y = y;
        this.radius = PLAYER_RADIUS;
        this.maxSpeed = PLAYER_SPEED;
        this.vx = 0;
        this.vy = 0;
        this.facing = { x: 1, y: 0 };
        this.team = team;

        this.ballOffset = this.radius + BALL_OFFSET;

        this.kickCooldownStrong = 0;
        this.kickCooldownWeak   = 0;

        this.dashCooldown = 0;
        this.dashTimeLeft = 0;
        this.dashVX = 0;
        this.dashVY = 0;
        this.trail = [];

        this.color = '#e94b3c';
    }

    get defendingGoal() { return this.team === 'red' ? 'left' : 'right'; }
    get attackingGoal() { return this.team === 'red' ? 'right' : 'left'; }
    get isDashing()     { return this.dashTimeLeft > 0; }

    applyMovement(dt, dx, dy) {
        const len = Math.hypot(dx, dy);
        let targetVX = 0, targetVY = 0;

        if (len > 0) {
            const nx = dx / len;
            const ny = dy / len;
            targetVX = nx * this.maxSpeed;
            targetVY = ny * this.maxSpeed;
            this.facing.x = nx;
            this.facing.y = ny;
        }

        const accel = (len > 0) ? PLAYER_ACCEL : PLAYER_DECEL;
        const dvx = targetVX - this.vx;
        const dvy = targetVY - this.vy;
        const dLen = Math.hypot(dvx, dvy);

        if (dLen > 0) {
            const step = Math.min(accel * dt, dLen);
            this.vx += (dvx / dLen) * step;
            this.vy += (dvy / dLen) * step;
        }

        this.x += this.vx * dt;
        this.y += this.vy * dt;

        this.x = clamp(this.x, FIELD_MARGIN + this.radius, VIEW_W - FIELD_MARGIN - this.radius);
        this.y = clamp(this.y, FIELD_MARGIN + this.radius, VIEW_H - FIELD_MARGIN - this.radius);
    }

    startDash() {
        if (this.dashCooldown > 0) return;
        if (this.dashTimeLeft > 0) return;

        const nx = this.facing.x;
        const ny = this.facing.y;

        const speed = DASH_DISTANCE / DASH_DURATION;
        this.dashVX = nx * speed;
        this.dashVY = ny * speed;

        this.dashTimeLeft = DASH_DURATION;
        this.dashCooldown = DASH_COOLDOWN;

        this.vx = 0;
        this.vy = 0;
    }

    updateDash(dt) {
        if (this.dashCooldown > 0) this.dashCooldown -= dt;

        if (this.dashTimeLeft > 0) {
            this.dashTimeLeft -= dt;

            this.x += this.dashVX * dt;
            this.y += this.dashVY * dt;

            this.x = clamp(this.x, FIELD_MARGIN + this.radius, VIEW_W - FIELD_MARGIN - this.radius);
            this.y = clamp(this.y, FIELD_MARGIN + this.radius, VIEW_H - FIELD_MARGIN - this.radius);

            this.trail.push({ x: this.x, y: this.y, life: DASH_TRAIL_LIFE });
        }

        for (const t of this.trail) t.life -= dt;
        this.trail = this.trail.filter(t => t.life > 0);
    }

    resolveCollision(other) {
        const dx = other.x - this.x;
        const dy = other.y - this.y;
        const d = Math.hypot(dx, dy);
        const minDist = this.radius + other.radius;

        if (d >= minDist || d === 0) return;

        const overlap = minDist - d;
        const nx = dx / d;
        const ny = dy / d;

        let pushSelf = 0.5, pushOther = 0.5;
        if (this.isDashing && !other.isDashing)      { pushSelf = 0.15; pushOther = 0.85; }
        else if (!this.isDashing && other.isDashing) { pushSelf = 0.85; pushOther = 0.15; }

        this.x  -= nx * overlap * pushSelf;
        this.y  -= ny * overlap * pushSelf;
        other.x += nx * overlap * pushOther;
        other.y += ny * overlap * pushOther;

        const vn1 = this.vx * nx + this.vy * ny;
        const vn2 = other.vx * nx + other.vy * ny;

        if (vn1 > 0) {
            this.vx -= nx * vn1 * PLAYER_PUSH_FRICTION;
            this.vy -= ny * vn1 * PLAYER_PUSH_FRICTION;
        }
        if (vn2 < 0) {
            other.vx -= nx * vn2 * PLAYER_PUSH_FRICTION;
            other.vy -= ny * vn2 * PLAYER_PUSH_FRICTION;
        }
    }

    tryGainPossession(ball) {
        if (ball.owner === this) return;

        const myDist = dist(this, ball);

        if (!ball.owner) {
            const pickupRange = this.radius + ball.radius + 2;
            if (myDist < pickupRange) {
                ball.owner = this;
                ball.vx = 0;
                ball.vy = 0;
            }
            return;
        }

        if (ball.owner.isGoalkeeper) return;

        if (ball.owner.isDashing) return;

        if (this.isDashing) {
            const carrinhoRange = this.radius + ball.radius + 3;
            if (myDist < carrinhoRange) {
                ball.owner = this;
                ball.vx = 0;
                ball.vy = 0;
                this.dashTimeLeft = 0;
            }
            return;
        }

        const stealRange = this.radius + ball.radius + 1;
        if (myDist > stealRange) return;

        const ownerDist = dist(ball.owner, ball);
        if (myDist + STEAL_MARGIN < ownerDist) {
            ball.owner = this;
            ball.vx = 0;
            ball.vy = 0;
        }
    }

    updatePossession(ball) {
        if (ball.owner === this) {
            ball.x = this.x + this.facing.x * this.ballOffset;
            ball.y = this.y + this.facing.y * this.ballOffset;

            ball.x = clamp(ball.x, FIELD_MARGIN + ball.radius, VIEW_W - FIELD_MARGIN - ball.radius);
            ball.y = clamp(ball.y, FIELD_MARGIN + ball.radius, VIEW_H - FIELD_MARGIN - ball.radius);

            ball.vx = 0;
            ball.vy = 0;
        } else {
            this.tryGainPossession(ball);
        }
    }

    kick(ball, type = 'strong') {
        if (ball.owner !== this) return;
        if (this.isDashing) return;

        const cfg = KICK_TYPES[type] || KICK_TYPES.strong;
        const isStrong = type === 'strong';
        const cdField = isStrong ? 'kickCooldownStrong' : 'kickCooldownWeak';

        if (this[cdField] > 0) return;

        const nx = this.facing.x;
        const ny = this.facing.y;

        let bx = this.x + nx * this.ballOffset;
        let by = this.y + ny * this.ballOffset;

        bx = clamp(bx, FIELD_MARGIN + ball.radius, VIEW_W - FIELD_MARGIN - ball.radius);
        by = clamp(by, FIELD_MARGIN + ball.radius, VIEW_H - FIELD_MARGIN - ball.radius);

        ball.owner = null;
        ball.x = bx;
        ball.y = by;
        ball.vx = nx * cfg.baseSpeed;
        ball.vy = ny * cfg.baseSpeed;

        ball.friction = cfg.friction;
        this[cdField] = cfg.cooldown;
    }

    draw(ctx) {
        for (const t of this.trail) {
            const alpha = (t.life / DASH_TRAIL_LIFE) * 0.55;
            ctx.fillStyle = hexToRgba(this.color, alpha);
            ctx.fillRect(
                Math.round(t.x - this.radius),
                Math.round(t.y - this.radius),
                this.radius * 2,
                this.radius * 2
            );
        }

        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.ellipse(
            this.x,
            this.y + this.radius - 1,
            this.radius,
            this.radius * 0.4,
            0, 0, Math.PI * 2
        );
        ctx.fill();

        let bodyW = this.radius * 2;
        let bodyH = this.radius * 2;
        let bodyX = this.x - this.radius;
        let bodyY = this.y - this.radius;

        if (this.isDashing) {
            const stretch = 2;
            bodyW += Math.abs(this.facing.x) * stretch;
            bodyH += Math.abs(this.facing.y) * stretch;
            bodyX -= (bodyW - this.radius * 2) / 2 * Math.sign(this.facing.x);
            bodyY -= (bodyH - this.radius * 2) / 2 * Math.sign(this.facing.y);
        }

        ctx.fillStyle = this.color;
        ctx.fillRect(
            Math.round(bodyX),
            Math.round(bodyY),
            Math.round(bodyW),
            Math.round(bodyH)
        );

        ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.lineWidth = 1;
        ctx.strokeRect(
            Math.round(bodyX) + 0.5,
            Math.round(bodyY) + 0.5,
            Math.round(bodyW) - 1,
            Math.round(bodyH) - 1
        );

        ctx.fillStyle = '#fff';
        const fx = this.x + this.facing.x * (this.radius - 1);
        const fy = this.y + this.facing.y * (this.radius - 1);
        ctx.fillRect(Math.round(fx) - 1, Math.round(fy) - 1, 2, 2);
    }
}

// ==========================================
// CLASSE: Player
// ==========================================
class Player extends Actor {
    constructor(x, y, team, controls) {
        super(x, y, team);
        this.controls = controls;
        this.color = team === 'red' ? '#e94b3c' : '#3a86ff';
    }

    update(dt, ball) {
        if (this.kickCooldownStrong > 0) this.kickCooldownStrong -= dt;
        if (this.kickCooldownWeak   > 0) this.kickCooldownWeak   -= dt;

        this.updateDash(dt);

        if (!this.isDashing) {
            let dx = 0, dy = 0;
            if (keys[this.controls.up])    dy -= 1;
            if (keys[this.controls.down])  dy += 1;
            if (keys[this.controls.left])  dx -= 1;
            if (keys[this.controls.right]) dx += 1;

            this.applyMovement(dt, dx, dy);
        }

        this.updatePossession(ball);

        if (keys[this.controls.dash]) {
            this.startDash();
            keys[this.controls.dash] = false;
        }

        if (!this.isDashing) {
            if (keys[this.controls.kickWeak]) {
                this.kick(ball, 'weak');
                keys[this.controls.kickWeak] = false;
            }
            if (keys[this.controls.kickStrong]) {
                this.kick(ball, 'strong');
                keys[this.controls.kickStrong] = false;
            }
        }
    }
}

// ==========================================
// CLASSE: Goalkeeper (bot)
// ==========================================
class Goalkeeper {
    constructor(team) {
        this.team = team;
        this.radius = GOALKEEPER_RADIUS;
        this.isGoalkeeper = true;
        this.color = team === 'red' ? '#c73a2c' : '#2c6ecc';

        this.baseX = (team === 'red')
            ? FIELD_MARGIN + GOALKEEPER_DEPTH
            : VIEW_W - FIELD_MARGIN - GOALKEEPER_DEPTH;

        this.x = this.baseX;
        this.y = VIEW_H / 2;

        this.minY = GOAL_TOP + this.radius;
        this.maxY = GOAL_BOTTOM - this.radius;

        this.state = 'GUARD'; // 'GUARD' | 'HOLDING' | 'THROWING'
        this.holdTimer = 0;
        this.throwTarget = null;
        this.throwTimer = 0;
        this.distributionCooldown = 0;

        // Decisão por chute
        this.decisionMade = false;
        this.decisionTargetY = null;
        this.lastBallVX = 0; // para detectar "novo chute"
    }

    reset() {
        this.x = this.baseX;
        this.y = VIEW_H / 2;
        this.state = 'GUARD';
        this.holdTimer = 0;
        this.throwTarget = null;
        this.throwTimer = 0;
        this.distributionCooldown = 0;
        this.decisionMade = false;
        this.decisionTargetY = null;
        this.lastBallVX = 0;
    }

    getTeammatePlayer() {
        return this.team === 'red' ? p1 : p2;
    }

    update(dt, ball) {
        if (this.distributionCooldown > 0) this.distributionCooldown -= dt;

        // ---------- GUARD ----------
        if (this.state === 'GUARD') {
            this.x = this.baseX;

            // Detecta se a bola está vindo pro gol e decide o lado
            this.maybeDecide(ball);

            // Decide o alvo Y
            let targetY;
            if (this.decisionMade && this.decisionTargetY !== null) {
                targetY = clamp(this.decisionTargetY, this.minY, this.maxY);
            } else if (this.isBallNearDefenseArea(ball)) {
                targetY = clamp(ball.y, this.minY, this.maxY);
            } else {
                targetY = VIEW_H / 2;
            }

            const dy = targetY - this.y;
            if (Math.abs(dy) > 0.5) {
                const step = Math.sign(dy) * Math.min(
                    Math.abs(dy),
                    GOALKEEPER_SPEED * dt
                );
                this.y += step;
            }
            this.y = clamp(this.y, this.minY, this.maxY);

            // Defesa: bola livre toca o goleiro
            if (!ball.owner && this.distributionCooldown <= 0) {
                const d = dist(this, ball);
                if (d < this.radius + ball.radius + 1) {
                    this.catchBall(ball);
                }
            }

            // Se a bola se afastou muito (não é mais chute a gol), reseta a decisão
            if (this.decisionMade && this.ballLostThreat(ball)) {
                this.decisionMade = false;
                this.decisionTargetY = null;
            }
        }

        // ---------- HOLDING ----------
        else if (this.state === 'HOLDING') {
            this.holdTimer -= dt;

            ball.x = this.x;
            ball.y = this.y + (this.team === 'red' ? -1 : 1) * GOALKEEPER_BALL_OFFSET;
            ball.vx = 0;
            ball.vy = 0;

            if (this.holdTimer <= 0) {
                this.beginThrow(ball);
            }
        }

        // ---------- THROWING ----------
        else if (this.state === 'THROWING') {
            this.throwTimer -= dt;

            ball.x = this.x;
            ball.y = this.y + (this.team === 'red' ? -1 : 1) * GOALKEEPER_BALL_OFFSET;
            ball.vx = 0;
            ball.vy = 0;

            if (this.throwTimer <= 0) {
                this.executeThrow(ball);
            }
        }
    }

    // ---------- DETECÇÃO DE CHUTE A GOL ----------
    // Verifica se a bola está numa trajetória que vai chegar perto da linha do gol
    // dentro de GOALKEEPER_DECISION_LEAD_TIME segundos.
    ballIsHeadingToGoal(ball) {
        if (ball.owner) return false;

        // Direção X deve apontar para o gol deste goleiro
        const isLeftGoal = (this.team === 'red');
        if (isLeftGoal && ball.vx >= -1) return false;     // bola indo pra esquerda
        if (!isLeftGoal && ball.vx <= 1) return false;     // bola indo pra direita

        // Distância até a linha do gol (em X)
        const goalLineX = isLeftGoal ? FIELD_MARGIN : (VIEW_W - FIELD_MARGIN);
        const dxToGoal = goalLineX - ball.x;

        // Só interessa se estiver "chegando" à zona de decisão
        if (Math.abs(dxToGoal) > GOALKEEPER_DECISION_RANGE_X) return false;

        // Projeta onde estará o Y quando a bola chegar no X do gol
        const timeToGoal = dxToGoal / ball.vx; // vx é negativo pro gol esquerdo, positivo pro direito
        if (timeToGoal < 0 || timeToGoal > GOALKEEPER_DECISION_LEAD_TIME) return false;

        const projectedY = ball.y + ball.vy * timeToGoal;

        // Precisa estar dentro da boca do gol na projeção
        return projectedY > GOAL_TOP && projectedY < GOAL_BOTTOM;
    }

    // ---------- DECISÃO ----------
    // Chamado 1x por chute. Sorteia se erra ou não, e define o Y alvo.
    maybeDecide(ball) {
        // Já decidiu neste chute? Ignora
        if (this.decisionMade) return;

        // Bola não está indo pro gol? Ignora
        if (!this.ballIsHeadingToGoal(ball)) return;

        // Projeta o Y real onde a bola vai cruzar a linha
        const isLeftGoal = (this.team === 'red');
        const goalLineX = isLeftGoal ? FIELD_MARGIN : (VIEW_W - FIELD_MARGIN);
        const dxToGoal = goalLineX - ball.x;
        const timeToGoal = dxToGoal / ball.vx;
        const projectedY = clamp(ball.y + ball.vy * timeToGoal, GOAL_TOP, GOAL_BOTTOM);

        // Decide: acerta ou erra?
        const isWrong = Math.random() < GOALKEEPER_ERROR_CHANCE;

        if (!isWrong) {
            // Acerta: vai para o Y projetado
            this.decisionTargetY = projectedY;
        } else {
            // Erra: vai para o lado OPOSTO do Y projetado
            // Se a bola vai no topo, ele vai pra base; se vai na base, vai pro topo.
            const centerY = (GOAL_TOP + GOAL_BOTTOM) / 2;
            const mirroredY = 2 * centerY - projectedY;
            this.decisionTargetY = clamp(mirroredY, GOAL_TOP, GOAL_BOTTOM);
        }

        this.decisionMade = true;
    }

    // Se a bola deixou de ser ameaça (quicou pra fora, perdeu velocidade, etc)
    ballLostThreat(ball) {
        if (ball.owner) return true;

        const isLeftGoal = (this.team === 'red');
        // Bola indo pro outro lado?
        if (isLeftGoal && ball.vx >= 0) return true;
        if (!isLeftGoal && ball.vx <= 0) return true;

        // Bola ficou muito lenta?
        const speed = Math.hypot(ball.vx, ball.vy);
        if (speed < 30) return true;

        // Bola ficou longe da boca do gol (Y fora)
        if (ball.y < GOAL_TOP - 20 || ball.y > GOAL_BOTTOM + 20) return true;

        return false;
    }

    isBallNearDefenseArea(ball) {
        const dx = Math.abs(ball.x - this.baseX);
        return dx < AREA_W * 1.5;
    }

    catchBall(ball) {
        ball.owner = this;
        ball.vx = 0;
        ball.vy = 0;
        this.state = 'HOLDING';
        this.holdTimer = GOALKEEPER_HOLD_TIME;

        // Reseta a decisão para o próximo chute
        this.decisionMade = false;
        this.decisionTargetY = null;
    }

    beginThrow(ball) {
        const teammate = this.getTeammatePlayer();
        const rx = (Math.random() * 2 - 1) * GOALKEEPER_KICK_RANDOM_X;
        const ry = (Math.random() * 2 - 1) * GOALKEEPER_KICK_RANDOM_Y;

        this.throwTarget = {
            x: clamp(teammate.x + rx, FIELD_MARGIN + 20, VIEW_W - FIELD_MARGIN - 20),
            y: clamp(teammate.y + ry, FIELD_MARGIN + 20, VIEW_H - FIELD_MARGIN - 20),
        };

        this.state = 'THROWING';
        this.throwTimer = 0.25;
    }

    executeThrow(ball) {
        const tx = this.throwTarget.x;
        const ty = this.throwTarget.y;

        const dx = tx - this.x;
        const dy = ty - this.y;
        const d = Math.hypot(dx, dy);

        const nx = d > 0.001 ? dx / d : (this.team === 'red' ? 1 : -1);
        const ny = d > 0.001 ? dy / d : 0;

        ball.owner = null;
        ball.x = this.x + nx * (this.radius + ball.radius + 1);
        ball.y = this.y + ny * (this.radius + ball.radius + 1);
        ball.vx = nx * GOALKEEPER_KICK_SPEED;
        ball.vy = ny * GOALKEEPER_KICK_SPEED;
        ball.friction = BALL_DEFAULT_FRICTION;

        this.state = 'GUARD';
        this.throwTarget = null;
        this.throwTimer = 0;
        this.distributionCooldown = 0.3;

        // Zera decisão pro próximo chute
        this.decisionMade = false;
        this.decisionTargetY = null;
    }

    draw(ctx) {
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.beginPath();
        ctx.ellipse(
            this.x,
            this.y + this.radius - 1,
            this.radius,
            this.radius * 0.4,
            0, 0, Math.PI * 2
        );
        ctx.fill();

        const r = this.radius;

        ctx.fillStyle = this.color;
        ctx.fillRect(
            Math.round(this.x - r),
            Math.round(this.y - r),
            r * 2,
            r * 2
        );

        ctx.fillStyle = '#ffeb3b';
        ctx.fillRect(
            Math.round(this.x - r),
            Math.round(this.y - 1),
            r * 2,
            2
        );

        ctx.strokeStyle = 'rgba(0,0,0,0.7)';
        ctx.lineWidth = 1;
        ctx.strokeRect(
            Math.round(this.x - r) + 0.5,
            Math.round(this.y - r) + 0.5,
            r * 2 - 1,
            r * 2 - 1
        );
    }
}

// ==========================================
// CLASSE: Ball
// ==========================================
class Ball {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.radius = BALL_RADIUS;
        this.vx = 0;
        this.vy = 0;
        this.friction = BALL_DEFAULT_FRICTION;
        this.owner = null;
    }

    update(dt) {
        if (this.owner) return;

        const speed = Math.hypot(this.vx, this.vy);
        if (speed > 0) {
            const newSpeed = Math.max(0, speed - this.friction * 60 * dt);
            const scale = newSpeed / speed;
            this.vx *= scale;
            this.vy *= scale;

            if (newSpeed < 1) {
                this.vx = 0;
                this.vy = 0;
                this.friction = BALL_DEFAULT_FRICTION;
            }
        }

        this.x += this.vx * dt;
        this.y += this.vy * dt;

        if (this.y - this.radius < FIELD_MARGIN) {
            this.y = FIELD_MARGIN + this.radius;
            this.vy = -this.vy * BALL_WALL_BOUNCE;
        }
        if (this.y + this.radius > VIEW_H - FIELD_MARGIN) {
            this.y = VIEW_H - FIELD_MARGIN - this.radius;
            this.vy = -this.vy * BALL_WALL_BOUNCE;
        }

        const inGoalY = this.y > GOAL_TOP && this.y < GOAL_BOTTOM;

        if (this.x - this.radius < FIELD_MARGIN) {
            if (inGoalY) {
                if (this.x - this.radius < FIELD_MARGIN - GOAL_DEPTH) {
                    this.registerGoal('left');
                    return;
                }
            } else {
                this.x = FIELD_MARGIN + this.radius;
                this.vx = -this.vx * BALL_WALL_BOUNCE;
            }
        }

        if (this.x + this.radius > VIEW_W - FIELD_MARGIN) {
            if (inGoalY) {
                if (this.x + this.radius > VIEW_W - FIELD_MARGIN + GOAL_DEPTH) {
                    this.registerGoal('right');
                    return;
                }
            } else {
                this.x = VIEW_W - FIELD_MARGIN - this.radius;
                this.vx = -this.vx * BALL_WALL_BOUNCE;
            }
        }
    }

    registerGoal(side) {
        if (side === 'left') {
            gameState.scoreBlue++;
            gameState.lastScorer = 'blue';
        } else {
            gameState.scoreRed++;
            gameState.lastScorer = 'red';
        }

        gameState.goalPause = 1.4;
        this.vx = 0;
        this.vy = 0;

        // Reset das decisões dos goleiros
        gkRed.decisionMade = false;
        gkRed.decisionTargetY = null;
        gkBlue.decisionMade = false;
        gkBlue.decisionTargetY = null;
    }

    draw(ctx) {
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.beginPath();
        ctx.ellipse(
            this.x,
            this.y + this.radius - 1,
            this.radius,
            this.radius * 0.4,
            0, 0, Math.PI * 2
        );
        ctx.fill();

        if (ballImage.complete && ballImage.naturalWidth > 0) {
            const size = this.radius * 2;
            ctx.drawImage(
                ballImage,
                Math.round(this.x - this.radius),
                Math.round(this.y - this.radius),
                size,
                size
            );
        } else {
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#111';
            ctx.fillRect(Math.round(this.x) - 1, Math.round(this.y) - 1, 2, 2);
        }
    }
}

// ==========================================
// CENA
// ==========================================

const P1_CONTROLS = {
    up: 'w', down: 's', left: 'a', right: 'd',
    kickStrong: 'q', kickWeak: 'e', dash: 'f',
};

const P2_CONTROLS = {
    up: 'o', down: 'l', left: 'k', right: 'ç',
    kickStrong: 'p', kickWeak: 'i', dash: 'j',
};

const p1   = new Player(VIEW_W / 2 - 60, VIEW_H / 2, 'red',  P1_CONTROLS);
const p2   = new Player(VIEW_W / 2 + 60, VIEW_H / 2, 'blue', P2_CONTROLS);
const ball = new Ball(VIEW_W / 2, VIEW_H / 2);
const gkRed  = new Goalkeeper('red');
const gkBlue = new Goalkeeper('blue');

// ==========================================
// CAMPO
// ==========================================
function drawField(ctx) {
    ctx.fillStyle = '#3d6b3d';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    ctx.fillStyle = '#467a46';
    const stripeH = 16;
    for (let y = 0; y < VIEW_H; y += stripeH * 2) {
        ctx.fillRect(0, y, VIEW_W, stripeH);
    }

    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(
        FIELD_MARGIN + 0.5, FIELD_MARGIN + 0.5,
        VIEW_W - FIELD_MARGIN * 2 - 1,
        VIEW_H - FIELD_MARGIN * 2 - 1
    );

    ctx.beginPath();
    ctx.moveTo(VIEW_W / 2 + 0.5, FIELD_MARGIN);
    ctx.lineTo(VIEW_W / 2 + 0.5, VIEW_H - FIELD_MARGIN);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(VIEW_W / 2, VIEW_H / 2, 20, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeRect(FIELD_MARGIN + 0.5, AREA_TOP + 0.5, AREA_W, AREA_H - 1);
    ctx.strokeRect(VIEW_W - FIELD_MARGIN - AREA_W + 0.5, AREA_TOP + 0.5, AREA_W, AREA_H - 1);

    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillRect(FIELD_MARGIN - GOAL_DEPTH, GOAL_TOP, GOAL_DEPTH, GOAL_HEIGHT);
    ctx.fillStyle = '#e94b3c';
    ctx.fillRect(FIELD_MARGIN - 1, GOAL_TOP - 1, 2, GOAL_HEIGHT + 2);

    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillRect(VIEW_W - FIELD_MARGIN, GOAL_TOP, GOAL_DEPTH, GOAL_HEIGHT);
    ctx.fillStyle = '#3a86ff';
    ctx.fillRect(VIEW_W - FIELD_MARGIN - 1, GOAL_TOP - 1, 2, GOAL_HEIGHT + 2);
}

// ==========================================
// HUD
// ==========================================
function drawDashIndicator(ctx, actor, x, y) {
    const ready = actor.dashCooldown <= 0;
    const color = ready ? '#4ade80' : '#555';
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, 2, 0, Math.PI * 2);
    ctx.fill();
}

function drawHUD(ctx) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(VIEW_W / 2 - 44, 2, 88, 14);

    ctx.fillStyle = '#e94b3c';
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`${gameState.scoreRed}`, VIEW_W / 2 - 18, 12);

    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.fillText('x', VIEW_W / 2, 12);

    ctx.fillStyle = '#3a86ff';
    ctx.textAlign = 'left';
    ctx.fillText(`${gameState.scoreBlue}`, VIEW_W / 2 + 18, 12);
    ctx.textAlign = 'left';

    drawDashIndicator(ctx, p1, 6, 6);
    drawDashIndicator(ctx, p2, VIEW_W - 6, 6);

    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, VIEW_H - 12, VIEW_W, 12);

    ctx.fillStyle = '#e94b3c';
    ctx.font = '6px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('P1: WASD | Q forte | E fraco | F dash', 4, VIEW_H - 4);

    ctx.fillStyle = '#3a86ff';
    ctx.textAlign = 'right';
    ctx.fillText('P2: O K L Ç | P forte | I fraco | J dash', VIEW_W - 4, VIEW_H - 4);
    ctx.textAlign = 'left';

    if (gameState.goalPause > 0) {
        ctx.fillStyle = 'rgba(0,0,0,0.65)';
        ctx.fillRect(0, VIEW_H / 2 - 12, VIEW_W, 24);

        ctx.fillStyle = '#ffeb3b';
        ctx.font = 'bold 12px monospace';
        ctx.textAlign = 'center';

        const txt = gameState.lastScorer === 'red'
            ? 'P1 (VERMELHO) MARCOU!'
            : 'P2 (AZUL) MARCOU!';
        ctx.fillText(txt, VIEW_W / 2, VIEW_H / 2 + 4);
        ctx.textAlign = 'left';
    }
}

// ==========================================
// GAME LOOP
// ==========================================
let lastTime = performance.now();

function loop(now) {
    const dt = Math.min((now - lastTime) / 1000, MAX_DT);
    lastTime = now;

    if (gameState.goalPause > 0) {
        gameState.goalPause -= dt;
        if (gameState.goalPause <= 0) {
            gameState.goalPause = 0;
            gameState.lastScorer = null;
            resetPositions();
        }
    } else {
        p1.update(dt, ball);
        p2.update(dt, ball);
        p1.resolveCollision(p2);
        gkRed.update(dt, ball);
        gkBlue.update(dt, ball);
        ball.update(dt);
    }

    ctx.save();
    ctx.scale(PIXEL_SCALE, PIXEL_SCALE);

    drawField(ctx);
    ball.draw(ctx);
    gkRed.draw(ctx);
    gkBlue.draw(ctx);
    p1.draw(ctx);
    p2.draw(ctx);

    if (ball.owner === p1) {
        ctx.fillStyle = 'rgba(233,75,60,0.9)';
        ctx.font = '6px monospace';
        ctx.fillText('P1 (VERMELHO) COM A BOLA', 4, 16);
    } else if (ball.owner === p2) {
        ctx.fillStyle = 'rgba(58,134,255,0.9)';
        ctx.font = '6px monospace';
        ctx.fillText('P2 (AZUL) COM A BOLA', 4, 16);
    }

    drawHUD(ctx);
    ctx.restore();

    requestAnimationFrame(loop);
}

function startGame() {
    lastTime = performance.now();
    requestAnimationFrame(loop);
}