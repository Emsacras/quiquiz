const STORAGE_KEY = "quiquiz:onboarding:v1";

const STEPS = [
  {
    pose: "assets/mascot/cui-cui.png",
    text: "Salut ! Moi c’est Cui-Cui. Bienvenue sur QuiQuiz — on va reconnaître des espèces (et des pays) en s’amusant.",
  },
  {
    pose: "assets/mascot/cui-cui-think.png",
    text: "Choisis un thème, un niveau, puis une question. Les pastilles A B C D t’aident à répondre vite.",
  },
  {
    pose: "assets/mascot/cui-cui.png",
    text: "Tu peux aussi ouvrir l’onglet Référence pour réviser. Prêt à jouer ?",
  },
];

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

export function startOnboarding() {
  const root = document.getElementById("onboarding");
  if (!root || !shouldShowOnboarding()) return;

  let index = 0;

  const render = () => {
    const step = STEPS[index];
    const last = index >= STEPS.length - 1;
    root.hidden = false;
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
    bubble.appendChild(name);
    bubble.appendChild(text);
    panel.appendChild(bubble);

    const actions = document.createElement("div");
    actions.className = "onboarding-actions";

    const skip = document.createElement("button");
    skip.type = "button";
    skip.className = "btn secondary";
    skip.textContent = "Passer";
    skip.addEventListener("click", () => {
      done();
      root.hidden = true;
      root.replaceChildren();
    });

    const next = document.createElement("button");
    next.type = "button";
    next.className = "btn";
    next.textContent = last ? "C’est parti !" : "Suite";
    next.addEventListener("click", () => {
      if (last) {
        done();
        root.hidden = true;
        root.replaceChildren();
        return;
      }
      index += 1;
      render();
    });

    actions.appendChild(skip);
    actions.appendChild(next);
    panel.appendChild(actions);
    root.appendChild(panel);
  };

  render();
}
