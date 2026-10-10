/* ============================================================================
   NEUROQUEST: CUSTOM AI DUNGEON RUNNER
   Plays an AI-generated or custom syllabus dungeon
============================================================================ */

class CustomAiDungeonWorld {
  constructor(containerId, questData, onComplete) {
    this.container = typeof containerId === "string" ? document.getElementById(containerId) : containerId;
    this.quest = questData;
    this.onComplete = onComplete;
    this.phase = "puzzle"; // "puzzle" -> "boss" -> "victory"

    this.nodesActivated = [false, false, false];
    this.bossHp = 300;
    this.bossQuestionIndex = 0;
  }

  start() {
    if (window.soundEngine) window.soundEngine.startBgm("citadel");
    this.renderIntro();
  }

  renderIntro() {
    this.container.innerHTML = `
      <div class="max-w-3xl mx-auto my-auto p-6 sm:p-8 rounded-3xl bg-slate-900/90 border-2 border-purple-500/40 shadow-2xl text-center space-y-6 backdrop-blur-md animate-fade-in">
        <div class="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/40 font-mono text-xs font-bold uppercase tracking-wider">
          ${this.quest.icon || "⚡"} ${this.quest.sector || "Uncharted Dungeon"}
        </div>
        <h2 class="text-3xl sm:text-5xl font-extrabold font-brand tracking-wide bg-gradient-to-r from-purple-400 via-pink-300 to-amber-300 bg-clip-text text-transparent">
          ${this.quest.title}
        </h2>
        <div class="w-24 h-24 mx-auto rounded-3xl bg-purple-950/60 border border-purple-500/50 flex items-center justify-center text-5xl shadow-xl shadow-purple-500/20 animate-bounce-slow">
          ${this.quest.icon || "🔮"}
        </div>
        <p class="text-slate-300 text-sm sm:text-base max-w-xl mx-auto leading-relaxed">
          ${this.quest.story}
        </p>
        <button id="startAiPuzzleBtn" class="px-8 py-4 rounded-2xl bg-gradient-to-r from-purple-500 via-pink-500 to-amber-400 hover:from-purple-400 hover:to-amber-300 text-slate-950 font-black font-brand text-lg tracking-wider shadow-lg shadow-purple-500/30 transform active:scale-95 transition flex items-center gap-2 mx-auto">
          <span>ENTER PUZZLE CHAMBER</span>
          <span>⚡</span>
        </button>
      </div>
    `;

    document.getElementById("startAiPuzzleBtn").addEventListener("click", () => {
      if (window.soundEngine) window.soundEngine.playSfx("click");
      this.renderPuzzleScreen();
    });
  }

  renderPuzzleScreen() {
    this.phase = "puzzle";
    const p = this.quest.puzzleMechanic || { name: "Rune Matrix", instruction: "Activate all 3 nodes!", items: [] };

    this.container.innerHTML = `
      <div class="w-full max-w-3xl mx-auto flex flex-col gap-6 animate-fade-in">
        <!-- Status Bar -->
        <div class="flex items-center justify-between p-4 rounded-2xl bg-slate-900/80 border border-slate-800">
          <div>
            <div class="text-xs font-mono text-slate-400 uppercase">${p.name}</div>
            <div class="text-sm font-bold text-purple-300">${p.instruction}</div>
          </div>
          <span class="text-amber-400 font-mono font-bold" id="puzzleProgressLabel">0 / 3 Nodes Locked</span>
        </div>

        <!-- 3 Interactive Puzzle Nodes -->
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4" id="puzzleNodesContainer">
          ${p.items.map((item, idx) => `
            <div class="p-5 rounded-3xl bg-slate-900/90 border-2 border-slate-700 hover:border-purple-400 flex flex-col justify-between gap-4 transition cursor-pointer puzzle-node-card active:scale-95" data-index="${idx}">
              <div class="space-y-1">
                <span class="w-8 h-8 rounded-xl bg-purple-950 text-purple-300 border border-purple-800 flex items-center justify-center font-mono font-bold text-sm">
                  #${idx + 1}
                </span>
                <h4 class="text-base font-bold font-brand text-white pt-2">${item.label}</h4>
                <p class="text-xs text-slate-400 leading-relaxed">${item.desc}</p>
              </div>
              <button class="w-full py-2.5 rounded-xl bg-slate-800 text-purple-300 text-xs font-bold font-mono transition node-activate-btn">
                ⚡ TAP TO CHARGE
              </button>
            </div>
          `).join("")}
        </div>

        <button id="openBossPortalBtn" class="w-full py-4 rounded-2xl bg-slate-800 text-slate-500 font-brand font-black text-base cursor-not-allowed transition flex items-center justify-center gap-2 shadow-xl" disabled>
          <span>🌀 OPEN BOSS PORTAL (CHARGE ALL 3 NODES)</span>
        </button>
      </div>
    `;

    document.querySelectorAll(".puzzle-node-card").forEach(card => {
      card.addEventListener("click", () => {
        const idx = parseInt(card.getAttribute("data-index"));
        this.nodesActivated[idx] = true;
        card.classList.replace("border-slate-700", "border-purple-400");
        card.classList.add("bg-purple-950/40");
        card.querySelector(".node-activate-btn").textContent = "✓ FULLY CHARGED";
        card.querySelector(".node-activate-btn").className = "w-full py-2.5 rounded-xl bg-purple-600 text-white text-xs font-bold font-mono transition";

        if (window.soundEngine) window.soundEngine.playSfx("collect");
        this.checkPuzzleProgress();
      });
    });
  }

  checkPuzzleProgress() {
    const charged = this.nodesActivated.filter(Boolean).length;
    document.getElementById("puzzleProgressLabel").textContent = `${charged} / 3 Nodes Locked`;

    if (charged === 3) {
      const btn = document.getElementById("openBossPortalBtn");
      btn.disabled = false;
      btn.className = "w-full py-4 rounded-2xl bg-gradient-to-r from-purple-500 to-pink-500 text-slate-950 font-brand font-black text-base cursor-pointer shadow-xl shadow-purple-500/30 animate-pulse transition flex items-center justify-center gap-2";
      btn.innerHTML = "<span>🌀 BOSS PORTAL UNLOCKED → ENGAGE!</span>";

      btn.addEventListener("click", () => {
        if (window.soundEngine) window.soundEngine.playSfx("powerup");
        this.renderBossScreen();
      });
    }
  }

  renderBossScreen() {
    this.phase = "boss";
    this.bossHp = 300;
    this.bossQuestionIndex = 0;
    const questions = this.quest.boss.questions || [];
    this.renderBossQuestion(questions);
  }

  renderBossQuestion(questions) {
    if (this.bossQuestionIndex >= questions.length) {
      this.renderVictory();
      return;
    }

    const q = questions[this.bossQuestionIndex];
    const b = this.quest.boss;

    this.container.innerHTML = `
      <div class="max-w-2xl mx-auto my-auto p-6 sm:p-8 rounded-3xl bg-slate-900 border-2 border-purple-500/40 shadow-2xl flex flex-col gap-6 animate-fade-in">
        <div class="flex items-center justify-between border-b border-slate-800 pb-4">
          <div class="flex items-center gap-3">
            <div class="w-14 h-14 rounded-2xl bg-purple-950/60 border border-purple-500 flex items-center justify-center text-3xl">
              ${b.icon || "👾"}
            </div>
            <div>
              <h3 class="text-lg font-bold font-brand text-white">${b.name}</h3>
              <div class="text-[10px] font-mono text-purple-400">Rift Dungeon Boss</div>
            </div>
          </div>
          <div class="w-36 flex flex-col gap-1 items-end font-mono">
            <span class="text-xs text-purple-300 font-bold">${this.bossHp} / 300 HP</span>
            <div class="w-full h-3 bg-slate-950 rounded-full border border-slate-800 overflow-hidden">
              <div class="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-300" style="width: ${(this.bossHp / 300) * 100}%"></div>
            </div>
          </div>
        </div>

        <div class="space-y-2">
          <span class="text-[11px] font-mono text-purple-400 font-bold uppercase">⚡ Strike Spell #${this.bossQuestionIndex + 1}</span>
          <p class="text-base sm:text-lg font-bold text-slate-100 leading-snug">
            ${q.prompt}
          </p>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3" id="aiBossGrid">
          ${q.options.map((opt) => `
            <button class="boss-opt-btn p-4 rounded-2xl bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 hover:border-purple-400 text-sm font-bold text-slate-200 text-left transition flex items-center justify-between active:scale-98" data-correct="${opt.correct}">
              <span>${opt.text}</span>
              <span class="opacity-0 strike-icon text-lg">⚡</span>
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

      btn.classList.add("border-purple-400", "bg-purple-950/80", "text-purple-300");
      btn.querySelector(".strike-icon").classList.remove("opacity-0");

      this.bossHp = Math.max(0, this.bossHp - 100);

      fb.textContent = "CRITICAL SPELL HIT! The Boss staggers backwards!";
      fb.className = "h-10 rounded-xl flex items-center justify-center px-4 font-mono text-xs bg-purple-950 text-purple-300 border border-purple-800 opacity-100 transition-opacity";

      setTimeout(() => {
        this.bossQuestionIndex++;
        this.renderBossQuestion(questions);
      }, 1200);

    } else {
      if (window.soundEngine) window.soundEngine.playSfx("error");
      btn.classList.add("border-rose-500", "bg-rose-950/80", "text-rose-300");

      fb.textContent = "Spell dissipated! Focus your knowledge and strike again!";
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
      window.playerState.addXp(150);
      window.playerState.addCoins(50);
      window.playerState.unlockBadge({
        id: "dungeon_slayer_" + Date.now(),
        name: `${this.quest.title} Victor`,
        icon: this.quest.icon || "🏆",
        desc: `Conquered the AI Dungeon: ${this.quest.title}`
      });
    }

    this.container.innerHTML = `
      <div class="max-w-md mx-auto my-auto p-6 sm:p-8 rounded-3xl bg-slate-900 border-2 border-purple-400/60 shadow-2xl text-center space-y-6 animate-fade-in">
        <div class="w-20 h-20 mx-auto rounded-3xl bg-gradient-to-tr from-purple-400 to-pink-500 flex items-center justify-center text-4xl shadow-xl shadow-purple-500/20">
          🏆
        </div>
        <div class="space-y-1">
          <span class="text-xs font-mono uppercase text-purple-400 font-bold tracking-widest">DUNGEON CLEARED!</span>
          <h3 class="text-2xl font-black font-brand text-white">${this.quest.title} COMPLETE!</h3>
          <p class="text-xs text-slate-400">
            You conquered this curriculum raid. The concepts are now permanently etched into your long-term memory!
          </p>
        </div>

        <div class="grid grid-cols-2 gap-3 font-mono text-xs text-left">
          <div class="p-3 rounded-2xl bg-slate-800/80 border border-slate-700">
            <span class="text-slate-400 block text-[10px]">XP GAINED</span>
            <span class="text-amber-400 font-bold text-base">+150 XP</span>
          </div>
          <div class="p-3 rounded-2xl bg-slate-800/80 border border-slate-700">
            <span class="text-slate-400 block text-[10px]">LOOT FOUND</span>
            <span class="text-purple-300 font-bold text-base">⭐ Chrono Relic</span>
          </div>
        </div>

        <button id="returnHubBtn" class="w-full py-3.5 rounded-2xl bg-gradient-to-r from-purple-400 to-pink-400 text-slate-950 font-brand font-black text-sm tracking-wider shadow-lg active:scale-95 transition">
          RETURN TO WORLD MAP →
        </button>
      </div>
    `;

    document.getElementById("returnHubBtn").addEventListener("click", () => {
      if (this.onComplete) this.onComplete();
    });
  }
}

window.CustomAiDungeonWorld = CustomAiDungeonWorld;
window.WorldAiDungeon = {
  mount(container, questData, onComplete) {
    const w = new CustomAiDungeonWorld(container, questData, onComplete);
    w.start();
    window._activeAiDungeon = w;
    return w;
  },
  destroy() {
    if (window._activeAiDungeon) {
      window._activeAiDungeon.stop();
      window._activeAiDungeon = null;
    }
  }
};
