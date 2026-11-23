import { API_BASE } from "../../utils/api";

export async function getMenus() {
  const token = localStorage.getItem("token") || sessionStorage.getItem("token");
  if (!token) throw new Error("Please log in before loading menus.");

  let response;
  try {
    response = await fetch(`${API_BASE}/owner/menus`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    throw new Error("Could not connect to the server");
  }

  if (!response.ok) {
    const text = await response.text();
    let message = text || "Could not load menus";
    try {
      const result = JSON.parse(text);
      message = result.error || result.message || "Could not load menus";
    } catch {
      // Keep plain-text errors returned by the server.
    }
    throw new Error(message);
  }

  return response.json();
}

export async function createDish(menuId, dish) {
  if (menuId === undefined || menuId === null || menuId === "") {
    throw new Error("Select a menu before creating a dish.");
  }
  const token = localStorage.getItem("token") || sessionStorage.getItem("token");
  if (!token) throw new Error("Please log in before creating a dish.");

  let response;
  try {
    response = await fetch(`${API_BASE}/owner/menus/${menuId}/products`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(dish),
    });
  } catch {
    throw new Error("Could not connect to the server");
  }
  if (!response.ok) {
    const text = await response.text();
    let message = text || "Could not create dish";
    try {
      const result = JSON.parse(text);
      message = result.error || result.message || "Could not create dish";
    } catch {
      // Keep plain-text errors returned by the server.
    } 
    throw new Error(message);
  }
}

export async function updateDish(menuId, dishId, dish) {
  const token = localStorage.getItem("token") || sessionStorage.getItem("token");
  if (!token) throw new Error("Please log in before editing a dish.");

  let response;
  try {
    response = await fetch(`${API_BASE}/owner/menus/${(menuId)}/products/${(dishId)}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(dish),
    });
  } catch {
    throw new Error("Could not connect to the server");
  }
  if (!response.ok) {
    const text = await response.text();
    let message = text || "Could not save dish";
    try {
      const result = JSON.parse(text);
      message = result.error || result.message || "Could not save dish";
    } catch {
      // Keep plain-text errors returned by the server.
    }
    throw new Error(message);
  }
  return response.json();
}
