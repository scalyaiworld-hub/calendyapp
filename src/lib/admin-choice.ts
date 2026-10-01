const CHOICE_KEY = "calendya:admin-choice";

/** Los administradores eligen al entrar (panel o su negocio); la elección dura la pestaña. */
export function hasChosenAdminDestination(): boolean {
  try {
    return sessionStorage.getItem(CHOICE_KEY) === "1";
  } catch {
    return true; // sin sessionStorage no se puede recordar: no bloquear al usuario con la pantalla
  }
}

export function rememberAdminChoice() {
  try {
    sessionStorage.setItem(CHOICE_KEY, "1");
  } catch {
    /* sin almacenamiento: no pasa nada */
  }
}

export function forgetAdminChoice() {
  try {
    sessionStorage.removeItem(CHOICE_KEY);
  } catch {
    /* idem */
  }
}
