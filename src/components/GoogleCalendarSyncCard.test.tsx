import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { GoogleCalendarStatus } from "@/lib/api/google-calendar.functions";

const mocks = vi.hoisted(() => ({
  getGoogleCalendarStatus: vi.fn(),
  listGoogleCalendars: vi.fn(),
  startGoogleCalendarConnect: vi.fn(),
  setDefaultCalendar: vi.fn(),
  setProfessionalCalendar: vi.fn(),
  disconnectGoogleCalendar: vi.fn(),
}));
vi.mock("@/lib/api/google-calendar.functions", () => mocks);
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { GoogleCalendarSyncCard } from "./GoogleCalendarSyncCard";

const BIZ = "00000000-0000-4000-8000-000000000001";
const status = (over: Partial<GoogleCalendarStatus> = {}): GoogleCalendarStatus => ({
  configured: true,
  connection: null,
  professionals: [],
  pendingJobs: 0,
  failedJobs: 0,
  ...over,
});
const active = {
  email: "ana@gmail.com",
  status: "active" as const,
  defaultCalendarId: "primary",
  lastSyncedAt: null,
  lastError: null,
  connectedAt: "2026-10-23T10:00:00Z",
};

function renderCard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <GoogleCalendarSyncCard businessId={BIZ} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.listGoogleCalendars.mockResolvedValue([
    { id: "ana@gmail.com", summary: "Ana", primary: true },
    { id: "team@group.calendar.google.com", summary: "Equipo", primary: false },
  ]);
});

describe("GoogleCalendarSyncCard", () => {
  it("sin conexión ofrece conectar y redirige a Google", async () => {
    mocks.getGoogleCalendarStatus.mockResolvedValue(status());
    mocks.startGoogleCalendarConnect.mockResolvedValue({ url: "https://accounts.google.com/x" });
    const assign = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        ...window.location,
        set href(v: string) {
          assign(v);
        },
      },
    });
    renderCard();
    await userEvent.click(await screen.findByRole("button", { name: "Conectar Google Calendar" }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("https://accounts.google.com/x"));
    expect(mocks.startGoogleCalendarConnect).toHaveBeenCalledWith({ data: { businessId: BIZ } });
  });

  it("avisa si el servidor no está configurado", async () => {
    mocks.getGoogleCalendarStatus.mockResolvedValue(status({ configured: false }));
    renderCard();
    expect(await screen.findByText(/no está configurada en este servidor/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Conectar Google Calendar" })).toBeNull();
  });

  it("conectada muestra la cuenta, el destino y los profesionales", async () => {
    mocks.getGoogleCalendarStatus.mockResolvedValue(
      status({
        connection: active,
        professionals: [{ id: "p1", name: "Carla", calendarId: null }],
        pendingJobs: 3,
        failedJobs: 1,
      }),
    );
    renderCard();
    expect(await screen.findByText("Conectado como ana@gmail.com")).toBeInTheDocument();
    expect(screen.getByText(/3 cambios en cola/)).toBeInTheDocument();
    expect(screen.getByText(/1 cita no se pudo sincronizar/)).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Calendario de Carla" })).toBeInTheDocument();
    await waitFor(() => expect(mocks.listGoogleCalendars).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "Calendario de destino" })).toHaveTextContent(
        "Ana (principal)",
      ),
    );
  });

  it("revocada pide reconectar", async () => {
    mocks.getGoogleCalendarStatus.mockResolvedValue(
      status({
        connection: { ...active, status: "revoked", lastError: "Google rechazó el acceso" },
      }),
    );
    renderCard();
    expect(await screen.findByRole("button", { name: "Reconectar" })).toBeInTheDocument();
    expect(screen.getByText(/Google rechazó el acceso/)).toBeInTheDocument();
    expect(mocks.listGoogleCalendars).not.toHaveBeenCalled();
  });

  it("desconecta pidiendo confirmación y permite borrar los eventos", async () => {
    mocks.getGoogleCalendarStatus.mockResolvedValue(status({ connection: active }));
    mocks.disconnectGoogleCalendar.mockResolvedValue({ ok: true });
    renderCard();
    await userEvent.click(await screen.findByRole("button", { name: "Desconectar" }));
    await userEvent.click(screen.getByRole("checkbox"));
    const dialogButtons = screen.getAllByRole("button", { name: "Desconectar" });
    await userEvent.click(dialogButtons[dialogButtons.length - 1]);
    await waitFor(() =>
      expect(mocks.disconnectGoogleCalendar).toHaveBeenCalledWith({
        data: { businessId: BIZ, deleteEvents: true },
      }),
    );
  });
});
