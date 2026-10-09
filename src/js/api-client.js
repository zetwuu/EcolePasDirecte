(function() {
  const isLocal = ["localhost", "127.0.0.1"].includes(window.location.hostname);
  const defaultUrl = isLocal
    ? "http://localhost:3000"
    : "https://europe-west1-ecolepasdirect.cloudfunctions.net/backend";
  const baseUrl = (window.EPD_API_URL || defaultUrl).replace(/\/$/, "");

  async function getToken() {
    const auth = window.firebase?.auth?.();
    const savedToken = sessionStorage.getItem("firebaseIdToken");
    if (auth?.currentUser) {
      const token = await auth.currentUser.getIdToken();
      sessionStorage.setItem("firebaseIdToken", token);
      return token;
    }
    if (sessionStorage.getItem("isLoggedIn") === "true" && savedToken) return savedToken;
    if (!auth) throw new Error("Firebase Auth n'est pas initialisé.");

    return new Promise((resolve, reject) => {
      let unsubscribe = null;
      const timeout = setTimeout(() => {
        unsubscribe?.();
        reject(new Error("Connexion Firebase introuvable. Reconnecte-toi."));
      }, 5000);

      unsubscribe = auth.onAuthStateChanged((user) => {
        clearTimeout(timeout);
        unsubscribe?.();
        if (user) {
          user.getIdToken().then((token) => {
            sessionStorage.setItem("firebaseIdToken", token);
            resolve(token);
          }, reject);
        }
        else reject(new Error("Connexion Firebase introuvable. Reconnecte-toi."));
      }, (error) => {
        clearTimeout(timeout);
        unsubscribe?.();
        reject(error);
      });
    });
  }

  async function request(path, options = {}) {
    const token = options.token || await getToken();
    const headers = { Authorization: `Bearer ${token}` };
    const init = { method: options.method || "GET", headers };

    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(options.body);
    }

    const response = await fetch(`${baseUrl}${path}`, init);
    const data = response.status === 204 ? null : await response.json();
    if (!response.ok) {
      const error = new Error(data?.error || `Erreur API (${response.status}).`);
      error.status = response.status;
      throw error;
    }
    return data;
  }

  window.EPD_API = { baseUrl, request };
})();