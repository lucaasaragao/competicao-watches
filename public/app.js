const $ = (id) => document.getElementById(id);
const TOKEN_KEY = "relogios_token"; // só a sessão fica no navegador; os votos ficam no servidor
const REFRESH_MS = 10000; // atualiza o resultado a cada 10 s enquanto a votação está aberta

let watches = [];
let selected = null;
let isAdmin = false;
let round = { startedAt: null, endsAt: null, closed: false }; // última situação vinda do servidor
let clockOffset = 0; // diferença entre o relógio do servidor e o do aparelho
let resultsState = null; // { votedFor, mode: "voted" | "already" } enquanto a tela de resultado está aberta
let refreshTimer = null;
let tickTimer = null;

function show(screen) {
  for (const s of ["login", "vote", "done"]) $("screen-" + s).hidden = s !== screen;
  $("logout").hidden = screen === "login";
  document.querySelectorAll("[data-reset]").forEach((b) => (b.hidden = !isAdmin || screen === "login"));
  if (screen !== "done") stopRefresh();
  window.scrollTo(0, 0);
}

async function api(path, options = {}) {
  const token = localStorage.getItem(TOKEN_KEY);
  const res = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: "Bearer " + token } : {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || "Erro inesperado."), { status: res.status, data });
  return data;
}

// Guarda startedAt/endsAt/closed de qualquer resposta do servidor
function updateRound(data) {
  if (!data || !("closed" in data)) return;
  round = { startedAt: data.startedAt, endsAt: data.endsAt, closed: data.closed };
  if (data.now) clockOffset = Date.parse(data.now) - Date.now();
  renderCountdown();
}

// ---------- Contagem regressiva ----------
function timeLeft() {
  if (!round.endsAt) return null;
  return Date.parse(round.endsAt) - (Date.now() + clockOffset);
}

function formatLeft(ms) {
  const min = Math.floor(ms / 60000);
  if (min < 1) return "menos de 1min";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h}h ${String(m).padStart(2, "0")}min` : `${m}min`;
}

function renderCountdown() {
  const left = timeLeft();
  let text = "";
  if (!round.closed) {
    text = left === null ? "Aberta por 24h a partir do primeiro voto" : left > 0 ? `Encerra em ${formatLeft(left)}` : "";
  }
  document.querySelectorAll("[data-countdown]").forEach((el) => {
    el.textContent = text;
    el.hidden = !text;
  });
  $("login-eyebrow").textContent = round.closed ? "Votação encerrada" : "Votação aberta";
  // O prazo acabou com a página aberta: busca o resultado final
  if (!round.closed && left !== null && left <= 0) {
    round.closed = true;
    if (!$("screen-done").hidden) refreshResults();
    else if (!$("screen-vote").hidden) showResults(null, "already");
  }
}

tickTimer = setInterval(renderCountdown, 15000);

// ---------- Login ----------
$("cpf").addEventListener("input", (e) => {
  const d = e.target.value.replace(/\D/g, "").slice(0, 11);
  e.target.value = d
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
});

$("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("login-error").textContent = "";
  try {
    const data = await api("/api/login", {
      method: "POST",
      body: JSON.stringify({ cpf: $("cpf").value }),
    });
    localStorage.setItem(TOKEN_KEY, data.token);
    $("cpf").value = "";
    enter(data);
  } catch (err) {
    $("login-error").textContent = err.message;
  }
});

// Depois do login (ou ao reabrir a página): decide para qual tela ir
function enter(data) {
  isAdmin = Boolean(data.isAdmin);
  updateRound(data);
  if (data.votedFor || data.closed) showResults(data.votedFor, "already");
  else showVote();
}

$("logout").addEventListener("click", () => {
  localStorage.removeItem(TOKEN_KEY);
  selected = null;
  isAdmin = false;
  resultsState = null;
  show("login");
});

// ---------- Votação ----------
function showVote() {
  selected = null;
  resultsState = null;
  $("confirm").disabled = true;
  $("vote-error").textContent = "";
  $("cards").innerHTML = "";
  for (const w of watches) {
    const card = document.createElement("button");
    card.className = "card";
    card.setAttribute("aria-pressed", "false");
    card.innerHTML = `<img alt="" /><h2></h2><p></p>`;
    card.querySelector("img").src = w.image;
    card.querySelector("img").alt = w.name;
    card.querySelector("h2").textContent = w.name;
    card.querySelector("p").textContent = w.description;
    card.addEventListener("click", () => {
      selected = w.id;
      document.querySelectorAll(".card").forEach((c) => c.setAttribute("aria-pressed", String(c === card)));
      $("confirm").disabled = false;
      $("confirm").textContent = `Votar em ${w.name}`;
    });
    $("cards").append(card);
  }
  $("confirm").textContent = "Confirmar voto";
  show("vote");
}

$("confirm").addEventListener("click", async () => {
  if (!selected) return;
  $("confirm").disabled = true;
  try {
    const data = await api("/api/vote", { method: "POST", body: JSON.stringify({ watchId: selected }) });
    updateRound(data);
    showResults(selected, "voted");
  } catch (err) {
    updateRound(err.data);
    if (err.status === 409) return showResults(err.data.votedFor, "already");
    if (err.status === 403) return showResults(null, "already");
    if (err.status === 401) { localStorage.removeItem(TOKEN_KEY); return show("login"); }
    $("vote-error").textContent = err.message;
    $("confirm").disabled = false;
  }
});

// ---------- Resultado ----------
// mode "voted": acabou de votar. mode "already": entrou de novo (já tinha votado ou votação encerrada).
async function showResults(votedFor, mode) {
  resultsState = { votedFor, mode };
  $("done-error").textContent = "";
  $("results").innerHTML = "";
  $("winner").hidden = true;
  $("total").textContent = "";
  show("done");
  await refreshResults();
}

async function refreshResults() {
  if (!resultsState) return;
  let data;
  try {
    data = await api("/api/results");
  } catch (err) {
    $("done-error").textContent = err.message;
    return scheduleRefresh();
  }
  $("done-error").textContent = "";
  updateRound(data);
  renderResults(data);
  scheduleRefresh();
}

function scheduleRefresh() {
  stopRefresh();
  if (resultsState && !round.closed) refreshTimer = setTimeout(refreshResults, REFRESH_MS);
}

function stopRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = null;
}

function renderResults({ total, counts, closed }) {
  const { votedFor, mode } = resultsState;
  const mine = watches.find((w) => w.id === votedFor);
  const top = Math.max(0, ...watches.map((w) => counts[w.id] || 0));
  const winners = closed && top > 0 ? watches.filter((w) => (counts[w.id] || 0) === top) : [];

  if (closed) {
    $("done-eyebrow").textContent = "Resultado final";
    $("done-title").textContent = "Votação encerrada";
    $("winner").hidden = false;
    $("winner").textContent = !winners.length
      ? "Nenhum voto foi registrado."
      : winners.length === 1
        ? `Vencedor: ${winners[0].name}`
        : `Empate entre ${joinNames(winners.map((w) => w.name))}`;
  } else if (mode === "voted") {
    $("done-eyebrow").textContent = "Voto registrado";
    $("done-title").textContent = mine ? `Você votou no ${mine.name}` : "Obrigado!";
  } else {
    $("done-eyebrow").textContent = "Você já votou";
    $("done-title").textContent = "Agora acompanhe a votação";
  }

  // Mantém a ordem do servidor estável para as barras não "pularem" a cada atualização
  const sorted = [...watches].sort((a, b) => (counts[b.id] || 0) - (counts[a.id] || 0));
  const old = new Map([...$("results").children].map((row) => [row.dataset.id, row]));
  $("results").innerHTML = "";
  for (const w of sorted) {
    const n = counts[w.id] || 0;
    const pct = total ? Math.round((n / total) * 100) : 0;
    const isWinner = winners.some((x) => x.id === w.id);
    let row = old.get(w.id);
    const prevWidth = row ? row.querySelector(".bar span").style.width : "0";
    row = document.createElement("div");
    row.dataset.id = w.id;
    row.className = "row" + (w.id === votedFor ? " mine" : "") + (isWinner ? " winner-row" : "");
    row.innerHTML = `<img alt="" /><div><div class="label"><span class="name"></span><small></small></div><div class="bar"><span></span></div></div>`;
    row.querySelector("img").src = w.image;
    row.querySelector("img").alt = w.name;
    row.querySelector(".name").textContent = w.name;
    if (isWinner) row.querySelector(".name").insertAdjacentHTML("beforeend", `<span class="tag win">${winners.length > 1 ? "empate" : "vencedor"}</span>`);
    if (w.id === votedFor) row.querySelector(".name").insertAdjacentHTML("beforeend", '<span class="tag">seu voto</span>');
    row.querySelector("small").textContent = `${pct}% · ${n} ${n === 1 ? "voto" : "votos"}`;
    row.querySelector(".bar span").style.width = prevWidth;
    $("results").append(row);
    requestAnimationFrame(() => requestAnimationFrame(() => (row.querySelector(".bar span").style.width = pct + "%")));
  }
  $("total").textContent = `${total} ${total === 1 ? "voto" : "votos"} no total.`;
}

function joinNames(names) {
  return names.length < 2 ? names.join("") : names.slice(0, -1).join(", ") + " e " + names[names.length - 1];
}

// ---------- Reset (só admin) ----------
document.querySelectorAll("[data-reset]").forEach((btn) =>
  btn.addEventListener("click", async () => {
    if (!confirm("Resetar a votação? Todos os votos serão apagados e uma nova rodada de 24 horas começa agora.")) return;
    btn.disabled = true;
    try {
      const data = await api("/api/reset", { method: "POST" });
      updateRound(data);
      showVote();
    } catch (err) {
      if (err.status === 401) { localStorage.removeItem(TOKEN_KEY); return show("login"); }
      alert(err.message);
    } finally {
      btn.disabled = false;
    }
  })
);

// Ao voltar para a aba, atualiza logo em vez de esperar o próximo ciclo
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && !$("screen-done").hidden) refreshResults();
});

// ---------- Início ----------
(async function init() {
  watches = await api("/api/watches");
  if (!localStorage.getItem(TOKEN_KEY)) {
    show("login");
    api("/api/results").then(updateRound).catch(() => {});
    return;
  }
  try {
    enter(await api("/api/me"));
  } catch {
    localStorage.removeItem(TOKEN_KEY);
    show("login");
  }
})();
