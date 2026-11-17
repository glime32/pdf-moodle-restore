// PDF Moodle Restore
// Au demarrage d Helium : si des onglets PDF Viewer pointent vers Moodle et que
// la session Moodle est perdue, ouvre la connexion CAS, attend la connexion,
// revient sur ton onglet et recharge les PDF sur place.

const PREFIX = "chrome-extension://oemmndcbldboiebfnladdacbdfmadadm/";
const MOODLE = "https://moodle.umontpellier.fr/";
// tout droit sur la page CAS : 1 redirection au lieu de 4 en passant par Moodle
const LOGIN = "https://cas.umontpellier.fr/cas/login?service=" + encodeURIComponent(MOODLE + "login/index.php?authCAS=CAS");
const PDF_VIEWER = PREFIX.slice(19, -1);
const NOUVEL_ONGLET = "lhcecfkpdfbpdlocekmammaghmhpedig";
const S = chrome.storage.session;
const DUREE_MAX = 120000; // abandon apres 2 min

let lance = false;
let fini = false;

const pause = ms => new Promise(r => setTimeout(r, ms));
const urlDe = t => t.url || t.pendingUrl || "";
const estPdfMoodle = t => urlDe(t).startsWith(PREFIX + MOODLE);
const pdfsMoodle = async () => (await chrome.tabs.query({})).filter(estPdfMoodle);

// Le lecteur PDF garde une copie locale de certains PDF : ceux-là n'ont pas
// besoin de connexion. Un lecteur qui ne repond pas = tous les onglets comptent.
async function sansCopie(tabs) {
  if (!tabs.length) return tabs;
  try {
    const locales = await chrome.runtime.sendMessage(PDF_VIEWER, {
      action: "copiesMoodle",
      urls: tabs.map(t => urlDe(t).slice(PREFIX.length))
    });
    if (Array.isArray(locales)) return tabs.filter((t, i) => !locales[i]);
  } catch (e) {}
  return tabs;
}

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

// L extension « Nouvel onglet » (si elle est la) sait se connecter sans rien
// afficher : on essaie d abord, deux fois si le Wi-Fi n est pas encore pret.
async function sansOnglet(test) {
  for (let essai = 0; essai < 2; essai++) {
    let r = null;
    try {
      r = await Promise.race([
        chrome.runtime.sendMessage(NOUVEL_ONGLET, { type: "connecterMoodle" }),
        pause(30000).then(() => null)
      ]);
    } catch (e) {
      return false;
    }
    if (r && r.ok) return connecte(test, 4000);
    if (!r || r.etat !== "injoignable") return false;
    await pause(3000);
  }
  return false;
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
  for (const t of await sansCopie(await pdfsMoodle())) {
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
  const tabs = await sansCopie(await pdfsMoodle());
  if (!tabs.length || lance) return;
  lance = true;

  const test = urlDe(tabs[0]).slice(PREFIX.length);
  await S.set({ test, deja: false });
  if (await connecte(test, 2500)) return finir();
  if (await sansOnglet(test)) return finir();

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
