import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The Contact form (contract 1.78.0).
 *
 * Every message must reach the Operations queue, so what matters is that the form sends what the
 * person typed, quotes the case reference back, and shows the server's own reason when a message
 * is refused — never a silent no-op like the bare form it replaced.
 */

const client = { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() };

vi.mock("@/lib/api/browser", () => ({ getApiClient: () => client }));

const { ContactForm } = await import("./contact-form");

function ok<T>(data: T, status = 201) {
  return { data, error: undefined, response: new Response(null, { status }) };
}

function refusal(status: number, details: unknown = null) {
  return {
    data: undefined,
    error: {
      error: {
        code: status === 429 ? "throttled" : "validation_error",
        message: "Refused.",
        details,
        retryable: status === 429,
        request_id: "req_contact_1",
      },
    },
    response: new Response(null, { status }),
  };
}

function renderForm() {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return render(<ContactForm />, { wrapper });
}

function fillAndSend() {
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Asha Rao" } });
  fireEvent.change(screen.getByLabelText("What is it about?"), { target: { value: "payment" } });
  fireEvent.change(screen.getByLabelText("Mobile number"), { target: { value: "9876543210" } });
  fireEvent.change(screen.getByLabelText("Message"), {
    target: { value: "I was charged twice for my fan installation." },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send message" }));
}

describe("ContactForm", () => {
  beforeEach(() => client.POST.mockReset());

  it("sends the message to the contact endpoint and quotes the case reference", async () => {
    client.POST.mockResolvedValue(ok({ reference: "C-1A2B3C4D" }));
    renderForm();

    fillAndSend();

    expect(await screen.findByRole("status")).toHaveTextContent("C-1A2B3C4D");
    expect(client.POST).toHaveBeenCalledWith("/api/v1/support/contact/", {
      body: {
        name: "Asha Rao",
        phone_number: "9876543210",
        email: "",
        topic: "payment",
        message: "I was charged twice for my fan installation.",
        website: "",
      },
    });
  });

  it("shows the server's reason under the field it is about", async () => {
    client.POST.mockResolvedValue(
      refusal(400, { phone_number: ["Give a phone number or an email address so we can reply."] }),
    );
    renderForm();

    fillAndSend();

    expect(
      await screen.findByText("Give a phone number or an email address so we can reply."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send message" })).toBeEnabled();
  });

  it("explains a throttle and offers the phone line instead", async () => {
    client.POST.mockResolvedValue(refusal(429));
    renderForm();

    fillAndSend();

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/several messages in a short time/i),
    );
  });

  it("keeps the honeypot out of reach of people and screen readers", () => {
    renderForm();

    const trap = screen.getByLabelText("Leave this empty", { selector: "input" });
    expect(trap).toHaveAttribute("tabindex", "-1");
    expect(trap.closest("[aria-hidden]")).not.toBeNull();
  });
});
