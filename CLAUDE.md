# calendyapp

## Git worktrees

Los worktrees se acumulan fácil y dejan trabajo suelto fuera del repo. Reglas:

- Crea los worktrees **dentro del repo**, en `C:\Users\Admin\calendyapp\.worktrees\<nombre>` (ruta ignorada por git, eslint y prettier). Nunca fuera de `calendyapp`: ni carpetas hermanas en `C:\Users\Admin` ni `calendyapp-worktrees`.
- Usa un worktree por rama y reutiliza uno existente antes de crear otro. Evita sufijos `2`, `-v2`, `-v3` para repetir un intento: continúa en la misma rama.
- Haz commit y push temprano. Un worktree con cambios sin commit y sin rama en el remoto solo existe en esa carpeta.
- Al fusionar un PR, quita su worktree y borra la rama (local y remota).
- No borres con `--force` un worktree con cambios pendientes sin revisarlos antes.
- Para limpiar, ejecuta `scripts/clean-worktrees.sh` (solo informa) y luego `scripts/clean-worktrees.sh --apply`. Solo quita los worktrees seguros: sin cambios, rama subida y PR fusionado.
