/* global FLSim */
(function () {
  "use strict";
  const S = FLSim;
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const pct = (x, d = 0) => (100 * x).toFixed(d) + "%";
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const NS = "http://www.w3.org/2000/svg";
  function el(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs || {}) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  const STRAT = {
    random: { label: "Random", color: "--c-random" },
    loss: { label: "Pick highest loss", color: "--c-loss" },
    oort: { label: "Oort (faithful)", color: "--c-oort" },
    align: { label: "Align (level-signal control)", color: "--c-align" },
    progress: { label: "FLProgress", color: "--c-progress" },
    oracle: { label: "Oracle (knows corrupted)", color: "--c-oracle" },
  };

  // ------------------------------------------------------------------ theme
  const themeListeners = [];
  (function theme() {
    const root = document.documentElement;
    try {
      const saved = localStorage.getItem("flp-theme");
      if (saved) root.setAttribute("data-theme", saved);
    } catch (e) { /* storage unavailable */ }
    $("#themeBtn").addEventListener("click", () => {
      const cur = root.getAttribute("data-theme") ||
        (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
      const next = cur === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      try { localStorage.setItem("flp-theme", next); } catch (e) { /* ignore */ }
      themeListeners.forEach((f) => f());
    });
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => themeListeners.forEach((f) => f()));
  })();

  // ------------------------------------------------------------- nav state
  (function nav() {
    const links = $$(".nav-links a");
    const map = new Map(links.map((a) => [a.getAttribute("href").slice(1), a]));
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) {
          links.forEach((a) => a.classList.remove("active"));
          const a = map.get(en.target.id);
          if (a) { a.classList.add("active"); a.scrollIntoView({ block: "nearest", inline: "nearest" }); }
        }
      });
    }, { rootMargin: "-45% 0px -50% 0px" });
    map.forEach((_, id) => { const s = document.getElementById(id); if (s) io.observe(s); });
  })();

  // ------------------------------------------------------------ FL diagram
  (function diagram() {
    const svg = $("#flDiagram");
    const cx = 200, cy = 160, R = 122, n = 8, noisy = new Set([1, 4, 6]);
    const links = el("g", {}, svg);
    const pkts = el("g", {}, svg);
    const phones = [];
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
      const x = cx + R * Math.cos(a), y = cy + R * Math.sin(a);
      el("line", { x1: cx, y1: cy, x2: x, y2: y, style: "stroke:var(--line);stroke-width:1.5", "stroke-dasharray": "3 4" }, links);
      const g = el("g", { transform: `translate(${x - 13},${y - 20})` }, svg);
      const col = noisy.has(i) ? "var(--noisy)" : "var(--clean)";
      el("rect", { width: 26, height: 40, rx: 5, style: `fill:var(--surface);stroke:${col};stroke-width:2.5` }, g);
      if (noisy.has(i)) {
        for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++)
          el("rect", { x: 5 + c * 6, y: 6 + r * 7, width: 5, height: 5, class: "static", style: "fill:var(--noisy);opacity:.5" }, g);
      } else {
        el("path", { d: "M6 28 L11 20 L15 24 L20 12", style: `stroke:${col};stroke-width:2;fill:none;stroke-linecap:round` }, g);
      }
      phones.push({ x, y });
    }
    const sg = el("g", { transform: `translate(${cx - 30},${cy - 26})` }, svg);
    el("rect", { width: 60, height: 52, rx: 10, style: "fill:var(--accent);" }, sg);
    el("text", { x: 30, y: 24, "text-anchor": "middle", style: "fill:#fff;font-size:11px;font-weight:700" }, sg).textContent = "SERVER";
    el("text", { x: 30, y: 39, "text-anchor": "middle", style: "fill:#fff;font-size:10px;opacity:.85" }, sg).textContent = "shared model";

    const statics = $$(".static", svg);
    let t0 = performance.now(), picks = [0, 3, 5];
    function frame(now) {
      const T = 2600, ph = ((now - t0) % T) / T;
      if (ph < 0.02 && !frame.lock) { picks = [...Array(n).keys()].sort(() => Math.random() - 0.5).slice(0, 3); frame.lock = true; }
      if (ph > 0.5) frame.lock = false;
      pkts.innerHTML = "";
      picks.forEach((i) => {
        const p = phones[i];
        const out = ph < 0.45, f = out ? ph / 0.45 : ph > 0.55 ? (ph - 0.55) / 0.45 : 1;
        if (ph >= 0.45 && ph <= 0.55) return;
        const x = out ? cx + (p.x - cx) * f : p.x + (cx - p.x) * f;
        const y = out ? cy + (p.y - cy) * f : p.y + (cy - p.y) * f;
        el("circle", { cx: x, cy: y, r: 5, style: out ? "fill:var(--accent)" : noisy.has(i) ? "fill:var(--noisy)" : "fill:var(--clean)" }, pkts);
      });
      statics.forEach((s) => (s.style.opacity = (0.15 + Math.random() * 0.7).toFixed(2)));
      if (!reduceMotion) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  })();

  // =============================================================== GAME 1
  (function game1() {
    const N = 12, K = 3, ROUNDS = 8;
    const box = $("#g1Clients");
    let mode = "loss", seed = 11, st;

    function newState() {
      const fed = S.makeFederation({ n: N, noisyFrac: 4 / 12, alpha: 0.5, seed });
      const r = S.rng(seed * 31 + 5);
      const k = new Array(S.C).fill(0);
      st = {
        fed, r, k, round: 0, sel: new Set(), bandit: S.makeBandit(N), done: false,
        accs: [S.accuracy(k)], noisyPicks: 0, losses: null,
      };
      st.losses = fed.clients.map((c) => S.clientLoss(c, st.k, st.r));
    }

    function render() {
      $("#g1Round").textContent = `${Math.min(st.round + 1, ROUNDS)} / ${ROUNDS}`;
      const acc = S.accuracy(st.k);
      $("#g1Acc").textContent = pct(acc);
      $("#g1Meter").style.width = pct(acc, 1);
      const go = $("#g1Go");
      go.disabled = st.done || st.sel.size !== K;
      go.textContent = st.done ? "Game over" : st.sel.size === K ? "Train on these 3 phones ▸" : `Pick ${K - st.sel.size} more phone${K - st.sel.size === 1 ? "" : "s"}`;
      $("#g1Hint").innerHTML = mode === "loss"
        ? "<strong>You see:</strong> each phone's loss under the current model (higher = the model gets that phone's data more wrong). The standard rule picks the 3 highest. Lower loss is better."
        : "<strong>You see:</strong> for each phone you've already trained on, how much its update alone changed accuracy on a small clean test set the server keeps (a moving average). Untried phones show “?”. This is what FLProgress uses.";

      box.innerHTML = "";
      const maxLoss = Math.max(3.2, ...st.losses);
      st.fed.clients.forEach((c) => {
        const b = document.createElement("button");
        b.className = "client";
        b.type = "button";
        if (st.sel.has(c.id)) b.classList.add("sel");
        if (st.done) b.classList.add(c.noisy ? "reveal-noisy" : "reveal-clean");
        b.disabled = st.done;
        let metric, sub, bar = "";
        if (mode === "loss") {
          const L = st.losses[c.id];
          metric = L.toFixed(2);
          sub = "loss";
          bar = `<div class="bar"><i style="width:${(100 * L) / maxLoss}%;background:var(--ink-3)"></i></div>`;
        } else {
          const n = st.bandit.counts[c.id];
          if (n === 0) { metric = "?"; sub = "not tried yet"; }
          else {
            const m = st.bandit.ema[c.id] * 100;
            metric = (m >= 0 ? "+" : "−") + Math.abs(m).toFixed(1) + " pts";
            sub = `progress · tried ${n}×`;
            const w = Math.min(100, Math.abs(m) * 12);
            bar = `<div class="bar"><i style="width:${w}%;background:${m >= 0 ? "var(--good)" : "var(--bad)"}"></i></div>`;
          }
        }
        b.innerHTML = `<div class="name"><i class="phone"></i>Phone ${c.id + 1}</div>
          <div class="metric">${metric}</div><div class="sub">${sub}</div>${bar}
          <div class="tag">${c.noisy ? "corrupted labels" : "correct labels"}</div>`;
        b.setAttribute("aria-pressed", st.sel.has(c.id) ? "true" : "false");
        b.addEventListener("click", () => {
          if (st.done) return;
          if (st.sel.has(c.id)) st.sel.delete(c.id);
          else if (st.sel.size < K) st.sel.add(c.id);
          render();
        });
        box.appendChild(b);
      });
    }

    function train() {
      const sel = [...st.sel];
      sel.forEach((id) => st.bandit.update(id, S.soloGain(st.fed.clients[id], st.k, st.r)));
      st.noisyPicks += sel.filter((id) => st.fed.clients[id].noisy).length;
      st.k = S.applyRound(st.fed, st.k, sel);
      st.accs.push(S.accuracy(st.k));
      st.losses = st.fed.clients.map((c) => S.clientLoss(c, st.k, st.r));
      st.round++;
      st.sel.clear();
      if (st.round >= ROUNDS) { st.done = true; finish(); }
      render();
    }

    function finish() {
      const you = S.accuracy(st.k);
      const bots = {};
      ["loss", "random", "progress", "oracle"].forEach((nm) => {
        const r = S.run(st.fed, nm, ROUNDS, K, seed);
        bots[nm] = { acc: r.acc[r.acc.length - 1], nsr: r.nsr.reduce((a, b) => a + b, 0) / r.nsr.length };
      });
      const rows = [
        { label: "You", acc: you, color: "var(--ink)", you: true },
        { label: "Standard rule (pick highest loss)", acc: bots.loss.acc, color: "var(--c-loss)" },
        { label: "Random", acc: bots.random.acc, color: "var(--c-random)" },
        { label: "FLProgress bot", acc: bots.progress.acc, color: "var(--c-progress)" },
        { label: "Oracle (cheats)", acc: bots.oracle.acc, color: "var(--c-oracle)" },
      ];
      $("#g1End").classList.remove("hidden");
      $("#g1EndTitle").textContent = `You reached ${pct(you)} accuracy.`;
      $("#g1EndText").innerHTML = `You trained on a corrupted phone <strong>${st.noisyPicks} of ${ROUNDS * K}</strong> times
        (the red cards above). The bots below played the same deal.`;
      const bars = $("#g1Bars");
      bars.innerHTML = "";
      rows.forEach((r) => {
        const d = document.createElement("div");
        d.className = "rbar" + (r.you ? " you" : "");
        d.innerHTML = `<span>${r.label}</span><div class="track"><i style="width:0;background:${r.color}"></i></div><span class="num">${pct(r.acc)}</span>`;
        bars.appendChild(d);
        requestAnimationFrame(() => requestAnimationFrame(() => { d.querySelector("i").style.width = pct(r.acc, 1); }));
      });
      $("#g1Lesson").innerHTML = mode === "loss"
        ? `<strong>What happened:</strong> corrupted phones always have the highest loss, because random labels can't be learned. The standard rule
           spent <strong>${pct(bots.loss.nsr)}</strong> of its picks on them. If you noticed that some phones' loss never went down and stopped picking them,
           you were already judging by <em>progress</em>, not loss. Now switch to <strong>Round B</strong> to play with that information shown directly.`
        : `<strong>What happened:</strong> once you try a corrupted phone, its progress score goes negative, so you stop picking it. Clean phones also get
           ranked by how much they still teach. The FLProgress bot spent <strong>${pct(bots.progress.nsr)}</strong> of its picks on corrupted phones, mostly in the
           first rounds while it tried everyone once. The standard rule spent <strong>${pct(bots.loss.nsr)}</strong>.`;
    }

    function restart() { newState(); $("#g1End").classList.add("hidden"); render(); }

    $("#g1Go").addEventListener("click", train);
    $("#g1New").addEventListener("click", () => { seed = 1 + Math.floor(Math.random() * 100000); restart(); });
    $$("#g1Mode button").forEach((b) => b.addEventListener("click", () => {
      $$("#g1Mode button").forEach((x) => x.classList.toggle("on", x === b));
      mode = b.dataset.mode;
      restart();
    }));
    restart();
  })();

  // =============================================================== GAME 2
  (function game2() {
    const Q = 6, T = 6;
    let qi = 0, score = 0, results = [], base = 1 + Math.floor(Math.random() * 1000), cur;

    function makeQuestion(seed) {
      for (let attempt = 0; attempt < 200; attempt++) {
        const s = seed * 977 + attempt;
        const fed = S.makeFederation({ n: 10, noisyFrac: 0.3, alpha: 0.5, seed: s });
        const r = S.rng(s + 3);
        let k = new Array(S.C).fill(0);
        const hist = fed.clients.map(() => []);
        const warm = 2 + Math.floor(r() * 4);
        for (let t = 0; t < warm + T; t++) {
          if (t >= warm) fed.clients.forEach((c) => hist[c.id].push(S.clientLoss(c, k, r)));
          const sel = r.shuffle([...Array(10).keys()]).slice(0, 3);
          k = S.applyRound(fed, k, sel);
        }
        fed.clients.forEach((c) => hist[c.id].push(S.clientLoss(c, k, r)));
        const noisy = fed.clients.filter((c) => c.noisy), clean = fed.clients.filter((c) => !c.noisy);
        const nz = noisy[Math.floor(r() * noisy.length)];
        const cs = r.shuffle(clean.slice()).slice(0, 2);
        const opts = [nz, ...cs].map((c) => ({ c, hist: hist[c.id], gain: S.soloGain(c, k) }));
        const g = opts.map((o) => o.gain).sort((a, b) => b - a);
        if (g[0] - g[1] < 0.008) continue; // make sure there is a clear best answer
        return r.shuffle(opts);
      }
      return null;
    }

    function spark(svg, hist, lo, hi) {
      const w = 300, h = 90, pad = 10;
      svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
      svg.innerHTML = "";
      const x = (i) => pad + (i * (w - 2 * pad)) / (hist.length - 1);
      const y = (v) => h - pad - ((h - 2 * pad) * (v - lo)) / (hi - lo);
      el("line", { x1: pad, x2: w - pad, y1: y(Math.log(10)), y2: y(Math.log(10)), style: "stroke:var(--ink-3);stroke-dasharray:3 4;opacity:.6" }, svg);
      el("text", { x: pad, y: y(Math.log(10)) + 13, style: "fill:var(--ink-3);font-size:10px" }, svg).textContent = "chance-level loss (2.30)";
      el("polyline", { points: hist.map((v, i) => `${x(i)},${y(v)}`).join(" "), style: "fill:none;stroke:var(--ink);stroke-width:2.5;stroke-linejoin:round;stroke-linecap:round" }, svg);
      el("circle", { cx: x(hist.length - 1), cy: y(hist[hist.length - 1]), r: 4, style: "fill:var(--ink)" }, svg);
    }

    function renderDots() {
      const d = $("#g2Dots");
      d.innerHTML = "";
      for (let i = 0; i < Q; i++) {
        const e = document.createElement("i");
        if (results[i] === true) e.className = "ok";
        if (results[i] === false) e.className = "no";
        d.appendChild(e);
      }
      $("#g2Score").textContent = `${score} / ${results.length}`;
    }

    function show() {
      cur = makeQuestion(base + qi);
      const box = $("#g2Opts");
      box.innerHTML = "";
      $("#g2Explain").classList.add("hidden");
      $("#g2Next").classList.add("hidden");
      $("#g2Restart").classList.add("hidden");
      const all = cur.flatMap((o) => o.hist);
      const lo = Math.max(0, Math.min(...all) - 0.2), hi = Math.max(Math.log(10), ...all) + 0.15;
      cur.forEach((o, i) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "client qopt";
        const last = o.hist[o.hist.length - 1];
        b.innerHTML = `<div class="name"><i class="phone"></i>Phone ${"ABC"[i]}</div>
          <svg aria-hidden="true"></svg>
          <div class="sub">loss now: <span class="mono">${last.toFixed(2)}</span> · over the last ${o.hist.length - 1} rounds</div>
          <div class="gain hidden"></div><div class="tag">${o.c.noisy ? "corrupted labels" : "correct labels"}</div>`;
        spark($("svg", b), o.hist, lo, hi);
        b.addEventListener("click", () => answer(i));
        box.appendChild(b);
      });
      renderDots();
    }

    function answer(i) {
      const best = cur.reduce((bi, o, j) => (o.gain > cur[bi].gain ? j : bi), 0);
      const ok = i === best;
      results.push(ok);
      if (ok) score++;
      $$("#g2Opts .qopt").forEach((b, j) => {
        b.disabled = true;
        b.classList.add(cur[j].c.noisy ? "reveal-noisy" : "reveal-clean");
        if (j === best) b.classList.add("right");
        else if (j === i) b.classList.add("wrong");
        const g = cur[j].gain * 100;
        const gEl = $(".gain", b);
        gEl.classList.remove("hidden");
        gEl.innerHTML = `training on it: <strong style="color:${g >= 0 ? "var(--good)" : "var(--bad)"}">${g >= 0 ? "+" : "−"}${Math.abs(g).toFixed(1)} pts</strong> accuracy`;
      });
      const nz = cur.find((o) => o.c.noisy);
      const picked = cur[i];
      let msg;
      if (ok) msg = "<strong>Right.</strong> ";
      else if (picked.c.noisy) msg = "<strong>That one had corrupted labels.</strong> ";
      else msg = "<strong>Close: a clean phone, but not the best one.</strong> ";
      msg += nz.hist[nz.hist.length - 1] >= Math.max(...cur.map((o) => o.hist[o.hist.length - 1])) - 1e-9
        ? "The corrupted phone had the highest loss, so the standard rule would have picked it. Its line stays flat or climbs, because random labels can't be learned. "
        : "The corrupted phone's line stays flat or climbs, because random labels can't be learned. ";
      msg += "Among clean phones, the one with more left to learn teaches the most.";
      const ex = $("#g2Explain");
      ex.innerHTML = msg;
      ex.className = "callout" + (ok ? "" : " warn");
      renderDots();
      qi++;
      if (qi < Q) $("#g2Next").classList.remove("hidden");
      else {
        ex.innerHTML += `<br><br><strong>Final score: ${score} / ${Q}.</strong> The lesson: judge a phone by which way its loss is moving, not by how high it is. That is the
          difference between a <em>rate</em> and a <em>level</em> signal.`;
        $("#g2Restart").classList.remove("hidden");
      }
    }

    $("#g2Next").addEventListener("click", show);
    $("#g2Restart").addEventListener("click", () => { qi = 0; score = 0; results = []; base += 101; show(); });
    show();
  })();

  // =============================================================== GAME 3
  (function game3() {
    const STATIONS = [
      { name: "book", x: 70, y: 70, rate: 0.78 },
      { name: "puzzle", x: 200, y: 52, rate: 0.84 },
      { name: "plant", x: 70, y: 200, rate: 0.88 },
      { name: "clock", x: 200, y: 210, rate: 0.81 },
      { name: "TV", x: 330, y: 130, tv: true },
    ];
    let tvOn = true, paused = false, visible = false, timer = null, A, B;

    function drawIcon(g, s) {
      const ink = "var(--ink-2)";
      if (s.tv) {
        el("rect", { x: -34, y: -26, width: 68, height: 48, rx: 6, style: "fill:var(--surface);stroke:var(--ink-2);stroke-width:2.5" }, g);
        const scr = el("g", { class: "tvscreen" }, g);
        for (let r = 0; r < 6; r++) for (let c = 0; c < 10; c++)
          el("rect", { x: -29 + c * 5.8, y: -21 + r * 6.4, width: 5.8, height: 6.4, style: "fill:var(--ink-3)" }, scr);
        el("line", { x1: -10, y1: 22, x2: -16, y2: 32, style: "stroke:var(--ink-2);stroke-width:2.5" }, g);
        el("line", { x1: 10, y1: 22, x2: 16, y2: 32, style: "stroke:var(--ink-2);stroke-width:2.5" }, g);
        return;
      }
      const base = `fill:var(--surface);stroke:${ink};stroke-width:2.5`;
      if (s.name === "book") {
        el("path", { d: "M-24 -18 L0 -12 L24 -18 L24 18 L0 24 L-24 18 Z", style: base }, g);
        el("line", { x1: 0, y1: -12, x2: 0, y2: 24, style: `stroke:${ink};stroke-width:2` }, g);
      } else if (s.name === "puzzle") {
        el("rect", { x: -20, y: -20, width: 40, height: 40, rx: 4, style: base }, g);
        el("circle", { cx: 0, cy: -20, r: 6, style: base }, g);
        el("circle", { cx: 20, cy: 0, r: 6, style: base }, g);
      } else if (s.name === "plant") {
        el("path", { d: "M-14 6 L14 6 L10 26 L-10 26 Z", style: base }, g);
        el("path", { d: "M0 6 C -18 -6 -14 -24 0 -26 C 14 -24 18 -6 0 6", style: base }, g);
      } else if (s.name === "clock") {
        el("circle", { r: 22, style: base }, g);
        el("path", { d: "M0 -13 L0 0 L9 6", style: `stroke:${ink};stroke-width:2.5;fill:none;stroke-linecap:round` }, g);
      }
    }

    function makeAgent(svgSel, kind) {
      const svg = $(svgSel);
      svg.innerHTML = "";
      const room = el("rect", { x: 6, y: 6, width: 388, height: 248, rx: 12, style: "fill:none;stroke:var(--line);stroke-width:2" }, svg);
      void room;
      const gaze = el("line", { style: "stroke:var(--accent);stroke-width:2;stroke-dasharray:3 4;opacity:.7" }, svg);
      const bars = [];
      STATIONS.forEach((s) => {
        const g = el("g", { transform: `translate(${s.x},${s.y})` }, svg);
        drawIcon(g, s);
        el("rect", { x: -26, y: s.tv ? 40 : 34, width: 52, height: 6, rx: 3, style: "fill:var(--line)" }, g);
        const bar = el("rect", { x: -26, y: s.tv ? 40 : 34, width: 52, height: 6, rx: 3, style: `fill:${s.tv ? "var(--noisy)" : "var(--clean)"}` }, g);
        bars.push(bar);
      });
      const robot = el("g", { class: "robot" }, svg);
      const col = kind === "surprise" ? "var(--c-loss)" : "var(--c-progress)";
      el("circle", { r: 15, style: `fill:${col}` }, robot);
      el("circle", { cx: -5, cy: -3, r: 3.2, style: "fill:#fff" }, robot);
      el("circle", { cx: 5, cy: -3, r: 3.2, style: "fill:#fff" }, robot);
      el("rect", { x: -1.5, y: -24, width: 3, height: 9, style: `fill:${col}` }, robot);
      robot.setAttribute("transform", "translate(140,130)");
      return {
        kind, svg, gaze, bars, robot, pos: { x: 140, y: 130 },
        err: STATIONS.map(() => 1), seen: STATIONS.map(() => 1), ema: STATIONS.map(() => 0),
        n: STATIONS.map(() => 0), t: 0, tvTime: 0,
        r: S.rng(kind === "surprise" ? 17 : 29),
      };
    }

    function step(a) {
      a.t++;
      let target;
      if (a.r() < 0.08) target = Math.floor(a.r() * STATIONS.length);
      else if (a.kind === "surprise") {
        target = a.seen.reduce((bi, v, i) => (v > a.seen[bi] ? i : bi), 0);
      } else {
        const sc = a.ema.map((m, i) => (a.n[i] === 0 ? Infinity : m + 0.02 * Math.sqrt(Math.log(a.t + 1) / a.n[i])));
        target = sc.reduce((bi, v, i) => (v > sc[bi] ? i : bi), 0);
      }
      const s = STATIONS[target];
      const before = a.err[target];
      if (s.tv) a.err[target] = tvOn ? 0.86 + 0.14 * a.r() : a.err[target] * 0.15;
      else a.err[target] = Math.max(0.02, a.err[target] * s.rate + 0.02 * (a.r() - 0.5));
      const after = a.err[target];
      a.seen[target] = after;
      const gain = before - after;
      a.n[target]++;
      a.ema[target] = a.n[target] === 1 ? gain : 0.6 * a.ema[target] + 0.4 * gain;
      if (s.tv && tvOn) a.tvTime++;
      // move robot next to the station
      const dx = s.x < 200 ? 46 : s.tv ? -62 : 46;
      a.pos = { x: s.x + dx, y: s.y + 4 };
      a.robot.style.transform = `translate(${a.pos.x}px,${a.pos.y}px)`;
      a.gaze.setAttribute("x1", a.pos.x); a.gaze.setAttribute("y1", a.pos.y);
      a.gaze.setAttribute("x2", s.x); a.gaze.setAttribute("y2", s.y);
    }

    function paint(a, tvSel, learnSel) {
      a.bars.forEach((b, i) => b.setAttribute("width", (52 * a.err[i]).toFixed(1)));
      $(tvSel).textContent = pct(a.t ? a.tvTime / a.t : 0);
      const learn = STATIONS.reduce((s, st, i) => s + (st.tv ? 0 : 1 - a.err[i]), 0) / 4;
      $(learnSel).textContent = pct(Math.max(0, learn));
    }

    function tick() {
      $$(".tvscreen rect").forEach((r) => (r.style.opacity = tvOn ? (0.15 + Math.random() * 0.85).toFixed(2) : "0.08"));
      if (paused || !visible) return;
      tick.n = (tick.n || 0) + 1;
      if (tick.n % 5 !== 0) return; // robots move every 5th static frame
      step(A); step(B);
      paint(A, "#aTv", "#aLearn"); paint(B, "#bTv", "#bLearn");
    }

    function reset() {
      A = makeAgent("#roomA", "surprise");
      B = makeAgent("#roomB", "progress");
      // the CSS transition uses the transform property; keep attribute + style in sync
      [A, B].forEach((a) => { a.robot.style.transform = `translate(${a.pos.x}px,${a.pos.y}px)`; a.robot.removeAttribute("transform"); });
      paint(A, "#aTv", "#aLearn"); paint(B, "#bTv", "#bLearn");
    }

    $("#g3Tv").addEventListener("click", () => {
      tvOn = !tvOn;
      $("#g3Tv").textContent = tvOn ? "📺 Switch TV off" : "📺 Switch TV on";
      reset();
    });
    $("#g3Pause").addEventListener("click", () => {
      paused = !paused;
      $("#g3Pause").textContent = paused ? "▶ Resume" : "⏸ Pause";
    });
    $("#g3Reset").addEventListener("click", reset);
    new IntersectionObserver((en) => { visible = en[0].isIntersecting; }, { threshold: 0.15 }).observe($("#game3"));
    reset();
    timer = setInterval(tick, reduceMotion ? 600 : 140);
    void timer;
  })();

  // =============================================================== GAME 4
  (function game4() {
    const SKEW = [
      { alpha: 1.0, label: "mild" },
      { alpha: 0.5, label: "moderate" },
      { alpha: 0.1, label: "extreme" },
    ];
    const ORDER = ["random", "loss", "progress", "oracle"];
    const ROUNDS = 60, N = 40, K = 6;
    let bet = null, data = null, shown = 0, anim = null;

    const bets = $("#g4Bets");
    ["random", "loss", "progress"].forEach((nm) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "bet";
      b.innerHTML = `<i class="swatch" style="background:var(${STRAT[nm].color})"></i>${STRAT[nm].label}`;
      b.addEventListener("click", () => {
        bet = nm;
        $$(".bet", bets).forEach((x) => x.classList.toggle("on", x === b));
        const run = $("#g4Run");
        run.disabled = false;
        run.textContent = "Start the race ▸";
      });
      bets.appendChild(b);
    });
    $("#g4Legend").innerHTML = ORDER.map((nm) =>
      `<span><i class="swatch" style="background:var(${STRAT[nm].color})"></i>${STRAT[nm].label}${nm === "oracle" ? " (dashed, cheats)" : ""}</span>`).join("");

    const noisyIn = $("#g4Noisy"), skewIn = $("#g4Skew");
    function labels() {
      $("#g4NoisyV").textContent = noisyIn.value + "%";
      const s = SKEW[+skewIn.value];
      $("#g4SkewV").textContent = `${s.label} (α=${s.alpha})`;
    }
    noisyIn.addEventListener("input", labels);
    skewIn.addEventListener("input", labels);
    labels();

    function smooth(a, w) {
      return a.map((_, i) => {
        const lo = Math.max(0, i - w + 1);
        let s = 0;
        for (let j = lo; j <= i; j++) s += a[j];
        return s / (i - lo + 1);
      });
    }

    function drawChart(canvas, key, upto) {
      const dpr = window.devicePixelRatio || 1;
      const W = canvas.clientWidth, H = canvas.clientHeight;
      if (!W) return;
      canvas.width = W * dpr; canvas.height = H * dpr;
      const c = canvas.getContext("2d");
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.clearRect(0, 0, W, H);
      const L = 40, R = 10, T = 10, B = 28;
      const x = (i) => L + ((W - L - R) * i) / (ROUNDS - 1);
      const y = (v) => T + (H - T - B) * (1 - v);
      c.font = "11px -apple-system, Segoe UI, sans-serif";
      c.fillStyle = css("--ink-3");
      c.strokeStyle = css("--line");
      c.lineWidth = 1;
      for (let v = 0; v <= 1.0001; v += 0.25) {
        c.beginPath(); c.moveTo(L, y(v)); c.lineTo(W - R, y(v)); c.stroke();
        c.textAlign = "right"; c.textBaseline = "middle";
        c.fillText(Math.round(v * 100) + "%", L - 6, y(v));
      }
      c.textAlign = "center"; c.textBaseline = "top";
      [0, 20, 40, 59].forEach((i) => c.fillText(i === 59 ? "round 60" : String(i + 1), x(i), H - B + 8));
      if (key === "nsr" && data) {
        const base = data.noisyFrac;
        c.setLineDash([4, 4]); c.strokeStyle = css("--ink-3");
        c.beginPath(); c.moveTo(L, y(base)); c.lineTo(W - R, y(base)); c.stroke();
        c.setLineDash([]);
        c.textAlign = "left"; c.textBaseline = "bottom";
        c.fillText("chance", L + 4, y(base) - 2);
      }
      if (!data) {
        c.textAlign = "center"; c.textBaseline = "middle"; c.fillStyle = css("--ink-3"); c.font = "14px -apple-system, Segoe UI, sans-serif";
        c.fillText("Place a bet and start the race", (L + W - R) / 2, (T + H - B) / 2);
        return;
      }
      ORDER.forEach((nm) => {
        const arr = key === "acc" ? data.runs[nm].acc : smooth(data.runs[nm].nsr, 5);
        c.strokeStyle = css(STRAT[nm].color);
        c.lineWidth = nm === "progress" ? 3 : 2;
        c.setLineDash(nm === "oracle" ? [6, 5] : []);
        c.beginPath();
        for (let i = 0; i < Math.min(upto, ROUNDS); i++) {
          const v = arr[i];
          if (i === 0) c.moveTo(x(i), y(v)); else c.lineTo(x(i), y(v));
        }
        c.stroke();
        c.setLineDash([]);
      });
    }

    function drawAll() { drawChart($("#g4Acc"), "acc", shown); drawChart($("#g4Nsr"), "nsr", shown); }

    function verdict() {
      const fin = (nm) => data.runs[nm].acc[ROUNDS - 1];
      const ranked = ["random", "loss", "progress"].sort((a, b) => fin(b) - fin(a));
      const win = ranked[0];
      const v = $("#g4Verdict");
      v.classList.remove("hidden");
      v.className = "callout" + (win === bet ? "" : " warn");
      let msg = win === bet
        ? `<strong>You won your bet.</strong> ${STRAT[win].label} finished first at ${pct(fin(win))}.`
        : `<strong>You lost your bet.</strong> ${STRAT[win].label} finished first at ${pct(fin(win))}; ${STRAT[bet].label} reached ${pct(fin(bet))}.`;
      msg += ` The oracle, which knows who's corrupted, reached ${pct(fin("oracle"))}.`;
      if (data.noisyFrac === 0) msg += " With no corrupted phones there's no trap, so the strategies end close together. The trick only matters when some data is wrong.";
      else msg += ` The highest-loss rule put ${pct(data.runs.loss.nsr.reduce((a, b) => a + b) / ROUNDS)} of its picks on corrupted phones.`;
      if (data.alpha === 0.1) msg += " <br><br><strong>Caution:</strong> in the real experiments, extreme skew is where FLProgress <em>fails</em> (0.187 accuracy, below random). This toy model doesn't capture that failure. <a href=\"#failures\">See why it happens.</a>";
      v.innerHTML = msg;
    }

    $("#g4Run").addEventListener("click", () => {
      if (!bet) return;
      if (anim) cancelAnimationFrame(anim);
      const noisyFrac = +noisyIn.value / 100, alpha = SKEW[+skewIn.value].alpha;
      const seed = 1 + Math.floor(Math.random() * 1e6);
      const fed = S.makeFederation({ n: N, noisyFrac, alpha, seed });
      const runs = {};
      ORDER.forEach((nm) => (runs[nm] = S.run(fed, nm, ROUNDS, K, seed)));
      data = { runs, noisyFrac, alpha };
      $("#g4Verdict").classList.add("hidden");
      $("#g4Status").textContent = `${N} phones · ${Math.round(noisyFrac * N)} corrupted · ${K} picked per round`;
      const t0 = performance.now(), dur = reduceMotion ? 0 : 3200;
      const go = (now) => {
        const f = dur ? Math.min(1, (now - t0) / dur) : 1;
        shown = Math.max(1, Math.round(f * ROUNDS));
        drawAll();
        if (f < 1) anim = requestAnimationFrame(go);
        else { anim = null; verdict(); }
      };
      anim = requestAnimationFrame(go);
    });

    window.addEventListener("resize", drawAll);
    themeListeners.push(drawAll);
    drawAll();
  })();

  // =============================================================== RESULTS
  (function results() {
    const r = (acc, sd, nsr) => ({ acc, sd, nsr });
    const SETTINGS = [
      {
        id: "c05", label: "CIFAR-10 · moderate skew",
        desc: "CIFAR-10, Dirichlet(0.5), 100 clients, 30% corrupted, 3 seeds. The headline setting, and the only one that also ran Oort and the level-signal control.",
        rows: { random: r(0.4659, 0.0048, 0.312), loss: r(0.4128, 0.1718, 0.518), oort: r(0.4173, 0.034, 0.382), align: r(0.426, 0.03, 0.3), progress: r(0.532, 0.0167, 0.207), oracle: r(0.6554, 0.0005, 0) },
        take: "The highest-loss rule put 52% of its picks on corrupted clients (chance: 30%) on every seed, and its accuracy split across seeds: 0.516, <strong>0.171</strong>, 0.552. FLProgress is the best strategy that doesn't cheat. The level-signal control (Align) uses the same bandit as FLProgress and reaches only 0.426, so the gain comes from measuring <em>rate</em>.",
      },
      {
        id: "c10", label: "CIFAR-10 · mild skew",
        desc: "CIFAR-10, Dirichlet(1.0): each client's data is closer to a balanced mix of classes.",
        rows: { random: r(0.4506, 0.015, 0.297), loss: r(0.5668, 0.008, 0.528), progress: r(0.6473, 0.0103, 0.066), oracle: r(0.6598, 0.0133, 0) },
        take: "Here the highest-loss rule still over-picks corrupted clients (53%) but finishes above random. FLProgress picks them only 6.6% of the time and ends 1.3 points below the oracle.",
      },
      {
        id: "c01", label: "CIFAR-10 · extreme skew",
        desc: "CIFAR-10, Dirichlet(0.1): each client holds essentially one or two classes.",
        rows: { random: r(0.419, 0.043, 0.296), loss: r(0.3425, 0.0686, 0.463), progress: r(0.1868, 0.012, 0.678), oracle: r(0.6078, 0.0132, 0) },
        take: "<strong>The failure case.</strong> FLProgress finishes far below random (0.187 vs 0.419) and picks corrupted clients 68% of the time. <a href=\"#failures\">Where it fails</a> explains why.",
        bad: true,
      },
      {
        id: "em", label: "EMNIST · moderate skew",
        desc: "EMNIST-byclass (62 classes), Dirichlet(0.5), 100 clients, 30% corrupted, 3 seeds.",
        rows: { random: r(0.5666, 0.0734, 0.298), loss: r(0.5013, 0.3335, 0.579), progress: r(0.81, 0.0078, 0.025), oracle: r(0.7989, 0.0004, 0) },
        take: "FLProgress beats the oracle (0.810 vs 0.799) on all three seeds, and stops picking corrupted clients entirely after its first pass through all clients. The oracle only avoids noise; a progress signal also ranks the clean clients by how much they still teach.",
      },
    ];
    let cur = SETTINGS[0], metric = "acc";
    const seg = $("#resSetting");
    SETTINGS.forEach((s, i) => {
      const b = document.createElement("button");
      b.textContent = s.label;
      if (i === 0) b.className = "on";
      b.addEventListener("click", () => {
        cur = s;
        $$("button", seg).forEach((x) => x.classList.toggle("on", x === b));
        draw();
      });
      seg.appendChild(b);
    });
    $$("#resMetric button").forEach((b) => b.addEventListener("click", () => {
      metric = b.dataset.m;
      $$("#resMetric button").forEach((x) => x.classList.toggle("on", x === b));
      draw();
    }));

    function draw() {
      $("#resDesc").textContent = cur.desc;
      const t = $("#resTake");
      t.innerHTML = cur.take;
      t.className = "callout" + (cur.bad ? " warn" : "");
      const keys = ["random", "loss", "oort", "align", "progress", "oracle"].filter((k) => cur.rows[k]);
      const rowH = 38, labW = 210, W = 720, numW = 110, H = keys.length * rowH + 30;
      const plotW = W - labW - numW;
      const sx = (v) => labW + plotW * v;
      const svg = document.createElementNS(NS, "svg");
      svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
      svg.setAttribute("role", "img");
      svg.setAttribute("aria-label", `${cur.label}: ${metric === "acc" ? "final accuracy" : "share of picks on corrupted clients"} by strategy`);
      for (let v = 0; v <= 1.0001; v += 0.25) {
        el("line", { x1: sx(v), x2: sx(v), y1: 4, y2: H - 22, style: "stroke:var(--line)" }, svg);
        el("text", { x: sx(v), y: H - 6, "text-anchor": "middle", style: "fill:var(--ink-3);font-size:12px" }, svg).textContent = Math.round(v * 100) + "%";
      }
      if (metric === "nsr") {
        el("line", { x1: sx(0.3), x2: sx(0.3), y1: 4, y2: H - 22, style: "stroke:var(--ink-3);stroke-dasharray:5 4" }, svg);
        el("text", { x: sx(0.3) + 5, y: 14, style: "fill:var(--ink-3);font-size:11px" }, svg).textContent = "chance (30%)";
      }
      keys.forEach((k, i) => {
        const d = cur.rows[k], y = 8 + i * rowH;
        const v = metric === "acc" ? d.acc : d.nsr;
        const ours = k === "progress";
        el("text", { x: labW - 12, y: y + 17, "text-anchor": "end", style: `fill:var(--ink);font-size:13px;font-weight:${ours ? 700 : 500}` }, svg).textContent = STRAT[k].label;
        el("rect", { x: sx(0), y: y + 4, width: Math.max(2, plotW * v), height: 20, rx: 4, style: `fill:var(${STRAT[k].color});opacity:${ours ? 1 : 0.8}` }, svg);
        if (metric === "acc" && d.sd > 0.002) {
          const lo = sx(Math.max(0, d.acc - d.sd)), hi = sx(Math.min(1, d.acc + d.sd));
          el("line", { x1: lo, x2: hi, y1: y + 14, y2: y + 14, style: "stroke:var(--ink);stroke-width:1.5" }, svg);
          el("line", { x1: lo, x2: lo, y1: y + 8, y2: y + 20, style: "stroke:var(--ink);stroke-width:1.5" }, svg);
          el("line", { x1: hi, x2: hi, y1: y + 8, y2: y + 20, style: "stroke:var(--ink);stroke-width:1.5" }, svg);
        }
        const txt = metric === "acc" ? `${d.acc.toFixed(3)} ± ${d.sd.toFixed(3)}` : pct(d.nsr, 1);
        el("text", { x: W - 4, y: y + 18, "text-anchor": "end", style: `fill:var(--ink-2);font-size:12.5px;font-family:var(--mono);font-weight:${ours ? 700 : 400}` }, svg).textContent = txt;
      });
      const box = $("#resChart");
      box.innerHTML = "";
      box.appendChild(svg);
    }
    draw();
  })();
})();
