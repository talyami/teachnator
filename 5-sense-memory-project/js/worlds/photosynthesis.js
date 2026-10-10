/* ============================================================================
   NEUROQUEST - WORLD 1: THE SOLAR CITADEL
   Interactive Chloroplast Bio-Reactor Simulation & Boss Encounter
   Teaches: Photosynthesis (Light + H2O + CO2 -> Glucose + O2) through game mechanics
============================================================================ */

class SolarCitadelWorld {
  constructor(containerId, onComplete) {
    this.container = typeof containerId === "string" ? document.getElementById(containerId) : containerId;
    this.onComplete = onComplete;
    this.phase = "reactor"; // "reactor" -> "boss" -> "victory"
    this.score = 0;

    // Reactor State
    this.lightPower = 0; // 0 - 100
    this.waterPower = 0; // 0 - 100
    this.co2Power = 0;   // 0 - 100
    this.glucoseSynthesized = 0; // Goal: 3
    this.targetGlucose = 3;

    // Animation & Canvas
    this.canvas = null;
    this.ctx = null;
    this.animFrame = null;
    this.mirrorX = 250;
    this.photons = [];
    this.bubbles = [];
    this.gasClouds = [];

    // Boss State
    this.bossHp = 300;
    this.bossMaxHp = 300;
    this.playerHp = 100;
    this.bossQuestionIndex = 0;
  }

  start() {
    if (window.soundEngine) window.soundEngine.startBgm("citadel");
    this.renderIntro();
  }

  stop() {
    if (this.animFrame) cancelAnimationFrame(this.animFrame);
  }

  renderIntro() {
    this.container.innerHTML = `
      <div class="max-w-3xl mx-auto my-auto p-6 sm:p-8 rounded-3xl bg-slate-900/90 border-2 border-emerald-500/40 shadow-2xl text-center space-y-6 backdrop-blur-md animate-fade-in">
        <div class="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 font-mono text-xs font-bold uppercase tracking-wider">
          🌿 Sector Alpha: The Canopy Sanctum
        </div>
        <h2 class="text-3xl sm:text-5xl font-extrabold font-brand tracking-wide bg-gradient-to-r from-emerald-300 via-teal-200 to-amber-300 bg-clip-text text-transparent">
          THE SOLAR CITADEL
        </h2>
        <div class="w-24 h-24 mx-auto rounded-3xl bg-emerald-950/60 border border-emerald-500/50 flex items-center justify-center text-5xl shadow-xl shadow-emerald-500/20 animate-bounce-slow">
          🍃
        </div>
        <p class="text-slate-300 text-sm sm:text-base max-w-xl mx-auto leading-relaxed">
          The Tree of Solis is freezing! The Frost Phantom Malakor has blocked all life energy. 
          Step into the <strong class="text-emerald-400">Chloroplast Sun-Engine</strong>. Gather sunlight, pump water from the roots, and harvest carbon dioxide to forge <strong class="text-amber-300">Glucose Power Crystals</strong>!
        </p>
        <button id="startReactorBtn" class="px-8 py-4 rounded-2xl bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-400 hover:from-emerald-400 hover:to-cyan-300 text-slate-950 font-black font-brand text-lg tracking-wider shadow-lg shadow-emerald-500/30 transform active:scale-95 transition flex items-center gap-2 mx-auto">
          <span>OPERATE BIO-REACTOR</span>
          <span>⚡</span>
        </button>
      </div>
    `;

    document.getElementById("startReactorBtn").addEventListener("click", () => {
      if (window.soundEngine) window.soundEngine.playSfx("click");
      this.renderReactorScreen();
    });
  }

  renderReactorScreen() {
    this.phase = "reactor";
    this.container.innerHTML = `
      <div class="w-full max-w-4xl mx-auto flex flex-col gap-4 animate-fade-in">
        <!-- Status Bar -->
        <div class="flex items-center justify-between p-4 rounded-2xl bg-slate-900/80 border border-slate-800">
          <div class="flex items-center gap-3">
            <span class="text-2xl">⚡</span>
            <div>
              <div class="text-xs font-mono text-slate-400 uppercase">Mission Objective</div>
              <div class="text-sm font-bold text-emerald-300">Synthesize 3 Glucose Energy Crystals</div>
            </div>
          </div>
          <div class="flex items-center gap-2 font-mono text-sm">
            <span class="text-amber-400 font-bold" id="crystalsCount">💎 0 / 3 Crystals</span>
          </div>
        </div>

        <!-- Interactive Bio-Reactor Canvas -->
        <div class="relative w-full rounded-3xl overflow-hidden border-2 border-emerald-500/40 bg-slate-950 shadow-2xl flex flex-col items-center">
          <canvas id="reactorCanvas" class="w-full h-80 sm:h-96 block cursor-crosshair"></canvas>

          <!-- Real-Time Ingredient Gauges -->
          <div class="absolute bottom-3 left-3 right-3 grid grid-cols-3 gap-2 sm:gap-4 pointer-events-none">
            <!-- Sunlight Gauge -->
            <div class="p-2 sm:p-3 rounded-2xl bg-slate-900/90 border border-amber-500/50 flex flex-col gap-1 backdrop-blur-md">
              <div class="flex justify-between text-[11px] font-mono font-bold text-amber-300">
                <span>☀️ SUNLIGHT</span>
                <span id="lightPct">0%</span>
              </div>
              <div class="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                <div id="lightBar" class="h-full bg-amber-400 transition-all duration-100" style="width: 0%"></div>
              </div>
            </div>

            <!-- Water Gauge -->
            <div class="p-2 sm:p-3 rounded-2xl bg-slate-900/90 border border-cyan-500/50 flex flex-col gap-1 backdrop-blur-md">
              <div class="flex justify-between text-[11px] font-mono font-bold text-cyan-300">
                <span>💧 WATER (H₂O)</span>
                <span id="waterPct">0%</span>
              </div>
              <div class="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                <div id="waterBar" class="h-full bg-cyan-400 transition-all duration-100" style="width: 0%"></div>
              </div>
            </div>

            <!-- CO2 Gauge -->
            <div class="p-2 sm:p-3 rounded-2xl bg-slate-900/90 border border-purple-500/50 flex flex-col gap-1 backdrop-blur-md">
              <div class="flex justify-between text-[11px] font-mono font-bold text-purple-300">
                <span>💨 CO₂ GAS</span>
                <span id="co2Pct">0%</span>
              </div>
              <div class="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                <div id="co2Bar" class="h-full bg-purple-400 transition-all duration-100" style="width: 0%"></div>
              </div>
            </div>
          </div>
        </div>

        <!-- Reactor Action Controls -->
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div class="p-3 rounded-2xl bg-slate-900/70 border border-slate-800 text-center">
            <span class="text-xs font-mono text-amber-300 font-bold block mb-1">1. Move Mouse / Drag</span>
            <p class="text-[11px] text-slate-400">Aim the Solar Mirror to catch falling sun photons!</p>
          </div>
          <button id="pumpWaterBtn" class="p-3 rounded-2xl bg-cyan-950/60 hover:bg-cyan-900 border border-cyan-500/50 text-cyan-300 font-bold font-mono text-xs flex items-center justify-center gap-2 active:scale-95 transition">
            <span>💧 PUMP ROOT WATER</span>
          </button>
          <button id="harvestCo2Btn" class="p-3 rounded-2xl bg-purple-950/60 hover:bg-purple-900 border border-purple-500/50 text-purple-300 font-bold font-mono text-xs flex items-center justify-center gap-2 active:scale-95 transition">
            <span>💨 OPEN LEAF STOMATA (CO₂)</span>
          </button>
        </div>

        <!-- Synthesis Core Release Button -->
        <button id="synthesizeBtn" class="w-full py-4 rounded-2xl bg-slate-800 text-slate-500 font-brand font-black text-base tracking-wider cursor-not-allowed transition flex items-center justify-center gap-2 shadow-xl" disabled>
          <span>⚗️ SYNTHESIZE GLUCOSE CRYSTAL</span>
          <span id="synthNotice">(Fill all 3 chambers to 100%)</span>
        </button>
      </div>
    `;

    this.initCanvasGame();
    this.setupReactorEvents();
  }

  initCanvasGame() {
    this.canvas = document.getElementById("reactorCanvas");
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext("2d");

    // Handle high DPI
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width || 800;
    this.canvas.height = rect.height || 360;
    this.mirrorX = this.canvas.width / 2;

    // Track mouse / touch
    const updateMirror = (clientX) => {
      const cRect = this.canvas.getBoundingClientRect();
      const x = clientX - cRect.left;
      this.mirrorX = Math.max(50, Math.min(this.canvas.width - 50, x));
    };

    this.canvas.addEventListener("mousemove", (e) => updateMirror(e.clientX));
    this.canvas.addEventListener("touchmove", (e) => {
      if (e.touches[0]) updateMirror(e.touches[0].clientX);
    });

    // Populate particles
    this.photons = [];
    this.bubbles = [];
    this.gasClouds = [];

    const loop = () => {
      this.updatePhysics();
      this.drawCanvas();
      this.animFrame = requestAnimationFrame(loop);
    };
    this.animFrame = requestAnimationFrame(loop);
  }

  updatePhysics() {
    const W = this.canvas.width;
    const H = this.canvas.height;

    // Spawn photons from sun
    if (Math.random() < 0.15) {
      this.photons.push({
        x: Math.random() * (W - 40) + 20,
        y: 10,
        vx: (Math.random() - 0.5) * 1.5,
        vy: 2.5 + Math.random() * 2,
        r: 6
      });
    }

    // Update photons
    for (let i = this.photons.length - 1; i >= 0; i--) {
      const p = this.photons[i];
      p.x += p.vx;
      p.y += p.vy;

      // Check collision with mirror
      if (p.y >= H - 100 && p.y <= H - 80 && Math.abs(p.x - this.mirrorX) < 45) {
        // Captured!
        this.lightPower = Math.min(100, this.lightPower + 8);
        if (window.soundEngine) window.soundEngine.playSfx("collect");
        this.photons.splice(i, 1);
        continue;
      }

      if (p.y > H) {
        this.photons.splice(i, 1);
      }
    }

    // Update bubbles
    for (let i = this.bubbles.length - 1; i >= 0; i--) {
      const b = this.bubbles[i];
      b.y -= b.vy;
      b.x += Math.sin(b.y * 0.05) * 0.8;
      if (b.y < H / 2) {
        this.bubbles.splice(i, 1);
      }
    }

    // Update gas clouds
    for (let i = this.gasClouds.length - 1; i >= 0; i--) {
      const g = this.gasClouds[i];
      g.x += g.vx;
      if (g.x > W + 40 || g.x < -40) {
        this.gasClouds.splice(i, 1);
      }
    }

    // Update gauges DOM
    this.updateGaugesDom();
  }

  drawCanvas() {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;

    ctx.clearRect(0, 0, W, H);

    // Background gradient: Chloroplast interior
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, "#06221d");
    grad.addColorStop(0.5, "#0b392e");
    grad.addColorStop(1, "#041512");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Glowing Central Core (Thylakoid Chamber)
    const coreGrad = ctx.createRadialGradient(W / 2, H / 2, 10, W / 2, H / 2, 120);
    const alpha = (this.lightPower + this.waterPower + this.co2Power) / 300;
    coreGrad.addColorStop(0, `rgba(52, 211, 153, ${0.3 + alpha * 0.6})`);
    coreGrad.addColorStop(1, "rgba(5, 150, 105, 0)");
    ctx.fillStyle = coreGrad;
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, 120, 0, Math.PI * 2);
    ctx.fill();

    // Core Label
    ctx.font = "bold 12px JetBrains Mono, monospace";
    ctx.fillStyle = "rgba(167, 243, 208, 0.8)";
    ctx.textAlign = "center";
    ctx.fillText("CHLOROPLAST REACTOR CORE", W / 2, H / 2 - 10);
    ctx.font = "10px JetBrains Mono, monospace";
    ctx.fillStyle = "rgba(110, 231, 183, 0.6)";
    ctx.fillText("Formula: 6 CO₂ + 6 H₂O + Light ➔ C₆H₁₂O₆ + 6 O₂", W / 2, H / 2 + 12);

    // Draw Photons (Sunlight)
    this.photons.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = "#fbbf24";
      ctx.shadowColor = "#f59e0b";
      ctx.shadowBlur = 10;
      ctx.fill();
      ctx.shadowBlur = 0;
    });

    // Draw Mirror / Collector Paddle
    ctx.save();
    ctx.translate(this.mirrorX, H - 90);
    ctx.fillStyle = "#10b981";
    ctx.strokeStyle = "#34d399";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(-45, -8, 90, 16, 8);
    ctx.fill();
    ctx.stroke();
    // Glowing prism crystal
    ctx.fillStyle = "#fef08a";
    ctx.beginPath();
    ctx.arc(0, 0, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Draw Bubbles (Water)
    this.bubbles.forEach(b => {
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(56, 189, 248, 0.6)";
      ctx.strokeStyle = "#38bdf8";
      ctx.stroke();
      ctx.fill();
    });

    // Draw Gas Clouds (CO2)
    this.gasClouds.forEach(g => {
      ctx.beginPath();
      ctx.arc(g.x, g.y, g.r, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(192, 132, 252, 0.4)";
      ctx.fill();
    });
  }

  updateGaugesDom() {
    const lightBar = document.getElementById("lightBar");
    const waterBar = document.getElementById("waterBar");
    const co2Bar = document.getElementById("co2Bar");
    const synthBtn = document.getElementById("synthesizeBtn");
    const synthNotice = document.getElementById("synthNotice");

    if (lightBar) {
      lightBar.style.width = `${this.lightPower}%`;
      document.getElementById("lightPct").textContent = `${Math.floor(this.lightPower)}%`;
    }
    if (waterBar) {
      waterBar.style.width = `${this.waterPower}%`;
      document.getElementById("waterPct").textContent = `${Math.floor(this.waterPower)}%`;
    }
    if (co2Bar) {
      co2Bar.style.width = `${this.co2Power}%`;
      document.getElementById("co2Pct").textContent = `${Math.floor(this.co2Power)}%`;
    }

    const ready = this.lightPower >= 95 && this.waterPower >= 95 && this.co2Power >= 95;
    if (synthBtn) {
      if (ready) {
        synthBtn.disabled = false;
        synthBtn.className = "w-full py-4 rounded-2xl bg-gradient-to-r from-amber-400 via-emerald-400 to-cyan-400 hover:from-amber-300 hover:to-cyan-300 text-slate-950 font-brand font-black text-base tracking-wider cursor-pointer shadow-xl shadow-emerald-500/30 animate-pulse transition flex items-center justify-center gap-2";
        synthNotice.textContent = "⚡ ALL INGREDIENTS CHARGED! PULL LEVER!";
      } else {
        synthBtn.disabled = true;
        synthBtn.className = "w-full py-4 rounded-2xl bg-slate-800 text-slate-500 font-brand font-black text-base tracking-wider cursor-not-allowed transition flex items-center justify-center gap-2 shadow-xl";
        synthNotice.textContent = "(Fill all 3 chambers to 100%)";
      }
    }
  }

  setupReactorEvents() {
    const pumpWaterBtn = document.getElementById("pumpWaterBtn");
    const harvestCo2Btn = document.getElementById("harvestCo2Btn");
    const synthBtn = document.getElementById("synthesizeBtn");

    pumpWaterBtn.addEventListener("click", () => {
      this.waterPower = Math.min(100, this.waterPower + 25);
      if (window.soundEngine) window.soundEngine.playSfx("bubble");

      // Spawn bubbles on canvas
      for (let i = 0; i < 4; i++) {
        this.bubbles.push({
          x: Math.random() * (this.canvas.width - 60) + 30,
          y: this.canvas.height - 20,
          vy: 2 + Math.random() * 2,
          r: 8 + Math.random() * 6
        });
      }
    });

    harvestCo2Btn.addEventListener("click", () => {
      this.co2Power = Math.min(100, this.co2Power + 25);
      if (window.soundEngine) window.soundEngine.playSfx("laser");

      // Spawn CO2 clouds
      for (let i = 0; i < 3; i++) {
        this.gasClouds.push({
          x: Math.random() < 0.5 ? -20 : this.canvas.width + 20,
          y: Math.random() * (this.canvas.height / 2) + 40,
          vx: (Math.random() - 0.5) * 3,
          r: 20 + Math.random() * 15
        });
      }
    });

    synthBtn.addEventListener("click", () => {
      if (this.lightPower < 95 || this.waterPower < 95 || this.co2Power < 95) return;

      this.glucoseSynthesized++;
      this.lightPower = 0;
      this.waterPower = 0;
      this.co2Power = 0;

      if (window.soundEngine) window.soundEngine.playSfx("powerup");
      if (window.confetti) {
        confetti({ particleCount: 70, spread: 70, origin: { y: 0.6 } });
      }

      const crystalLabel = document.getElementById("crystalsCount");
      if (crystalLabel) {
        crystalLabel.textContent = `💎 ${this.glucoseSynthesized} / ${this.targetGlucose} Crystals`;
      }

      if (this.glucoseSynthesized >= this.targetGlucose) {
        // Complete reactor phase, advance to Boss!
        this.stop();
        setTimeout(() => this.renderBossIntro(), 800);
      }
    });
  }

  // --- Boss Encounter ---
  renderBossIntro() {
    this.phase = "boss";
    this.container.innerHTML = `
      <div class="max-w-2xl mx-auto my-auto p-6 sm:p-8 rounded-3xl bg-slate-900 border-2 border-rose-500/50 shadow-2xl text-center space-y-6 animate-fade-in">
        <div class="w-24 h-24 mx-auto rounded-3xl bg-rose-950/60 border border-rose-500 flex items-center justify-center text-5xl shadow-xl shadow-rose-500/30 animate-bounce">
          ❄️
        </div>
        <div class="space-y-1">
          <span class="text-xs font-mono uppercase text-rose-400 font-bold tracking-widest">BOSS WARNING DETECTED</span>
          <h3 class="text-3xl font-extrabold font-brand text-white">MALAKOR, THE FROST PHANTOM</h3>
          <p class="text-sm text-slate-300">
            Malakor attacks with absolute zero ice! Use your newly forged <strong class="text-amber-300">Glucose Solar Cannon</strong> to strike his elemental weaknesses!
          </p>
        </div>
        <button id="fightBossBtn" class="px-8 py-3.5 rounded-2xl bg-gradient-to-r from-rose-500 to-amber-500 text-slate-950 font-brand font-black text-base shadow-xl active:scale-95 transition">
          ⚔️ ENGAGE BOSS BATTLE
        </button>
      </div>
    `;

    document.getElementById("fightBossBtn").addEventListener("click", () => {
      this.renderBossBattleScreen();
    });
  }

  renderBossBattleScreen() {
    this.bossHp = 300;
    this.bossQuestionIndex = 0;

    const questions = [
      {
        prompt: "Malakor freezes your leaf surfaces! What green pigment inside plant cells must absorb sunlight photons to restart the fire?",
        options: [
          { text: "Chlorophyll", correct: true },
          { text: "Hemoglobin", correct: false },
          { text: "Melanin", correct: false },
          { text: "Keratin", correct: false }
        ]
      },
      {
        prompt: "Malakor sucks away all atmosphere! Which gas must the leaf's microscopic stomata breathe in to bake sugar?",
        options: [
          { text: "Carbon Dioxide (CO₂)", correct: true },
          { text: "Pure Helium (He)", correct: false },
          { text: "Methane Gas (CH₄)", correct: false },
          { text: "Carbon Monoxide (CO)", correct: false }
        ]
      },
      {
        prompt: "Ultimate Strike! When Sunlight, Water, and Carbon Dioxide react together, what sweet energy food is created?",
        options: [
          { text: "Glucose Sugar Fuel", correct: true },
          { text: "Table Salt", correct: false },
          { text: "Sand Crystals", correct: false },
          { text: "Iron Dust", correct: false }
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
    const pet = window.playerState ? window.playerState.getPets()[window.playerState.activePet] : { icon: "🦊", name: "Ignis" };

    this.container.innerHTML = `
      <div class="max-w-2xl mx-auto my-auto p-6 sm:p-8 rounded-3xl bg-slate-900 border-2 border-rose-500/40 shadow-2xl flex flex-col gap-6 animate-fade-in">
        <!-- Boss Banner & HP -->
        <div class="flex items-center justify-between border-b border-slate-800 pb-4">
          <div class="flex items-center gap-3">
            <div class="w-14 h-14 rounded-2xl bg-rose-950/60 border border-rose-500 flex items-center justify-center text-3xl animate-pulse">
              ❄️
            </div>
            <div>
              <h3 class="text-lg font-bold font-brand text-white">Malakor the Frost Phantom</h3>
              <div class="text-[10px] font-mono text-rose-400">Vulnerable to Photosynthetic Beams</div>
            </div>
          </div>
          <!-- HP Bar -->
          <div class="w-36 flex flex-col gap-1 items-end font-mono">
            <span class="text-xs text-rose-300 font-bold">${this.bossHp} / 300 HP</span>
            <div class="w-full h-3 bg-slate-950 rounded-full border border-slate-800 overflow-hidden">
              <div class="h-full bg-gradient-to-r from-rose-500 to-amber-500 transition-all duration-300" style="width: ${(this.bossHp / 300) * 100}%"></div>
            </div>
          </div>
        </div>

        <!-- Question Prompt -->
        <div class="space-y-2">
          <span class="text-[11px] font-mono text-amber-400 font-bold uppercase">⚡ Solar Strike Rune #${this.bossQuestionIndex + 1}</span>
          <p class="text-base sm:text-lg font-bold text-slate-100 leading-snug">
            ${q.prompt}
          </p>
        </div>

        <!-- Answers Grid -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3" id="bossAnswersGrid">
          ${q.options.map((opt, idx) => `
            <button class="boss-opt-btn p-4 rounded-2xl bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 hover:border-amber-400 text-sm font-bold text-slate-200 text-left transition flex items-center justify-between active:scale-98" data-correct="${opt.correct}">
              <span>${opt.text}</span>
              <span class="opacity-0 strike-icon text-lg">⚡</span>
            </button>
          `).join("")}
        </div>

        <!-- Feedback & Pet Assist Bar -->
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

      btn.classList.add("border-emerald-400", "bg-emerald-950/80", "text-emerald-300");
      btn.querySelector(".strike-icon").classList.remove("opacity-0");

      this.bossHp = Math.max(0, this.bossHp - 100);

      fb.textContent = "CRITICAL HIT! Glucose Solar Beam blasted Malakor!";
      fb.className = "h-10 rounded-xl flex items-center justify-center px-4 font-mono text-xs bg-emerald-950 text-emerald-300 border border-emerald-800 opacity-100 transition-opacity";

      setTimeout(() => {
        this.bossQuestionIndex++;
        this.renderBossQuestion(questions);
      }, 1200);

    } else {
      if (window.soundEngine) window.soundEngine.playSfx("error");
      btn.classList.add("border-rose-500", "bg-rose-950/80", "text-rose-300");

      fb.textContent = "Glancing beam! Malakor shields... recharge and strike!";
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
      window.playerState.recordWorldVictory("photosynthesis", 1500, 3);
      window.playerState.unlockBadge({
        id: "solar_knight",
        name: "Solar Architect",
        icon: "🌿",
        desc: "Master of photosynthesis and life-giving energy."
      });
    }

    this.container.innerHTML = `
      <div class="max-w-md mx-auto my-auto p-6 sm:p-8 rounded-3xl bg-slate-900 border-2 border-emerald-400/60 shadow-2xl text-center space-y-6 animate-fade-in">
        <div class="w-20 h-20 mx-auto rounded-3xl bg-gradient-to-tr from-amber-400 to-emerald-400 flex items-center justify-center text-4xl shadow-xl shadow-emerald-500/20">
          🏆
        </div>
        <div class="space-y-1">
          <span class="text-xs font-mono uppercase text-emerald-400 font-bold tracking-widest">MALAKOR BANISHED!</span>
          <h3 class="text-2xl font-black font-brand text-white">THE SOLAR CITADEL IS SAVED!</h3>
          <p class="text-xs text-slate-400">
            The Tree of Solis glows bright green once more. You have mastered the formula of life!
          </p>
        </div>

        <!-- Loot Drops -->
        <div class="grid grid-cols-2 gap-3 font-mono text-xs text-left">
          <div class="p-3 rounded-2xl bg-slate-800/80 border border-slate-700">
            <span class="text-slate-400 block text-[10px]">XP GAINED</span>
            <span class="text-amber-400 font-bold text-base">+120 XP</span>
          </div>
          <div class="p-3 rounded-2xl bg-slate-800/80 border border-slate-700">
            <span class="text-slate-400 block text-[10px]">LOOT FOUND</span>
            <span class="text-emerald-300 font-bold text-base">💎 Glucose Core</span>
          </div>
        </div>

        <button id="returnHubBtn" class="w-full py-3.5 rounded-2xl bg-gradient-to-r from-emerald-400 to-cyan-400 text-slate-950 font-brand font-black text-sm tracking-wider shadow-lg active:scale-95 transition">
          RETURN TO WORLD MAP →
        </button>
      </div>
    `;

    document.getElementById("returnHubBtn").addEventListener("click", () => {
      if (this.onComplete) this.onComplete();
    });
  }
}

window.SolarCitadelWorld = SolarCitadelWorld;
window.WorldPhotosynthesis = {
  mount(container, onComplete) {
    const w = new SolarCitadelWorld(container, onComplete);
    w.start();
    window._activeCitadel = w;
    return w;
  },
  destroy() {
    if (window._activeCitadel) {
      window._activeCitadel.stop();
      window._activeCitadel = null;
    }
  }
};
