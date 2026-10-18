const STORAGE_KEY = "quiquiz:onboarding:v2";

function done() {
  try {
    localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function shouldShowOnboarding() {
  try {
    return localStorage.getItem(STORAGE_KEY) !== "1";
  } catch {
    return true;
  }
}

function clearRoot(root) {
  root.hidden = true;
  root.className = "onboarding";
  root.replaceChildren();
}

/**
 * @param {{
 *   openFiltersDemo?: () => Promise<Element | null>,
 *   finishHome?: () => void,
 * }} [hooks]
 */
export function startOnboarding(hooks = {}) {
  const root = document.getElementById("onboarding");
  if (!root || !shouldShowOnboarding()) return;

  let index = 0;
  /** @type {"intro" | "spotlight"} */
  let phase = "intro";

  const introSteps = [
    {
      pose: "assets/mascot/love.png",
      text: "Salut ! Moi c’est Cui-Cui. Bienvenue sur QuiQuiz — on va reconnaître des espèces (et des pays) en s’amusant.",
    },
    {
      pose: "assets/mascot/point-left.png",
      text: "Choisis un thème à gauche, ou une région. Ensuite tu picks un mode et un niveau.",
    },
  ];

  const finish = () => {
    done();
    clearRoot(root);
    hooks.finishHome?.();
  };

  const renderIntro = () => {
    phase = "intro";
    const step = introSteps[index];
    const lastIntro = index >= introSteps.length - 1;
    root.hidden = false;
    root.className = "onboarding";
    root.replaceChildren();

    const panel = document.createElement("div");
    panel.className = "onboarding-panel";

    const img = document.createElement("img");
    img.className = "onboarding-mascot";
    img.src = step.pose;
    img.alt = "Cui-Cui";
    panel.appendChild(img);

    const bubble = document.createElement("div");
    bubble.className = "onboarding-bubble";
    const name = document.createElement("p");
    name.className = "onboarding-name";
    name.textContent = "Cui-Cui";
    const text = document.createElement("p");
    text.className = "onboarding-text";
    text.textContent = step.text;
    bubble.append(name, text);
    panel.appendChild(bubble);

    const actions = document.createElement("div");
    actions.className = "onboarding-actions";

    const skip = document.createElement("button");
    skip.type = "button";
    skip.className = "btn secondary";
    skip.textContent = "Passer";
    skip.addEventListener("click", finish);

    const next = document.createElement("button");
    next.type = "button";
    next.className = "btn";
    next.textContent = lastIntro ? "Voir les filtres" : "Suite";
    next.addEventListener("click", async () => {
      if (!lastIntro) {
        index += 1;
        renderIntro();
        return;
      }
      await renderSpotlight();
    });

    actions.append(skip, next);
    panel.appendChild(actions);
    root.appendChild(panel);
  };

  const placeSpotlight = (target) => {
    const hole = root.querySelector(".onboarding-hole");
    if (!hole || !target) return;
    const rect = target.getBoundingClientRect();
    const pad = 10;
    hole.style.left = `${Math.max(8, rect.left - pad)}px`;
    hole.style.top = `${Math.max(8, rect.top - pad)}px`;
    hole.style.width = `${Math.min(window.innerWidth - 16, rect.width + pad * 2)}px`;
    hole.style.height = `${Math.min(window.innerHeight - 16, rect.height + pad * 2)}px`;
  };

  const renderSpotlight = async () => {
    phase = "spotlight";
    root.hidden = false;
    root.className = "onboarding is-spotlight";
    root.replaceChildren();

    const scrim = document.createElement("div");
    scrim.className = "onboarding-scrim";
    const hole = document.createElement("div");
    hole.className = "onboarding-hole";
    hole.setAttribute("aria-hidden", "true");

    const panel = document.createElement("div");
    panel.className = "onboarding-panel onboarding-panel--spotlight";

    const img = document.createElement("img");
    img.className = "onboarding-mascot";
    img.src = "assets/mascot/investigator.png";
    img.alt = "Cui-Cui";

    const bubble = document.createElement("div");
    bubble.className = "onboarding-bubble";
    const name = document.createElement("p");
    name.className = "onboarding-name";
    name.textContent = "Cui-Cui";
    const text = document.createElement("p");
    text.className = "onboarding-text";
    text.textContent =
      "Ici, les filtres : par défaut tout est coché, tu joues sur tout le quiz. Tu peux décocher un groupe pour l’exclure — pratique pour réviser une partie seulement.";
    bubble.append(name, text);

    const actions = document.createElement("div");
    actions.className = "onboarding-actions";
    const doneBtn = document.createElement("button");
    doneBtn.type = "button";
    doneBtn.className = "btn";
    doneBtn.textContent = "Compris, c’est parti !";
    doneBtn.addEventListener("click", finish);
    actions.appendChild(doneBtn);

    panel.append(img, bubble, actions);
    root.append(scrim, hole, panel);

    let target = null;
    try {
      target = (await hooks.openFiltersDemo?.()) || document.querySelector(".groups");
    } catch {
      target = document.querySelector(".groups");
    }

    if (!target) {
      text.textContent =
        "Sur la page d’un quiz, regarde le bloc « Groupes » en bas : tout est coché au départ, et tu peux en retirer pour filtrer.";
      return;
    }

    target.setAttribute("data-onboarding-target", "true");
    placeSpotlight(target);
    const onResize = () => placeSpotlight(target);
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    const cleanup = () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
      target.removeAttribute("data-onboarding-target");
    };
    const origFinish = finish;
    // wrap once
    doneBtn.onclick = () => {
      cleanup();
      origFinish();
    };
  };

  renderIntro();
}
