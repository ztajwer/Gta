import "@fontsource/barlow-condensed/latin-400.css";
import "@fontsource/barlow-condensed/latin-700.css";
import "@fontsource/barlow-condensed/latin-800.css";

const playButton = document.getElementById("play-btn");
let gamePromise;

// Keep the app shell and generated game chunk available for the next launch.
// Registration is intentionally non-blocking so it never delays the first paint.
if ("serviceWorker" in navigator && window.location.protocol !== "file:") {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
  }, { once: true });
}

function loadGame() {
  gamePromise ??= import("./game.js").catch((error) => { gamePromise = null; throw error; });
  return gamePromise;
}

const warmGame = () => { void loadGame().catch(() => {}); };
if ("requestIdleCallback" in window) window.requestIdleCallback(warmGame, { timeout: 1200 });
else window.setTimeout(warmGame, 400);

playButton.addEventListener("click", async () => {
  if (playButton.disabled) return;
  playButton.disabled = true;
  try {
    const { startGame } = await loadGame();
    startGame();
  } catch (error) {
    const banner = document.getElementById("error-banner");
    banner.textContent = `Game could not start: ${error.message}`;
    banner.classList.remove("hidden");
    playButton.disabled = false;
    console.error(error);
  }
});
