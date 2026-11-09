// Small beam-search rotation finder on top of the Teamcraft simulator (MIT).
(function (root) {
  const T = root.TCSim;
  const ACTIONS = ['MuscleMemory','Reflect','TrainedEye','Veneration','Innovation','GreatStrides','WasteNot','WasteNotII','Manipulation','MastersMend','ImmaculateMend',
    'BasicSynthesis','CarefulSynthesis','Groundwork','PrudentSynthesis','BasicTouch','StandardTouch','AdvancedTouch','PreparatoryTouch','PrudentTouch','RefinedTouch',
    'ByregotsBlessing','TrainedFinesse','TrainedPerfection','DelicateSynthesis'];
  const NAMES = { MuscleMemory: 'Muscle Memory', TrainedEye: 'Trained Eye', GreatStrides: 'Great Strides', WasteNot: 'Waste Not', WasteNotII: 'Waste Not II', MastersMend: "Master's Mend",
    ImmaculateMend: 'Immaculate Mend', BasicSynthesis: 'Basic Synthesis', CarefulSynthesis: 'Careful Synthesis', PrudentSynthesis: 'Prudent Synthesis', BasicTouch: 'Basic Touch',
    StandardTouch: 'Standard Touch', AdvancedTouch: 'Advanced Touch', PreparatoryTouch: 'Preparatory Touch', PrudentTouch: 'Prudent Touch', RefinedTouch: 'Refined Touch',
    ByregotsBlessing: "Byregot's Blessing", TrainedFinesse: 'Trained Finesse', TrainedPerfection: 'Trained Perfection', DelicateSynthesis: 'Delicate Synthesis' };
  const BUFF = new Set(['Veneration','Innovation','GreatStrides','WasteNot','WasteNotII','Manipulation','MastersMend','ImmaculateMend','TrainedPerfection']);
  function run(craft, seq, stats) {
    const sim = new T.Simulation(craft, seq.map(n => new T[n]()), stats, []);
    const res = sim.run(true);
    return { sim, res };
  }
  // craft: Teamcraft Craft object; s: { cms, ctl, cp, level, specialist, levels }
  function solve(craft, s, opts = {}) {
    const stats = new T.CrafterStats(craft.job, s.cms, s.ctl, s.cp, !!s.specialist, false, s.level, s.levels || [s.level, s.level, s.level, s.level, s.level, s.level, s.level, s.level]);
    const avail = ACTIONS.filter(n => { try { const a = new T[n](); const req = a.getLevelRequirement(); return req.level <= s.level; } catch (e) { return false; } });
    const W = opts.width || 40, DEPTH = opts.depth || 30, maxQ = craft.quality || 1, maxP = craft.progress;
    let beam = [{ seq: [], score: 0 }], best = null;
    const evalState = (sim) => {
      const q = Math.min(sim.quality, maxQ) / maxQ, p = Math.min(sim.progression, maxP) / maxP;
      return q * 1000 + p * 150 + sim.durability * 1.5 + sim.availableCP * 0.4;
    };
    const tryFinish = (seq0) => {
      let seq = seq0.slice();
      for (let k = 0; k < 10; k++) {
        let progressed = false;
        for (const n of ['Groundwork', 'CarefulSynthesis', 'BasicSynthesis']) {
          if (!avail.includes(n)) continue;
          let r; try { r = run(craft, seq.concat(n), stats); } catch (e) { continue; }
          const sim = r.sim;
          if (sim.progression >= maxP) {
            const q = Math.min(sim.quality, maxQ), fs = seq.concat(n);
            if (!best || q > best.q || (q === best.q && fs.length < best.seq.length)) best = { seq: fs, q, hq: r.res.hqPercent, sim };
            return;
          }
          if (sim.durability > 0 && sim.availableCP >= 0) { seq = seq.concat(n); progressed = true; break; }
        }
        if (!progressed) return;
      }
    };
    for (let d = 0; d < DEPTH; d++) {
      const next = [];
      for (const node of beam) {
        for (const n of avail) {
          if (n === 'TrainedEye' && node.seq.length) continue;
          if (n === 'MuscleMemory' && node.seq.length) continue;
          if (n === 'Reflect' && node.seq.length) continue;
          const last = node.seq[node.seq.length - 1];
          if (BUFF.has(n) && n === last) continue;
          const seq = node.seq.concat(n);
          let r; try { r = run(craft, seq, stats); } catch (e) { continue; }
          const sim = r.sim, st = sim.steps[sim.steps.length - 1];
          if (!st || st.skipped || (st.success === false && !st.action)) continue;
          if (sim.progression >= maxP) {
            const q = Math.min(sim.quality, maxQ);
            if (!best || q > best.q || (q === best.q && seq.length < best.seq.length)) best = { seq, q, hq: r.res.hqPercent, sim };
            continue;
          }
          if (sim.durability <= 0 || sim.availableCP < 0) continue;
          next.push({ seq, score: evalState(sim) });
          // Also try finishing from here with plain progress actions, so we always have a completed fallback.
          if (d % 2 === 1) tryFinish(seq);
        }
      }
      if (!next.length) break;
      next.sort((a, b) => b.score - a.score);
      // keep variety: dedupe by last 3 actions + score bucket
      const seen = new Set(); beam = [];
      for (const x of next) { const k = x.seq.slice(-3).join('|') + Math.round(x.score); if (seen.has(k)) continue; seen.add(k); beam.push(x); if (beam.length >= W) break; }
      if (best && best.q >= maxQ && d > 4) break;
    }
    if (!best) return { ok: false };
    const macro = best.seq.map(n => `/ac ${/\s/.test(NAMES[n] || n) || /'/.test(NAMES[n] || '') ? '"' + (NAMES[n] || n) + '"' : (NAMES[n] || n)} <wait.${BUFF.has(n) ? 2 : 3}>`);
    return { ok: true, steps: best.seq.map(n => NAMES[n] || n), quality: best.q, maxQuality: maxQ, maxed: best.q >= maxQ, hqPercent: best.hq, macro };
  }
  root.GLSolver = { solve };
})(typeof window !== 'undefined' ? window : globalThis);
