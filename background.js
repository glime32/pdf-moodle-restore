// PDF Moodle Restore
// Au demarrage d Helium : si des onglets PDF Viewer pointent vers Moodle et que
// la session Moodle est perdue, ouvre la connexion CAS, attend la connexion,
// revient sur ton onglet et recharge les PDF sur place.

const PREFIX = "chrome-extension://oemmndcbldboiebfnladdacbdfmadadm/";
const MOODLE = "https://moodle.umontpellier.fr/";
const LOGIN = MOODLE + "login/index.php?authCAS=CAS";
const S = chrome.storage.session;
const DUREE_MAX = 120000; // abandon apres 2 min

let lance = false;
let fini = false;

const pause = ms => new Promise(r => setTimeout(r, ms));
const urlDe = t => t.url || t.pendingUrl || "";
const estPdfMoodle = t => urlDe(t).startsWith(PREFIX + MOODLE);
const pdfsMoodle = async () => (await chrome.tabs.query({})).filter(estPdfMoodle);

// Moodle renvoie le PDF ? => connecte. On coupe des les en-tetes (rapide).
async function connecte(url, ms) {
  const c = new AbortController();
  const timer = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(url, { credentials: "include", cache: "no-store", signal: c.signal });
    const ok = r.ok && (r.headers.get("content-type") || "").includes("pdf");
    c.abort();
    return ok;
  } catch (e) {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// Connecte : ferme l onglet CAS, revient sur ton onglet, recharge les PDF sur place.
async function finir() {
  if (fini) return;
  fini = true;
  const { loginTab, retour, deja } = await S.get(["loginTab", "retour", "deja"]);
  if (deja) return;
  await S.set({ deja: true });
  chrome.alarms.clear("check");
  if (retour) chrome.tabs.update(retour, { active: true }).catch(() => {});
  if (loginTab) chrome.tabs.remove(loginTab).catch(() => {});
  for (const t of await pdfsMoodle()) {
    if (!t.discarded && t.status !== "unloaded") chrome.tabs.reload(t.id).catch(() => {});
  }
}

async function verifier() {
  if (fini) return;
  const { test, deja } = await S.get(["test", "deja"]);
  if (!test || deja) return;
  if (await connecte(test, 4000)) finir();
}

// Boucle rapide : reteste toutes les secondes, recharge l onglet CAS s il est
// tombe sur une page d erreur (wifi pas encore pret au demarrage).
async function boucle(test) {
  const debut = Date.now();
  let tour = 0;
  while (!fini && Date.now() - debut < DUREE_MAX) {
    await pause(1000);
    if (fini) return;
    if (await connecte(test, 3000)) return finir();
    tour++;
    if (tour % 6 === 0) {
      const { loginTab } = await S.get("loginTab");
      if (!loginTab) continue;
      const tab = await chrome.tabs.get(loginTab).catch(() => null);
      if (!tab) return; // onglet CAS ferme a la main : on arrete
      if (!urlDe(tab).includes("umontpellier.fr")) chrome.tabs.update(loginTab, { url: LOGIN });
    }
  }
}

async function demarrer() {
  if (lance) return;
  const tabs = await pdfsMoodle();
  if (!tabs.length || lance) return;
  lance = true;

  const test = urlDe(tabs[0]).slice(PREFIX.length);
  await S.set({ test, deja: false });
  if (await connecte(test, 2500)) return finir();

  // retient ton onglet actuel pour y revenir apres
  const [actif] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  // onglet CAS au premier plan : Bitwarden ne remplit bien que l onglet visible
  const tab = await chrome.tabs.create({ url: LOGIN, active: true });
  await S.set({ loginTab: tab.id, retour: actif ? actif.id : null });
  chrome.alarms.create("check", { periodInMinutes: 0.5 }); // filet de securite
  boucle(test);
}

chrome.runtime.onStartup.addListener(() => {
  [0, 500, 1500, 4000].forEach(ms => setTimeout(demarrer, ms));
});

// chaque page Moodle chargee (hors page login) : on reteste tout de suite.
// Le filtre ne reveille l extension que pour Moodle, pas a chaque onglet.
chrome.webNavigation.onCompleted.addListener(d => {
  if (d.frameId === 0 && !d.url.includes("/login/")) verifier();
}, { url: [{ hostEquals: "moodle.umontpellier.fr" }] });

// ---------- Mise a jour auto ----------
// Le dossier est un clone git mis a jour par un timer systemd (install.sh).
// Si le manifest sur le disque a une version plus recente que celle chargee,
// l extension se recharge toute seule (seulement hors connexion en cours).
async function majDispo() {
  try {
    const r = await fetch(chrome.runtime.getURL("manifest.json"), { cache: "no-store" });
    const disque = (await r.json()).version;
    return disque !== chrome.runtime.getManifest().version;
  } catch (e) {
    return false;
  }
}

async function verifierMaj() {
  if (lance && !fini) return; // pas pendant une connexion
  if (await majDispo()) chrome.runtime.reload();
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create("maj", { periodInMinutes: 60 }); // au rythme du git pull horaire
});
chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create("maj", { periodInMinutes: 60 }); // au rythme du git pull horaire
});

chrome.alarms.onAlarm.addListener(a => {
  if (a.name === "check") verifier();
  if (a.name === "maj") verifierMaj();
});
