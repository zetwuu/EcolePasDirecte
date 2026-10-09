(function() {
  const baseUrl = (window.EPD_API_URL || "http://localhost:3000").replace(/\/$/, "");

  async function getToken() {
    const auth = window.firebase?.auth?.();
    if (!auth) throw new Error("Firebase Auth n'est pas initialisé.");
    if (auth.currentUser) return auth.currentUser.getIdToken();

    return new Promise((resolve, reject) => {
      let unsubscribe = null;
      const timeout = setTimeout(() => {
        unsubscribe?.();
        reject(new Error("Connexion Firebase introuvable. Reconnecte-toi."));
      }, 5000);

      unsubscribe = auth.onAuthStateChanged((user) => {
        clearTimeout(timeout);
        unsubscribe?.();
        if (user) user.getIdToken().then(resolve, reject);
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