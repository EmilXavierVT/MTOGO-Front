"use client";

import { useEffect, useState } from "react";
import CreateDish from "./CreateDish";
import DishList from "./DishList";
import EditDish from "./EditDish";
import { getMenus } from "../api";
import styles from "../restaurantOwner.module.css";

function MenuSelector() {
  const [menus, setMenus] = useState([]);
  const [selectedMenuId, setSelectedMenuId] = useState(null);
  const [selectedDishId, setSelectedDishId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function loadMenus() {
      try {
        const menus = await getMenus();
        if (active) {
          setMenus(menus);
          setSelectedMenuId(menus[0]?.id ?? null);
        }
      } catch (error) {
        if (active) setError(error.message || "Could not load menus");
      } finally {
        if (active) setLoading(false);
      }
    }
    loadMenus();
    return () => { active = false; };
  }, []);

  async function refreshMenus() {
    const updatedMenus = await getMenus();
    setMenus(updatedMenus);
  }

  if (loading) return <p role="status">Loading menus...</p>;
  if (error) return <p role="alert">{error}</p>;
  if (menus.length === 0) return <p>No menus available yet.</p>;

  const selectedMenu = menus.find((menu) => menu.id === selectedMenuId);
  const selectedDish = selectedMenu?.products.find((dish) => dish.id === selectedDishId);

  return (
    <section aria-label="Manage menus">
      <div className={styles.menuBar} role="group" aria-label="Choose a menu">
        {menus.map((menu) => (
          <button
            key={menu.id}
            type="button"
            className={styles.menuButton}
            aria-pressed={menu.id === selectedMenuId}
            onClick={() => {
              setSelectedMenuId(menu.id);
              setSelectedDishId(null);
            }}
          >
            {menu.name}
          </button>
        ))}
      </div>
      {selectedMenu && (
        <div className={styles.menuContent}>
          <DishList menu={selectedMenu} selectedDishId={selectedDishId} onSelectDish={setSelectedDishId} />
          <div>
            <CreateDish key={selectedMenuId} menuId={selectedMenuId} onDishCreated={refreshMenus} />
            {selectedDish && (
              <EditDish key={selectedDish.id} menuId={selectedMenuId} dish={selectedDish}
                onDishUpdated={refreshMenus} onClose={() => setSelectedDishId(null)} />
            )}
          </div>
        </div>
      )}
    </section>
  );
}

export default MenuSelector;

