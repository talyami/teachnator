/* ============================================================================
   NEUROQUEST - WORLD 2: ORBIT MASTER
   Interactive Gravitational Slingshot Physics & Celestial Boss
   Teaches: Gravity, Mass, Distance, and Newton's Laws through space trajectory physics
============================================================================ */

class OrbitMasterWorld {
  constructor(containerId, onComplete) {
    this.container = typeof containerId === "string" ? document.getElementById(containerId) : containerId;
    this.onComplete = onComplete;
    this.phase = "slingshot"; // "slingshot" -> "boss" -> "victory"

    this.canvas = null;
    this.ctx = null;
    this.animFrame = null;

    // Physics entities
    this.planets = [];
    this.probe = null;
    this.rings = [];
    this.slingshotStart = { x: 120, y: 180 };
    this.dragEnd = null;
    this.isDragging = false;
    this.ringsCollected = 0;
    this.totalRings = 3;

    // Boss state
    this.bossHp = 300;
    this.bossQuestionIndex = 0;
  }

  start() {
    if (window.soundEngine) window.soundEngine.startBgm("space");
    this.renderIntro();
  }

  stop() {
    if (this.animFrame) cancelAnimationFrame(this.animFrame);
  }

  renderIntro() {
    this.container.innerHTML = `
      <div class="max-w-3xl mx-auto my-auto p-6 sm:p-8 rounded-3xl bg-slate-900/90 border-2 border-cyan-500/40 shadow-2xl text-center space-y-6 backdrop-blur-md animate-fade-in">
        <div class="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-mono text-xs font-bold uppercase tracking-wider">
          🚀 Cosmic Sector: Kepler Nebula
        </div>
        <h2 class="text-3xl sm:text-5xl font-extrabold font-brand tracking-wide bg-gradient-to-r from-cyan-300 via-indigo-300 to-amber-300 bg-clip-text text-transparent">
          ORBIT MASTER
        </h2>
        <div class="w-24 h-24 mx-auto rounded-3xl bg-cyan-950/60 border border-cyan-500/50 flex items-center justify-center text-5xl shadow-xl shadow-cyan-500/20 animate-bounce-slow">
          🪐
        </div>
        <p class="text-slate-300 text-sm sm:text-base max-w-xl mx-auto leading-relaxed">
          Deep space anomaly detected! Gravitational wells are bending space-time. 
          Use your launcher to slingshot the <strong class="text-cyan-300">Voyager Probe</strong> through the gravity rings of massive planets without crashing into their surfaces!
        </p>
        <button id="startOrbitBtn" class="px-8 py-4 rounded-2xl bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-500 hover:from-cyan-400 hover:to-indigo-400 text-slate-950 font-black font-brand text-lg tracking-wider shadow-lg shadow-cyan-500/30 transform active:scale-95 transition flex items-center gap-2 mx-auto">
          <span>ENTER GRAVITY LAUNCHPAD</span>
          <span>🚀</span>
        </button>
      </div>
    `;

    document.getElementById("startOrbitBtn").addEventListener("click", () => {
      if (window.soundEngine) window.soundEngine.playSfx("click");
      this.renderSlingshotScreen();
    });
  }

  renderSlingshotScreen() {
    this.phase = "slingshot";
    this.container.innerHTML = `
      <div class="w-full max-w-4xl mx-auto flex flex-col gap-4 animate-fade-in">
        <!-- Status Bar -->
        <div class="flex items-center justify-between p-4 rounded-2xl bg-slate-900/80 border border-slate-800">
          <div class="flex items-center gap-3">
            <span class="text-2xl">🪐</span>
            <div>
              <div class="text-xs font-mono text-slate-400 uppercase">Flight Path Objective</div>
              <div class="text-sm font-bold text-cyan-300">Slingshot through 3 Cosmic Rings</div>
            </div>
          </div>
          <div class="flex items-center gap-3 font-mono text-sm">
            <span class="text-amber-400 font-bold" id="ringsLabel">⭐ 0 / 3 Rings</span>
            <button id="resetProbeBtn" class="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition">
              🔄 Reset Probe
            </button>
          </div>
        </div>

        <!-- Interactive Gravity Canvas -->
        <div class="relative w-full rounded-3xl overflow-hidden border-2 border-cyan-500/40 bg-slate-950 shadow-2xl flex flex-col items-center">
          <canvas id="gravityCanvas" class="w-full h-80 sm:h-96 block cursor-grab active:cursor-grabbing"></canvas>

          <!-- Instructions Overlay -->
          <div class="absolute top-3 left-3 bg-slate-900/80 backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-800 text-[11px] font-mono text-cyan-300 pointer-events-none">
            🖱️ Click & Drag back on the launcher to aim velocity!
          </div>
        </div>

        <!-- Mass Configuration Tools -->
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div class="p-3 rounded-2xl bg-slate-900/70 border border-slate-800 text-center">
            <span class="text-xs font-mono text-cyan-300 font-bold block mb-1">Newton's Secret Law</span>
            <p class="text-[11px] text-slate-400">Greater planetary mass curves space-time more fiercely!</p>
          </div>
          <button id="planetMassSmallBtn" class="p-3 rounded-2xl bg-slate-900 hover:bg-slate-800 border border-cyan-500/40 text-cyan-300 font-bold font-mono text-xs flex items-center justify-center gap-2 active:scale-95 transition">
            <span>🌕 Moon Mass (Light Pull)</span>
          </button>
          <button id="planetMassGiantBtn" class="p-3 rounded-2xl bg-cyan-950/60 hover:bg-cyan-900 border border-cyan-400 text-cyan-200 font-bold font-mono text-xs flex items-center justify-center gap-2 active:scale-95 transition">
            <span>🪐 Gas Giant (Heavy Pull)</span>
          </button>
        </div>
      </div>
    `;

    this.initGravityCanvas();
    this.setupSlingshotControls();
  }

  initGravityCanvas() {
    this.canvas = document.getElementById("gravityCanvas");
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext("2d");

    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width || 800;
    this.canvas.height = rect.height || 360;

    this.slingshotStart = { x: 100, y: this.canvas.height / 2 };

    // Set up planets
    this.planets = [
      {
        x: this.canvas.width * 0.5,
        y: this.canvas.height * 0.5,
        radius: 36,
        mass: 3200,
        color: "#f59e0b",
        glow: "rgba(245, 158, 11, 0.4)",
        label: "Jupiter (Mass: 3200)"
      }
    ];

    // Set up collectible rings
    this.rings = [
      { x: this.canvas.width * 0.35, y: this.canvas.height * 0.25, radius: 18, collected: false },
      { x: this.canvas.width * 0.5, y: this.canvas.height * 0.85, radius: 18, collected: false },
      { x: this.canvas.width * 0.75, y: this.canvas.height * 0.4, radius: 18, collected: false }
    ];

    this.probe = null;
    this.ringsCollected = 0;

    // Mouse events for slingshot
    const getPos = (e) => {
      const cRect = this.canvas.getBoundingClientRect();
      const clientX = e.clientX || (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
      const clientY = e.clientY || (e.touches && e.touches[0] ? e.touches[0].clientY : 0);
      return { x: clientX - cRect.left, y: clientY - cRect.top };
    };

    const onDown = (e) => {
      const pos = getPos(e);
      const dist = Math.hypot(pos.x - this.slingshotStart.x, pos.y - this.slingshotStart.y);
      if (dist < 50) {
        this.isDragging = true;
        this.dragEnd = pos;
      }
    };

    const onMove = (e) => {
      if (this.isDragging) {
        this.dragEnd = getPos(e);
      }
    };

    const onUp = () => {
      if (this.isDragging && this.dragEnd) {
        this.isDragging = false;
        // Launch probe!
        const dx = this.slingshotStart.x - this.dragEnd.x;
        const dy = this.slingshotStart.y - this.dragEnd.y;
        this.probe = {
          x: this.slingshotStart.x,
          y: this.slingshotStart.y,
          vx: dx * 0.08,
          vy: dy * 0.08,
          trail: []
        };
        if (window.soundEngine) window.soundEngine.playSfx("laser");
        this.dragEnd = null;
      }
    };

    this.canvas.addEventListener("mousedown", onDown);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);

    this.canvas.addEventListener("touchstart", onDown);
    window.addEventListener("touchmove", onMove);
    window.addEventListener("touchend", onUp);

    const loop = () => {
      this.updatePhysics();
      this.draw();
      this.animFrame = requestAnimationFrame(loop);
    };
    this.animFrame = requestAnimationFrame(loop);
  }

  updatePhysics() {
    if (!this.probe) return;

    // Gravitational acceleration from each planet: a = G * M / r^2
    this.planets.forEach(p => {
      const dx = p.x - this.probe.x;
      const dy = p.y - this.probe.y;
      const dist = Math.hypot(dx, dy);

      if (dist > p.radius) {
        const force = p.mass / (dist * dist);
        this.probe.vx += (dx / dist) * force;
        this.probe.vy += (dy / dist) * force;
      } else {
        // Crash into planet!
        if (window.soundEngine) window.soundEngine.playSfx("hit");
        this.probe = null;
        return;
      }
    });

    if (!this.probe) return;

    this.probe.x += this.probe.vx;
    this.probe.y += this.probe.vy;

    // Leave particle trail
    this.probe.trail.push({ x: this.probe.x, y: this.probe.y });
    if (this.probe.trail.length > 50) this.probe.trail.shift();

    // Check collision with rings
    this.rings.forEach(r => {
      if (!r.collected && Math.hypot(this.probe.x - r.x, this.probe.y - r.y) < r.radius + 8) {
        r.collected = true;
        this.ringsCollected++;
        if (window.soundEngine) window.soundEngine.playSfx("collect");
        if (window.confetti) confetti({ particleCount: 30, spread: 50, origin: { y: 0.5 } });

        const label = document.getElementById("ringsLabel");
        if (label) label.textContent = `⭐ ${this.ringsCollected} / ${this.totalRings} Rings`;

        if (this.ringsCollected >= this.totalRings) {
          this.stop();
          setTimeout(() => this.renderBossIntro(), 800);
        }
      }
    });

    // Check if probe left bounds
    if (this.probe.x < -100 || this.probe.x > this.canvas.width + 100 ||
        this.probe.y < -100 || this.probe.y > this.canvas.height + 100) {
      this.probe = null;
    }
  }

  draw() {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;

    ctx.clearRect(0, 0, W, H);

    // Deep cosmos background
    const bgGrad = ctx.createRadialGradient(W / 2, H / 2, 50, W / 2, H / 2, W * 0.7);
    bgGrad.addColorStop(0, "#081026");
    bgGrad.addColorStop(1, "#030611");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    // Gravity field grid lines
    ctx.strokeStyle = "rgba(6, 182, 212, 0.08)";
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    for (let y = 0; y < H; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }

    // Draw Planets
    this.planets.forEach(p => {
      // Glow
      const pGrad = ctx.createRadialGradient(p.x, p.y, p.radius * 0.6, p.x, p.y, p.radius * 2);
      pGrad.addColorStop(0, p.glow);
      pGrad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = pGrad;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius * 2, 0, Math.PI * 2);
      ctx.fill();

      // Planet Sphere
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();

      // Atmosphere ring
      ctx.strokeStyle = "rgba(255,255,255,0.4)";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Label
      ctx.font = "bold 10px JetBrains Mono, monospace";
      ctx.fillStyle = "#cbd5e1";
      ctx.textAlign = "center";
      ctx.fillText(p.label, p.x, p.y + p.radius + 16);
    });

    // Draw Collectible Rings
    this.rings.forEach(r => {
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
      if (r.collected) {
        ctx.strokeStyle = "rgba(16, 185, 129, 0.4)";
        ctx.lineWidth = 2;
        ctx.stroke();
      } else {
        ctx.strokeStyle = "#38bdf8";
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.fillStyle = "rgba(56, 189, 248, 0.2)";
        ctx.fill();

        // Star inside
        ctx.font = "14px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("⭐", r.x, r.y);
      }
    });

    // Draw Slingshot Launcher
    ctx.fillStyle = "#38bdf8";
    ctx.beginPath();
    ctx.arc(this.slingshotStart.x, this.slingshotStart.y, 8, 0, Math.PI * 2);
    ctx.fill();

    // Aiming trajectory band
    if (this.isDragging && this.dragEnd) {
      ctx.strokeStyle = "rgba(251, 191, 36, 0.8)";
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(this.slingshotStart.x, this.slingshotStart.y);
      ctx.lineTo(this.dragEnd.x, this.dragEnd.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Predicted opposite velocity direction
      const dx = this.slingshotStart.x - this.dragEnd.x;
      const dy = this.slingshotStart.y - this.dragEnd.y;
      ctx.strokeStyle = "rgba(56, 189, 248, 0.6)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(this.slingshotStart.x, this.slingshotStart.y);
      ctx.lineTo(this.slingshotStart.x + dx * 1.5, this.slingshotStart.y + dy * 1.5);
      ctx.stroke();
    }

    // Draw Probe
    if (this.probe) {
      // Trail
      ctx.strokeStyle = "rgba(56, 189, 248, 0.4)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let i = 0; i < this.probe.trail.length; i++) {
        const pt = this.probe.trail[i];
        if (i === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      }
      ctx.stroke();

      // Probe head
      ctx.fillStyle = "#38bdf8";
      ctx.shadowColor = "#38bdf8";
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(this.probe.x, this.probe.y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  setupSlingshotControls() {
    const resetBtn = document.getElementById("resetProbeBtn");
    const smallBtn = document.getElementById("planetMassSmallBtn");
    const giantBtn = document.getElementById("planetMassGiantBtn");

    if (resetBtn) {
      resetBtn.addEventListener("click", () => {
        this.probe = null;
      });
    }

    smallBtn.addEventListener("click", () => {
      if (this.planets[0]) {
        this.planets[0].mass = 1200;
        this.planets[0].radius = 24;
        this.planets[0].color = "#94a3b8";
        this.planets[0].label = "Moon (Mass: 1200)";
      }
      if (window.soundEngine) window.soundEngine.playSfx("click");
    });

    giantBtn.addEventListener("click", () => {
      if (this.planets[0]) {
        this.planets[0].mass = 4500;
        this.planets[0].radius = 42;
        this.planets[0].color = "#f59e0b";
        this.planets[0].label = "Gas Giant (Mass: 4500)";
      }
      if (window.soundEngine) window.soundEngine.playSfx("click");
    });
  }

  // --- Boss Encounter ---
  renderBossIntro() {
    this.phase = "boss";
    this.container.innerHTML = `
      <div class="max-w-2xl mx-auto my-auto p-6 sm:p-8 rounded-3xl bg-slate-900 border-2 border-indigo-500/50 shadow-2xl text-center space-y-6 animate-fade-in">
        <div class="w-24 h-24 mx-auto rounded-3xl bg-indigo-950/60 border border-indigo-500 flex items-center justify-center text-5xl shadow-xl shadow-indigo-500/30 animate-pulse">
          🌌
        </div>
        <div class="space-y-1">
          <span class="text-xs font-mono uppercase text-indigo-400 font-bold tracking-widest">COSMIC ANOMALY DETECTED</span>
          <h3 class="text-3xl font-extrabold font-brand text-white">THE VOID SINGULARITY</h3>
          <p class="text-sm text-slate-300">
            A rogue black hole singularity is warping orbit space! Use Newton's Gravitational Laws to calculate and launch kinetic missiles into its event horizon!
          </p>
        </div>
        <button id="fightGravityBossBtn" class="px-8 py-3.5 rounded-2xl bg-gradient-to-r from-indigo-500 to-cyan-400 text-slate-950 font-brand font-black text-base shadow-xl active:scale-95 transition">
          ⚔️ ENGAGE SINGULARITY BATTLE
        </button>
      </div>
    `;

    document.getElementById("fightGravityBossBtn").addEventListener("click", () => {
      this.renderBossBattleScreen();
    });
  }

  renderBossBattleScreen() {
    this.bossHp = 300;
    this.bossQuestionIndex = 0;

    const questions = [
      {
        prompt: "The Singularity increases its gravitational pull on our starship! According to Newton, what property makes an object's gravitational pull stronger?",
        options: [
          { text: "Having greater Mass", correct: true },
          { text: "Having a brighter Color", correct: false },
          { text: "Spinning upside down", correct: false },
          { text: "Being made of plastic", correct: false }
        ]
      },
      {
        prompt: "Our probe moves further away into outer space. As distance between two objects increases, what happens to gravity?",
        options: [
          { text: "Gravity becomes weaker", correct: true },
          { text: "Gravity becomes infinite", correct: false },
          { text: "Gravity stays exactly the same", correct: false },
          { text: "Gravity turns into fire", correct: false }
        ]
      },
      {
        prompt: "Final Calculation! At what downward acceleration rate does Earth's gravity pull free-falling objects?",
        options: [
          { text: "9.8 m/s²", correct: true },
          { text: "100.0 m/s²", correct: false },
          { text: "0.5 m/s²", correct: false },
          { text: "Zero m/s²", correct: false }
        ]
      }
    ];

    this.renderBossQuestion(questions);
  }

  renderBossQuestion(questions) {
    if (this.bossQuestionIndex >= questions.length) {
      this.renderVictory();
      return;
    }

    const q = questions[this.bossQuestionIndex];

    this.container.innerHTML = `
      <div class="max-w-2xl mx-auto my-auto p-6 sm:p-8 rounded-3xl bg-slate-900 border-2 border-indigo-500/40 shadow-2xl flex flex-col gap-6 animate-fade-in">
        <div class="flex items-center justify-between border-b border-slate-800 pb-4">
          <div class="flex items-center gap-3">
            <div class="w-14 h-14 rounded-2xl bg-indigo-950/60 border border-indigo-500 flex items-center justify-center text-3xl animate-spin-slow">
              🌌
            </div>
            <div>
              <h3 class="text-lg font-bold font-brand text-white">The Void Singularity</h3>
              <div class="text-[10px] font-mono text-indigo-400">Gravitational Singularity Core</div>
            </div>
          </div>
          <div class="w-36 flex flex-col gap-1 items-end font-mono">
            <span class="text-xs text-indigo-300 font-bold">${this.bossHp} / 300 HP</span>
            <div class="w-full h-3 bg-slate-950 rounded-full border border-slate-800 overflow-hidden">
              <div class="h-full bg-gradient-to-r from-indigo-500 to-cyan-400 transition-all duration-300" style="width: ${(this.bossHp / 300) * 100}%"></div>
            </div>
          </div>
        </div>

        <div class="space-y-2">
          <span class="text-[11px] font-mono text-cyan-400 font-bold uppercase">🚀 Gravitational Strike #${this.bossQuestionIndex + 1}</span>
          <p class="text-base sm:text-lg font-bold text-slate-100 leading-snug">
            ${q.prompt}
          </p>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3" id="gravityBossGrid">
          ${q.options.map((opt) => `
            <button class="boss-opt-btn p-4 rounded-2xl bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 hover:border-cyan-400 text-sm font-bold text-slate-200 text-left transition flex items-center justify-between active:scale-98" data-correct="${opt.correct}">
              <span>${opt.text}</span>
              <span class="opacity-0 strike-icon text-lg">🚀</span>
            </button>
          `).join("")}
        </div>

        <div id="battleFeedback" class="h-10 rounded-xl flex items-center justify-center px-4 font-mono text-xs opacity-0 transition-opacity"></div>
      </div>
    `;

    document.querySelectorAll(".boss-opt-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const isCorrect = btn.getAttribute("data-correct") === "true";
        this.handleBossAnswer(btn, isCorrect, questions);
      });
    });
  }

  handleBossAnswer(btn, isCorrect, questions) {
    const fb = document.getElementById("battleFeedback");

    if (isCorrect) {
      if (window.soundEngine) window.soundEngine.playSfx("crit");
      if (window.confetti) confetti({ particleCount: 60, spread: 60, origin: { y: 0.6 } });

      btn.classList.add("border-cyan-400", "bg-cyan-950/80", "text-cyan-300");
      btn.querySelector(".strike-icon").classList.remove("opacity-0");

      this.bossHp = Math.max(0, this.bossHp - 100);

      fb.textContent = "DIRECT HIT! Gravitational kinetic wave destabilized the Singularity!";
      fb.className = "h-10 rounded-xl flex items-center justify-center px-4 font-mono text-xs bg-cyan-950 text-cyan-300 border border-cyan-800 opacity-100 transition-opacity";

      setTimeout(() => {
        this.bossQuestionIndex++;
        this.renderBossQuestion(questions);
      }, 1200);

    } else {
      if (window.soundEngine) window.soundEngine.playSfx("error");
      btn.classList.add("border-rose-500", "bg-rose-950/80", "text-rose-300");

      fb.textContent = "Trajectory drifted! Adjusting coordinates... fire next volley!";
      fb.className = "h-10 rounded-xl flex items-center justify-center px-4 font-mono text-xs bg-rose-950 text-rose-300 border border-rose-800 opacity-100 transition-opacity";

      setTimeout(() => {
        this.bossQuestionIndex++;
        this.renderBossQuestion(questions);
      }, 1200);
    }
  }

  renderVictory() {
    if (window.soundEngine) window.soundEngine.playSfx("victory");
    if (window.playerState) {
      window.playerState.recordWorldVictory("gravity", 1800, 3);
      window.playerState.unlockBadge({
        id: "orbit_master",
        name: "Orbit Navigator",
        icon: "🪐",
        desc: "Master of mass, trajectory, and Newtonian physics."
      });
    }

    this.container.innerHTML = `
      <div class="max-w-md mx-auto my-auto p-6 sm:p-8 rounded-3xl bg-slate-900 border-2 border-cyan-400/60 shadow-2xl text-center space-y-6 animate-fade-in">
        <div class="w-20 h-20 mx-auto rounded-3xl bg-gradient-to-tr from-cyan-400 to-indigo-500 flex items-center justify-center text-4xl shadow-xl shadow-cyan-500/20">
          🏆
        </div>
        <div class="space-y-1">
          <span class="text-xs font-mono uppercase text-cyan-400 font-bold tracking-widest">SINGULARITY CLOSED!</span>
          <h3 class="text-2xl font-black font-brand text-white">ORBIT MASTER COMPLETE!</h3>
          <p class="text-xs text-slate-400">
            The cosmic space lanes are clear! You now wield the invisible gravitational forces of the universe.
          </p>
        </div>

        <div class="grid grid-cols-2 gap-3 font-mono text-xs text-left">
          <div class="p-3 rounded-2xl bg-slate-800/80 border border-slate-700">
            <span class="text-slate-400 block text-[10px]">XP GAINED</span>
            <span class="text-amber-400 font-bold text-base">+120 XP</span>
          </div>
          <div class="p-3 rounded-2xl bg-slate-800/80 border border-slate-700">
            <span class="text-slate-400 block text-[10px]">LOOT FOUND</span>
            <span class="text-cyan-300 font-bold text-base">🧭 Graviton Compass</span>
          </div>
        </div>

        <button id="returnHubBtn" class="w-full py-3.5 rounded-2xl bg-gradient-to-r from-cyan-400 to-indigo-400 text-slate-950 font-brand font-black text-sm tracking-wider shadow-lg active:scale-95 transition">
          RETURN TO WORLD MAP →
        </button>
      </div>
    `;

    document.getElementById("returnHubBtn").addEventListener("click", () => {
      if (this.onComplete) this.onComplete();
    });
  }
}

window.OrbitMasterWorld = OrbitMasterWorld;
window.WorldGravity = {
  mount(container, onComplete) {
    const w = new OrbitMasterWorld(container, onComplete);
    w.start();
    window._activeGravity = w;
    return w;
  },
  destroy() {
    if (window._activeGravity) {
      window._activeGravity.stop();
      window._activeGravity = null;
    }
  }
};
