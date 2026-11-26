import { API_BASE } from "../../utils/api";

async function request(path, method = "GET") {
  const token = localStorage.getItem("token") || sessionStorage.getItem("token");
  if (!token) throw Object.assign(new Error("Log ind igen for at se dine leveringer."), { status: 401 });

  let response;
  try {
    response = await fetch(`${API_BASE}/courier/${path}`, {
      method,
      cache: "no-store",
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    throw new Error("Kunne ikke kontakte serveren. Opdatér oversigten og prøv igen.");
  }
  if (!response.ok) {
    let body = {};
    try { body = await response.json(); } catch { /* The server may return an empty error response. */ }
    const conflicts = {
      "Order already assigned": "En anden har allerede overtaget ordren.",
      "Courier already has an active delivery": "Du har allerede en aktiv levering.",
      "Not ready to be delivered": "Ordren er ikke længere klar til afhentning.",
    };
    let message = "Handlingen kunne ikke gennemføres. Opdatér oversigten og prøv igen.";
    if (response.status === 401) message = "Dit login er udløbet. Log ind igen.";
    if (response.status === 403) message = "Du har ikke adgang til denne levering.";
    if (response.status === 409) message = conflicts[body.error] || "Leveringen er ændret. Kontrollér den opdaterede oversigt.";
    throw Object.assign(new Error(message), { status: response.status });
  }
  return response.status === 204 ? null : response.json();
}

export async function getDeliveryOverview() {
  const [active, available] = await Promise.all([
    request("delivery/active"),
    request("orders/available"),
  ]);
  return { active, available };
}

export function updateDelivery(orderId, action) {
  return request(`orders/${encodeURIComponent(orderId)}/delivery/${action}`, "POST");
}
