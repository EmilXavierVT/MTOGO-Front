import { API_BASE } from "../../utils/api";

export async function getRestaurants() {
  const token = localStorage.getItem("token") || sessionStorage.getItem("token");
  if (!token) throw new Error("Please log in before loading restaurants.");

  let response;
  try {
    response = await fetch(`${API_BASE}/restaurants`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    throw new Error("Could not connect to the server");
  }

  if (!response.ok) {
    const text = await response.text();
    let message = text || "Could not load restaurants";
    try {
      const result = JSON.parse(text);
      message = result.error || result.message || "Could not load restaurants";
    } catch {
      // Keep plain-text errors returned by the server.
    }
    throw new Error(message);
  }

  return response.json();
}

export async function getRestaurantMenus(restaurantId) {
  const token = localStorage.getItem("token") || sessionStorage.getItem("token");
  if (!token) throw new Error("Please log in before loading the restaurant menus.");

  let response;
  try {
    response = await fetch(`${API_BASE}/restaurants/${restaurantId}/menus`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    throw new Error("Could not connect to the server");
  }

  if (!response.ok) {
    const text = await response.text();
    let message = text || "Could not load restaurant menus";
    try {
      const result = JSON.parse(text);
      message = result.error || result.message || "Could not load restaurant menus";
    } catch {
      // Keep plain-text errors returned by the server.
    }
    throw new Error(message);
  }

  return response.json();
}

