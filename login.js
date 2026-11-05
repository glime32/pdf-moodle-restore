// Connexion auto : clique "CAS - Universite de Montpellier" sur Moodle,
// puis "Se connecter" sur la page CAS des que Bitwarden a rempli le mot de passe.
(() => {
  // anti-boucle : 1 essai max par 30 s (mauvais mot de passe => pas de spam)
  const now = Date.now();
  if (now - (+sessionStorage.getItem("autoLogin") || 0) < 30000) return;

  const surMoodle = location.hostname === "moodle.umontpellier.fr";
  if (surMoodle && !location.pathname.startsWith("/login/")) return;

  const texte = el => (el.innerText || el.value || el.textContent || "").toLowerCase();

  function essayer() {
    if (surMoodle) {
      const b = [...document.querySelectorAll("a, button")]
        .find(el => texte(el).includes("cas - universit"));
      if (!b) return false;
      sessionStorage.setItem("autoLogin", now);
      b.click();
      return true;
    }
    const mdp = document.querySelector("input[type=password]");
    if (!mdp || !mdp.value || !mdp.form) return false;
    sessionStorage.setItem("autoLogin", now);
    const b = [...mdp.form.querySelectorAll("button, input[type=submit]")]
      .find(el => texte(el).includes("connecter")) || mdp.form.querySelector("[type=submit]");
    b ? b.click() : mdp.form.requestSubmit();
    return true;
  }

  // reagit tout de suite a chaque changement de la page (remplissage Bitwarden
  // compris) + petit sondage au cas ou, pendant 60 s max
  let fait = false;
  const tenter = () => {
    if (fait) return;
    if (essayer()) { fait = true; obs.disconnect(); clearInterval(t); }
  };
  const obs = new MutationObserver(tenter);
  obs.observe(document, { childList: true, subtree: true, attributes: true });
  document.addEventListener("input", tenter, true);
  document.addEventListener("change", tenter, true);
  const t = setInterval(tenter, 100);
  setTimeout(() => { obs.disconnect(); clearInterval(t); }, 60000);
})();
