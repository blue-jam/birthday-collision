const $ = (selector) => document.querySelector(selector);

const elements = {
  form: $("#simulationForm"),
  days: $("#days"),
  people: $("#people"),
  trials: $("#trials"),
  observedPairs: $("#observedPairs"),
  formulaValue: $("#formulaValue"),
  button: $("#runButton"),
  buttonLabel: $("#buttonLabel"),
  progress: $("#progressBar"),
  error: $("#errorMessage"),
  observedMean: $("#observedMean"),
  difference: $("#difference"),
  differenceRate: $("#differenceRate"),
  deviation: $("#standardDeviation"),
  pValue: $("#pValue"),
  pValueDetail: $("#pValueDetail"),
  caption: $("#resultCaption"),
  results: $("#results"),
  convergence: $("#convergenceChart"),
  distribution: $("#distributionChart"),
  convergenceEmpty: $("#convergenceEmpty"),
  distributionEmpty: $("#distributionEmpty"),
};

let lastResult = null;
let runId = 0;

function theoreticalMean(m, n) {
  return (n * (n - 1)) / (2 * m);
}

function compactNumber(value) {
  if (Math.abs(value) >= 1e6) return value.toExponential(3);
  if (Math.abs(value) >= 1000) return value.toLocaleString("ja-JP", { maximumFractionDigits: 2 });
  return value.toLocaleString("ja-JP", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}

function updateFormula() {
  const m = Number(elements.days.value);
  const n = Number(elements.people.value);
  if (m > 0 && n >= 2) {
    elements.formulaValue.textContent = compactNumber(theoreticalMean(m, n));
    elements.observedPairs.max = String((n * (n - 1)) / 2);
  }
}

[elements.days, elements.people].forEach((input) => input.addEventListener("input", updateFormula));

function readInputs() {
  const m = Number(elements.days.value);
  const n = Number(elements.people.value);
  const trials = Number(elements.trials.value);
  const observed = Number(elements.observedPairs.value);
  if (![m, n, trials, observed].every(Number.isInteger)) throw new Error("すべて整数で入力してください。");
  if (m < 1 || m > 100000) throw new Error("1年の日数は1〜100,000の範囲で入力してください。");
  if (n < 2 || n > 100000) throw new Error("人数は2〜100,000の範囲で入力してください。");
  if (trials < 1 || trials > 1000000) throw new Error("試行回数は1〜1,000,000の範囲で入力してください。");
  const maxPairs = (n * (n - 1)) / 2;
  if (observed < 0 || observed > maxPairs) throw new Error(`実際のペア数は0〜${maxPairs.toLocaleString("ja-JP")}の範囲で入力してください。`);
  if (n * trials > 2e8) throw new Error("人数 × 試行回数は2億以下にしてください。");
  return { m, n, trials, observed };
}

function countPairs(m, n, counts, used) {
  let pairs = 0;
  used.length = 0;
  for (let person = 0; person < n; person++) {
    const day = Math.floor(Math.random() * m);
    if (counts[day] === 0) used.push(day);
    pairs += counts[day];
    counts[day]++;
  }
  for (const day of used) counts[day] = 0;
  return pairs;
}

async function simulate({ m, n, trials, observed }, currentRun) {
  const counts = new Uint32Array(m);
  const used = [];
  const frequencies = new Map();
  const convergence = [];
  const maxPoints = 900;
  const stride = Math.max(1, Math.ceil(trials / maxPoints));
  let sum = 0;
  let sumSquares = 0;
  const chunkSize = Math.max(10, Math.min(2000, Math.floor(150000 / n)));

  for (let start = 0; start < trials; start += chunkSize) {
    const end = Math.min(start + chunkSize, trials);
    for (let i = start; i < end; i++) {
      const pairs = countPairs(m, n, counts, used);
      sum += pairs;
      sumSquares += pairs * pairs;
      frequencies.set(pairs, (frequencies.get(pairs) || 0) + 1);
      if ((i + 1) % stride === 0 || i === trials - 1) convergence.push({ x: i + 1, y: sum / (i + 1) });
    }
    if (currentRun !== runId) return null;
    elements.progress.style.width = `${(end / trials) * 100}%`;
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }

  const mean = sum / trials;
  const variance = Math.max(0, sumSquares / trials - mean * mean);
  return { m, n, trials, observed, theoretical: theoreticalMean(m, n), mean, deviation: Math.sqrt(variance), frequencies, convergence };
}

// Probability-orderingによる両側検定。シミュレーション頻度を各点の確率推定値とする。
function calculateTwoSidedPValue(frequencies, observed, trials) {
  const observedFrequency = frequencies.get(observed) || 0;
  let includedTrials = 0;
  for (const frequency of frequencies.values()) {
    if (frequency <= observedFrequency) includedTrials += frequency;
  }
  // 有限回のモンテカルロ標本で p=0 と断定しないための add-one 補正。
  return {
    value: Math.min(1, (includedTrials + 1) / (trials + 1)),
    observedFrequency,
    includedTrials,
  };
}

function formatPValue(value, trials) {
  const digits = Math.min(6, Math.max(4, String(trials).length));
  return value < 0.0001 ? value.toExponential(2) : value.toFixed(digits);
}

elements.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  elements.error.textContent = "";
  let settings;
  try { settings = readInputs(); } catch (error) {
    elements.error.textContent = error.message;
    return;
  }

  const currentRun = ++runId;
  elements.button.disabled = true;
  elements.buttonLabel.textContent = "計算しています…";
  elements.progress.style.width = "0%";
  const result = await simulate(settings, currentRun);
  if (!result) return;
  lastResult = result;
  showResult(result);
  elements.button.disabled = false;
  elements.buttonLabel.textContent = "もう一度実行する";
  elements.progress.style.width = "100%";
});

function showResult(result) {
  const diff = result.mean - result.theoretical;
  const rate = result.theoretical === 0 ? 0 : (Math.abs(diff) / result.theoretical) * 100;
  elements.observedMean.textContent = compactNumber(result.mean);
  elements.difference.textContent = `${diff >= 0 ? "+" : "−"}${compactNumber(Math.abs(diff))}`;
  elements.differenceRate.textContent = `理論値から ${rate.toFixed(2)}%`;
  elements.deviation.textContent = compactNumber(result.deviation);
  const p = calculateTwoSidedPValue(result.frequencies, result.observed, result.trials);
  result.pValueResult = p;
  elements.pValue.textContent = formatPValue(p.value, result.trials);
  elements.pValueDetail.textContent = `xobs = ${result.observed.toLocaleString("ja-JP")}（${p.includedTrials.toLocaleString("ja-JP")} / ${result.trials.toLocaleString("ja-JP")} 試行を算入）`;
  elements.caption.textContent = `${result.trials.toLocaleString("ja-JP")}回のランダムな一年を観測`;
  elements.convergenceEmpty.hidden = true;
  elements.distributionEmpty.hidden = true;
  drawAll();
  if (window.matchMedia("(max-width: 800px)").matches) {
    elements.results.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function setupCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  return { ctx, width: rect.width, height: rect.height };
}

function drawAxes(ctx, width, height, margin, xLabels, yLabels) {
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;
  ctx.font = '10px "DM Mono", monospace';
  ctx.fillStyle = "#81878e";
  ctx.strokeStyle = "#e2e1dc";
  ctx.lineWidth = 1;
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  yLabels.forEach(({ ratio, label }) => {
    const y = margin.top + plotH * (1 - ratio);
    ctx.beginPath(); ctx.moveTo(margin.left, y); ctx.lineTo(width - margin.right, y); ctx.stroke();
    ctx.fillText(label, margin.left - 9, y);
  });
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  xLabels.forEach(({ ratio, label }) => ctx.fillText(label, margin.left + plotW * ratio, height - margin.bottom + 10));
}

function drawConvergence(result) {
  const { ctx, width, height } = setupCanvas(elements.convergence);
  const margin = { left: 54, right: 14, top: 18, bottom: 36 };
  const values = result.convergence.map((p) => p.y).concat(result.theoretical);
  let min = Math.min(...values), max = Math.max(...values);
  const padding = Math.max((max - min) * .16, result.theoretical * .035, .05);
  min = Math.max(0, min - padding); max += padding;
  const yRatio = (v) => (v - min) / (max - min || 1);
  const formatTick = (v) => Math.abs(v) >= 1000 ? v.toExponential(1) : v.toFixed(v < 10 ? 2 : 1);
  drawAxes(ctx, width, height, margin,
    [{ ratio: 0, label: "1" }, { ratio: .5, label: Math.round(result.trials / 2).toLocaleString("ja-JP") }, { ratio: 1, label: result.trials.toLocaleString("ja-JP") }],
    [0, .5, 1].map((ratio) => ({ ratio, label: formatTick(min + (max - min) * ratio) })));
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;
  const theoryY = margin.top + plotH * (1 - yRatio(result.theoretical));
  ctx.save(); ctx.setLineDash([5, 5]); ctx.strokeStyle = "#17243b"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(margin.left, theoryY); ctx.lineTo(width - margin.right, theoryY); ctx.stroke(); ctx.restore();
  ctx.beginPath();
  result.convergence.forEach((point, index) => {
    const x = margin.left + ((point.x - 1) / Math.max(1, result.trials - 1)) * plotW;
    const y = margin.top + plotH * (1 - yRatio(point.y));
    index ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  });
  ctx.strokeStyle = "#f06449"; ctx.lineWidth = 2; ctx.lineJoin = "round"; ctx.stroke();
  const last = result.convergence.at(-1);
  const lx = margin.left + ((last.x - 1) / Math.max(1, result.trials - 1)) * plotW;
  const ly = margin.top + plotH * (1 - yRatio(last.y));
  ctx.beginPath(); ctx.arc(lx, ly, 4, 0, Math.PI * 2); ctx.fillStyle = "#f06449"; ctx.fill();
}

function drawDistribution(result) {
  const { ctx, width, height } = setupCanvas(elements.distribution);
  const margin = { left: 47, right: 10, top: 18, bottom: 36 };
  const observedFrequency = result.pValueResult.observedFrequency;
  let entries = [...result.frequencies.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([pairs, count]) => [pairs, count, count <= observedFrequency ? count : 0]);
  const maxBars = Math.max(12, Math.floor((width - margin.left - margin.right) / 8));
  let binSize = 1;
  if (entries.length > maxBars) {
    const range = entries.at(-1)[0] - entries[0][0] + 1;
    binSize = Math.ceil(range / maxBars);
    const binned = new Map();
    const origin = entries[0][0];
    entries.forEach(([pairs, count, included]) => {
      const start = origin + Math.floor((pairs - origin) / binSize) * binSize;
      const bin = binned.get(start) || [0, 0];
      bin[0] += count;
      bin[1] += included;
      binned.set(start, bin);
    });
    entries = [...binned.entries()].map(([start, [count, included]]) => [start, count, included]);
  }
  const maxFrequency = Math.max(...entries.map(([, count]) => count));
  const maxPercent = (maxFrequency / result.trials) * 100;
  const formatPair = (value) => value >= 10000 ? value.toExponential(1) : String(value);
  const first = entries[0][0], last = entries.at(-1)[0];
  const domainFirst = Math.min(first, result.observed);
  const domainLast = Math.max(last + binSize - 1, result.observed);
  drawAxes(ctx, width, height, margin,
    [{ ratio: 0, label: formatPair(domainFirst) }, { ratio: .5, label: formatPair(Math.round((domainFirst + domainLast) / 2)) }, { ratio: 1, label: formatPair(domainLast) }],
    [0, .5, 1].map((ratio) => ({ ratio, label: `${(maxPercent * ratio).toFixed(maxPercent < 10 ? 1 : 0)}%` })));
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;
  const domainSpan = Math.max(1, domainLast - domainFirst + 1);
  const slot = plotW * binSize / domainSpan;
  const barW = Math.max(1, slot - Math.min(3, slot * .2));
  entries.forEach(([pairs, count, included]) => {
    const barH = (count / maxFrequency) * plotH;
    const x = margin.left + ((pairs - domainFirst) / domainSpan) * plotW + (slot - barW) / 2;
    const y = margin.top + plotH - barH;
    ctx.fillStyle = "#2e73a9";
    ctx.fillRect(x, y, barW, barH);
    if (included > 0) {
      const includedH = (included / maxFrequency) * plotH;
      ctx.fillStyle = "#f06449";
      ctx.fillRect(x, margin.top + plotH - includedH, barW, includedH);
    }
  });
  ctx.save();
  const theoryPosition = (result.theoretical - domainFirst) / domainSpan;
  if (theoryPosition >= 0 && theoryPosition <= 1) {
    const x = margin.left + theoryPosition * plotW;
    ctx.strokeStyle = "#f06449"; ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(x, margin.top); ctx.lineTo(x, margin.top + plotH); ctx.stroke();
  }
  ctx.restore();
  const observedX = margin.left + ((result.observed - domainFirst + .5) / domainSpan) * plotW;
  ctx.save();
  ctx.strokeStyle = "#17243b"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(observedX, margin.top); ctx.lineTo(observedX, margin.top + plotH); ctx.stroke();
  ctx.restore();
}

function drawAll() {
  if (!lastResult) return;
  drawConvergence(lastResult);
  drawDistribution(lastResult);
}

let resizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(drawAll, 120);
});

updateFormula();
