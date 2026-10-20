const $ = (id) => document.getElementById(id);
const TOKEN_KEY = "relogios_token"; // só a sessão fica no navegador; os votos ficam no servidor

let watches = [];
let selected = null;

function show(screen) {
  for (const s of ["login", "vote", "done"]) $("screen-" + s).hidden = s !== screen;
  $("logout").hidden = screen === "login";
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
    const { token, votedFor } = await api("/api/login", {
      method: "POST",
      body: JSON.stringify({ cpf: $("cpf").value }),
    });
    localStorage.setItem(TOKEN_KEY, token);
    $("cpf").value = "";
    votedFor ? showResults(votedFor) : showVote();
  } catch (err) {
    $("login-error").textContent = err.message;
  }
});

$("logout").addEventListener("click", () => {
  localStorage.removeItem(TOKEN_KEY);
  selected = null;
  show("login");
});

// ---------- Votação ----------
function showVote() {
  selected = null;
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
    await api("/api/vote", { method: "POST", body: JSON.stringify({ watchId: selected }) });
    showResults(selected);
  } catch (err) {
    if (err.status === 409) return showResults(err.data.votedFor);
    if (err.status === 401) { localStorage.removeItem(TOKEN_KEY); return show("login"); }
    $("vote-error").textContent = err.message;
    $("confirm").disabled = false;
  }
});

// ---------- Resultado ----------
async function showResults(votedFor) {
  const { total, counts } = await api("/api/results");
  const mine = watches.find((w) => w.id === votedFor);
  $("done-title").textContent = mine ? `Você votou no ${mine.name}` : "Obrigado!";
  $("results").innerHTML = "";
  const sorted = [...watches].sort((a, b) => (counts[b.id] || 0) - (counts[a.id] || 0));
  for (const w of sorted) {
    const n = counts[w.id] || 0;
    const pct = total ? Math.round((n / total) * 100) : 0;
    const row = document.createElement("div");
    row.className = "row" + (w.id === votedFor ? " mine" : "");
    row.innerHTML = `<img alt="" /><div><div class="label"><span class="name"></span><small></small></div><div class="bar"><span style="width:0"></span></div></div>`;
    row.querySelector("img").src = w.image;
    row.querySelector(".name").textContent = w.name;
    if (w.id === votedFor) row.querySelector(".name").insertAdjacentHTML("beforeend", '<span class="tag">seu voto</span>');
    row.querySelector("small").textContent = `${pct}% · ${n} ${n === 1 ? "voto" : "votos"}`;
    $("results").append(row);
    requestAnimationFrame(() => (row.querySelector(".bar span").style.width = pct + "%"));
  }
  $("total").textContent = `${total} ${total === 1 ? "voto" : "votos"} no total.`;
  show("done");
}

// ---------- Início ----------
(async function init() {
  watches = await api("/api/watches");
  if (!localStorage.getItem(TOKEN_KEY)) return show("login");
  try {
    const { votedFor } = await api("/api/me");
    votedFor ? showResults(votedFor) : showVote();
  } catch {
    localStorage.removeItem(TOKEN_KEY);
    show("login");
  }
})();
