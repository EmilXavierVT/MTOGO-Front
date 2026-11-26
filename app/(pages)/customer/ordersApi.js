import { API_BASE } from "../../utils/api";

async function orderRequest(path, method = "GET", body, options = {}) {
  const token = localStorage.getItem("token") || sessionStorage.getItem("token");
  if (!token) {
    throw Object.assign(new Error("Please sign in before placing an order."), { status: 401 });
  }

  let response;
  try {
    response = await fetch(`${API_BASE}/customer/orders${path}`, {
      method,
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      ...options,
    });
  } catch (error) {
    if (error.name === "AbortError") throw error;
    throw new Error("Could not connect to the server. Please check your connection.");
  }

  if (!response.ok) {
    const text = await response.text();
    let details;
    try {
      details = JSON.parse(text);
    } catch {
      details = { error: "The server could not complete the request. Please try again." };
    }
    throw Object.assign(new Error(details.error || "Could not complete the request."),
      details, { status: response.status });
  }
  return response.json();
}

export function checkout(request) {
  return orderRequest("", "POST", request);
}

export function getOrder(orderId) {
  return orderRequest(`/${encodeURIComponent(orderId)}`);
}

export function listOrders(options) {
  return orderRequest("", "GET", undefined, options);
}

export function getFeedback(orderId, options) {
  return orderRequest(`/${encodeURIComponent(orderId)}/feedback`, "GET", undefined, options);
}

export function submitFeedback(orderId, ratings, options) {
  return orderRequest(`/${encodeURIComponent(orderId)}/feedback`, "POST", ratings, options);
}
