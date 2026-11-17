/*
 * Toy federated-learning simulator used by the games on this page.
 *
 * This is NOT the real experiment. It is a deliberately small model that keeps
 * the one mechanism the real work is about:
 *   - a clean client's update teaches the classes it holds, and teaches less
 *     once the global model already knows them;
 *   - a noisy (random-label) client's update damages what the model knows, and
 *     its loss stays high no matter how much the model trains on it.
 *
 * The real numbers (CIFAR-10, EMNIST, CNNs, 3 seeds) are in the Results section
 * of the page and come straight from the repository's results/*.json files.
 */
(function (root) {
  "use strict";

  const C = 10; // classes

  // ---------- seeded RNG (mulberry32) ----------
  function rng(seed) {
    let a = seed >>> 0;
    const next = function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    next.normal = function () {
      let u = 0, v = 0;
      while (u === 0) u = next();
      while (v === 0) v = next();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    };
    next.gamma = function (k) {
      // Marsaglia–Tsang; boost for k < 1
      if (k < 1) {
        const u = next();
        return next.gamma(1 + k) * Math.pow(u, 1 / k);
      }
      const d = k - 1 / 3, c = 1 / Math.sqrt(9 * d);
      for (;;) {
        let x, v;
        do { x = next.normal(); v = 1 + c * x; } while (v <= 0);
        v = v * v * v;
        const u = next();
        if (u < 1 - 0.0331 * x * x * x * x) return d * v;
        if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
      }
    };
    next.dirichlet = function (alpha, n) {
      const g = [];
      let s = 0;
      for (let i = 0; i < n; i++) { const x = next.gamma(alpha) + 1e-9; g.push(x); s += x; }
      return g.map((x) => x / s);
    };
    next.shuffle = function (arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    };
    return next;
  }

  // ---------- federation ----------
  function makeFederation(opts) {
    const o = Object.assign({ n: 40, noisyFrac: 0.3, alpha: 0.5, seed: 1 }, opts);
    const r = rng(o.seed * 7919 + 13);
    const nNoisy = Math.round(o.noisyFrac * o.n);
    const ids = r.shuffle([...Array(o.n).keys()]);
    const noisy = new Set(ids.slice(0, nNoisy));
    const clients = [];
    for (let i = 0; i < o.n; i++) {
      clients.push({
        id: i,
        noisy: noisy.has(i),
        p: r.dirichlet(o.alpha, C), // which classes this client holds
        size: 20 + Math.floor(r() * 80),
      });
    }
    return { clients, n: o.n, nNoisy, seed: o.seed };
  }

  const LR_CLEAN = 0.55;
  const LR_NOISE = 0.10;

  function accuracy(k) {
    let s = 0;
    for (let c = 0; c < C; c++) s += k[c];
    return 0.1 + 0.9 * (s / C);
  }

  // The update a single client would send, as a change in per-class knowledge.
  function clientDelta(client, k) {
    const d = new Array(C);
    for (let c = 0; c < C; c++) {
      d[c] = client.noisy ? -LR_NOISE * k[c] : LR_CLEAN * client.p[c] * (1 - k[c]);
    }
    return d;
  }

  // What the server can see without any extra work: the client's loss on its
  // own data under the current global model.
  function clientLoss(client, k, r) {
    const jitter = r ? 0.04 * r.normal() : 0;
    if (client.noisy) {
      // random labels: the model's confidence never matches the label, so the
      // loss sits at or above chance (ln 10 = 2.30) forever
      return Math.log(10) + 0.9 * (accuracy(k) - 0.1) + jitter;
    }
    let L = 0;
    for (let c = 0; c < C; c++) L += client.p[c] * -Math.log(0.1 + 0.9 * k[c]);
    return L + jitter;
  }

  // Leave-one-in progress: probe accuracy gain if ONLY this update were applied.
  function soloGain(client, k, r) {
    const d = clientDelta(client, k);
    const k2 = k.map((x, c) => Math.min(1, Math.max(0, x + d[c])));
    const noise = r ? 0.002 * r.normal() : 0;
    return accuracy(k2) - accuracy(k) + noise;
  }

  function applyRound(fed, k, sel) {
    let wsum = 0;
    const agg = new Array(C).fill(0);
    for (const id of sel) {
      const cl = fed.clients[id];
      const d = clientDelta(cl, k);
      for (let c = 0; c < C; c++) agg[c] += cl.size * d[c];
      wsum += cl.size;
    }
    return k.map((x, c) => Math.min(1, Math.max(0, x + agg[c] / wsum)));
  }

  // ---------- progress bandit (EMA + UCB), same rule as flprogress.py ----------
  function makeBandit(n, opts) {
    const o = Object.assign({ c: 0.004, decay: 0.6 }, opts);
    return {
      ema: new Array(n).fill(0),
      counts: new Array(n).fill(0),
      t: 0,
      select(kSel, r) {
        this.t++;
        const untried = [];
        for (let i = 0; i < n; i++) if (this.counts[i] === 0) untried.push(i);
        if (untried.length >= kSel) return r.shuffle(untried).slice(0, kSel);
        const score = this.ema.map((m, i) =>
          this.counts[i] === 0 ? Infinity : m + o.c * Math.sqrt(Math.log(this.t + 1) / this.counts[i])
        );
        return [...Array(n).keys()].sort((a, b) => score[b] - score[a]).slice(0, kSel);
      },
      update(id, gain) {
        this.counts[id]++;
        this.ema[id] = this.counts[id] === 1 ? gain : o.decay * this.ema[id] + (1 - o.decay) * gain;
      },
    };
  }

  // ---------- strategies ----------
  function makeStrategy(name, fed, seed) {
    const r = rng(seed * 104729 + name.length * 31 + 7);
    const n = fed.n;
    const bandit = makeBandit(n);
    return {
      name,
      bandit,
      pick(k, kSel) {
        if (name === "random") return r.shuffle([...Array(n).keys()]).slice(0, kSel);
        if (name === "oracle") {
          const clean = fed.clients.filter((c) => !c.noisy).map((c) => c.id);
          return r.shuffle(clean).slice(0, kSel);
        }
        if (name === "loss") {
          const L = fed.clients.map((c) => clientLoss(c, k, r));
          return [...Array(n).keys()].sort((a, b) => L[b] - L[a]).slice(0, kSel);
        }
        if (name === "progress") return bandit.select(kSel, r);
        throw new Error(name);
      },
      observe(sel, k) {
        if (name !== "progress") return;
        for (const id of sel) bandit.update(id, soloGain(fed.clients[id], k, r));
      },
    };
  }

  // Run one strategy for a number of rounds; returns curves.
  function run(fed, name, rounds, kSel, seed) {
    const s = makeStrategy(name, fed, seed);
    let k = new Array(C).fill(0);
    const acc = [], nsr = [];
    for (let t = 0; t < rounds; t++) {
      const sel = s.pick(k, kSel);
      s.observe(sel, k);
      k = applyRound(fed, k, sel);
      acc.push(accuracy(k));
      nsr.push(sel.filter((id) => fed.clients[id].noisy).length / kSel);
    }
    return { acc, nsr };
  }

  const api = {
    C, rng, makeFederation, accuracy, clientDelta, clientLoss, soloGain,
    applyRound, makeBandit, makeStrategy, run,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.FLSim = api;
})(typeof window !== "undefined" ? window : globalThis);
