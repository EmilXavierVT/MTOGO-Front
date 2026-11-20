"use client";
import { useState, useEffect } from "react";
// import { ... } from "../../utils/api";   ← se i api.js, hvad den eksporterer

export default function DisplayRestaurant() {
  const [restaurants, setRestaurants] = useState([]);
  const [selectedRestaurant, setSelectedRestaurant] = useState(null);
  const [menus, setMenus] = useState([]);
  const [cart, setCart] = useState([]);

  useEffect(() => {
  setLoading(true);
  removeMessage();
  }, []);

  return (
    <div>
      <h2>Restauranter</h2>
    </div>
  );
}