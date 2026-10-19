import { describe, expect, it } from "vitest";
import { assertOwnerOrManager, RoleError } from "@/lib/api/role-guard";

type Opts = { owned: boolean; manager: boolean; ownedError?: boolean };

/** Cliente de Supabase mínimo: solo lo que usa assertOwnerOrManager. */
function fakeSupabase({ owned, manager, ownedError }: Opts) {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "is"]) chain[m] = () => chain;
  chain.maybeSingle = async () =>
    ownedError
      ? { data: null, error: { message: "boom" } }
      : { data: owned ? { id: "b1" } : null, error: null };
  return {
    from: () => chain,
    rpc: async () => ({ data: manager, error: null }),
  } as never;
}

describe("assertOwnerOrManager", () => {
  it("deja pasar al dueño", async () => {
    await expect(
      assertOwnerOrManager(fakeSupabase({ owned: true, manager: false }), "u1", "b1"),
    ).resolves.toBeUndefined();
  });

  it("deja pasar a un administrador del equipo", async () => {
    await expect(
      assertOwnerOrManager(fakeSupabase({ owned: false, manager: true }), "u1", "b1"),
    ).resolves.toBeUndefined();
  });

  it("rechaza a recepción y profesionales (ni dueño ni administrador)", async () => {
    await expect(
      assertOwnerOrManager(fakeSupabase({ owned: false, manager: false }), "u1", "b1"),
    ).rejects.toBeInstanceOf(RoleError);
  });

  it("propaga el error de la base en vez de dar acceso", async () => {
    await expect(
      assertOwnerOrManager(
        fakeSupabase({ owned: false, manager: true, ownedError: true }),
        "u1",
        "b1",
      ),
    ).rejects.toThrow("boom");
  });
});
