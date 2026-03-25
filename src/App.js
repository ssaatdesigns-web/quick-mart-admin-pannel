import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";

const DEFAULT_FORM = {
  name: "",
  price: "",
  originalPrice: "",
  category: "",
  image: "",
  unit: "piece",
  badge: "",
  available: true,
  discount: "",
  description: "",
  stock: "",
};

const ORDER_STATUSES = [
  "pending",
  "confirmed",
  "preparing",
  "out_for_delivery",
  "delivered",
  "cancelled",
];

export default function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [orders, setOrders] = useState([]);
  const [offers, setOffers] = useState([]);
  const [banners, setBanners] = useState([]);
  const [settings, setSettings] = useState({
    deliveryFee: 30,
    platformFee: 5,
    taxRate: 5,
    deliveryTime: 8,
  });

  const [loading, setLoading] = useState({
    products: false,
    categories: false,
    orders: false,
    offers: false,
    banners: false,
    settings: false,
  });

  const [form, setForm] = useState(DEFAULT_FORM);
  const [editingProductId, setEditingProductId] = useState(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  const [categoryForm, setCategoryForm] = useState({
    id: "",
    name: "",
    emoji: "",
    sort: "",
  });

  const [filters, setFilters] = useState({
    search: "",
    category: "",
    orderStatus: "",
    lowStockOnly: false,
  });

  const [statusMessage, setStatusMessage] = useState("");

  const setSafeStatus = (message) => {
    setStatusMessage(message);
    window.clearTimeout(window.__quickmartStatusTimer);
    window.__quickmartStatusTimer = window.setTimeout(() => {
      setStatusMessage("");
    }, 2500);
  };

  const normalizeProductPayload = (raw) => {
    const price = Number(raw.price || 0);
    const originalPrice = Number(raw.originalPrice || 0);
    const discount =
      raw.discount !== "" && raw.discount !== null && raw.discount !== undefined
        ? Number(raw.discount)
        : originalPrice > price && originalPrice > 0
        ? Math.round(((originalPrice - price) / originalPrice) * 100)
        : 0;

    const stock =
      raw.stock !== "" && raw.stock !== null && raw.stock !== undefined
        ? Number(raw.stock)
        : 0;

    return {
      name: raw.name.trim(),
      category: raw.category.trim(),
      price,
      originalPrice,
      unit: raw.unit?.trim() || "piece",
      badge: raw.badge?.trim() || null,
      image: raw.image?.trim() || null,
      available: !!raw.available,
      discount,
      description: raw.description?.trim() || null,
      stock,
    };
  };

  const subscribeTable = useCallback((table, handler) => {
    return supabase
      .channel(`rt-${table}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table }, handler)
      .subscribe();
  }, []);

  const fetchProducts = useCallback(async () => {
    setLoading((prev) => ({ ...prev, products: true }));
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .order("createdAt", { ascending: false });

    if (error) {
      console.error("fetchProducts error:", error);
      setSafeStatus(`Products load failed: ${error.message}`);
    } else {
      setProducts(data || []);
    }
    setLoading((prev) => ({ ...prev, products: false }));
  }, []);

  const fetchCategories = useCallback(async () => {
    setLoading((prev) => ({ ...prev, categories: true }));
    const { data, error } = await supabase
      .from("categories")
      .select("*")
      .order("sort", { ascending: true });

    if (error) {
      console.error("fetchCategories error:", error);
      setSafeStatus(`Categories load failed: ${error.message}`);
    } else {
      setCategories(data || []);
    }
    setLoading((prev) => ({ ...prev, categories: false }));
  }, []);

  const fetchOrders = useCallback(async () => {
    setLoading((prev) => ({ ...prev, orders: true }));
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .order("createdAt", { ascending: false });

    if (error) {
      console.error("fetchOrders error:", error);
      setSafeStatus(`Orders load failed: ${error.message}`);
    } else {
      setOrders(data || []);
    }
    setLoading((prev) => ({ ...prev, orders: false }));
  }, []);

  const fetchOffers = useCallback(async () => {
    setLoading((prev) => ({ ...prev, offers: true }));
    const { data, error } = await supabase
      .from("offers")
      .select("*")
      .order("createdAt", { ascending: false });

    if (error) {
      console.error("fetchOffers error:", error);
    } else {
      setOffers(data || []);
    }
    setLoading((prev) => ({ ...prev, offers: false }));
  }, []);

  const fetchBanners = useCallback(async () => {
    setLoading((prev) => ({ ...prev, banners: true }));
    const { data, error } = await supabase
      .from("banners")
      .select("*")
      .order("createdAt", { ascending: false });

    if (error) {
      console.error("fetchBanners error:", error);
    } else {
      setBanners(data || []);
    }
    setLoading((prev) => ({ ...prev, banners: false }));
  }, []);

  const fetchSettings = useCallback(async () => {
    setLoading((prev) => ({ ...prev, settings: true }));
    const { data, error } = await supabase
      .from("config")
      .select("*")
      .eq("key", "settings")
      .single();

    if (error) {
      console.error("fetchSettings error:", error);
    } else if (data?.value) {
      setSettings((prev) => ({ ...prev, ...data.value }));
    }
    setLoading((prev) => ({ ...prev, settings: false }));
  }, []);

  const fetchAll = useCallback(async () => {
    await Promise.all([
      fetchProducts(),
      fetchCategories(),
      fetchOrders(),
      fetchOffers(),
      fetchBanners(),
      fetchSettings(),
    ]);
  }, [
    fetchProducts,
    fetchCategories,
    fetchOrders,
    fetchOffers,
    fetchBanners,
    fetchSettings,
  ]);

  const getUser = useCallback(async () => {
    setAuthLoading(true);
    const { data, error } = await supabase.auth.getUser();
    if (error) {
      console.error("getUser error:", error);
    }
    setUser(data?.user || null);
    setAuthLoading(false);
  }, []);

  useEffect(() => {
    getUser();

    const authListener = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
    });

    return () => {
      authListener?.data?.subscription?.unsubscribe?.();
    };
  }, [getUser]);

  useEffect(() => {
    fetchAll();

    const channels = [
      subscribeTable("products", fetchProducts),
      subscribeTable("categories", fetchCategories),
      subscribeTable("orders", fetchOrders),
      subscribeTable("offers", fetchOffers),
      subscribeTable("banners", fetchBanners),
      subscribeTable("config", fetchSettings),
    ];

    return () => {
      channels.forEach((channel) => {
        supabase.removeChannel(channel);
      });
    };
  }, [
    fetchAll,
    fetchProducts,
    fetchCategories,
    fetchOrders,
    fetchOffers,
    fetchBanners,
    fetchSettings,
    subscribeTable,
  ]);

  const login = async () => {
    const email = window.prompt("Enter admin email:");
    if (!email) return;
    const password = window.prompt("Enter admin password:");
    if (!password) return;

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      alert(error.message);
      return;
    }

    setUser(data.user || null);
    setSafeStatus("Logged in successfully.");
  };

  const logout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      alert(error.message);
      return;
    }
    setUser(null);
    setSafeStatus("Logged out.");
  };

  const resetProductForm = () => {
    setForm(DEFAULT_FORM);
    setEditingProductId(null);
  };

  const validateProductForm = () => {
    if (!form.name.trim()) {
      alert("Product name is required.");
      return false;
    }
    if (!form.category.trim()) {
      alert("Category is required.");
      return false;
    }
    if (form.price === "" || Number.isNaN(Number(form.price))) {
      alert("Valid price is required.");
      return false;
    }
    return true;
  };

  const saveProduct = async () => {
    if (!validateProductForm()) return;

    const payload = normalizeProductPayload(form);

    if (editingProductId) {
      const { error } = await supabase
        .from("products")
        .update(payload)
        .eq("id", editingProductId);

      if (error) {
        alert(error.message);
        return;
      }

      setSafeStatus("Product updated.");
    } else {
      const { error } = await supabase.from("products").insert([payload]);

      if (error) {
        alert(error.message);
        return;
      }

      setSafeStatus("Product added.");
    }

    resetProductForm();
    await fetchProducts();
  };

  const editProduct = (product) => {
    setEditingProductId(product.id);
    setForm({
      name: product.name || "",
      price: product.price ?? "",
      originalPrice: product.originalPrice ?? "",
      category: product.category || "",
      image: product.image || "",
      unit: product.unit || "piece",
      badge: product.badge || "",
      available: !!product.available,
      discount: product.discount ?? "",
      description: product.description || "",
      stock: product.stock ?? "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const deleteProduct = async (id) => {
    const confirmed = window.confirm("Delete this product?");
    if (!confirmed) return;

    const { error } = await supabase.from("products").delete().eq("id", id);

    if (error) {
      alert(error.message);
      return;
    }

    setSafeStatus("Product deleted.");
    await fetchProducts();
  };

  const toggleProductAvailability = async (product) => {
    const { error } = await supabase
      .from("products")
      .update({ available: !product.available })
      .eq("id", product.id);

    if (error) {
      alert(error.message);
      return;
    }

    setSafeStatus("Availability updated.");
  };

  const uploadImage = async (file) => {
    if (!file) return;

    setUploadingImage(true);
    try {
      const ext = file.name.split(".").pop();
      const fileName = `products/${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("quickmart")
        .upload(fileName, file, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from("quickmart").getPublicUrl(fileName);

      setForm((prev) => ({
        ...prev,
        image: data.publicUrl,
      }));

      setSafeStatus("Image uploaded.");
    } catch (error) {
      console.error("uploadImage error:", error);
      alert(error.message || "Image upload failed.");
    } finally {
      setUploadingImage(false);
    }
  };

  const addCategory = async () => {
    const id = categoryForm.id.trim();
    const name = categoryForm.name.trim();

    if (!id || !name) {
      alert("Category id and name are required.");
      return;
    }

    const payload = {
      id,
      name,
      emoji: categoryForm.emoji.trim() || null,
      sort:
        categoryForm.sort !== "" && categoryForm.sort !== null
          ? Number(categoryForm.sort)
          : 0,
    };

    const { error } = await supabase.from("categories").upsert([payload]);

    if (error) {
      alert(error.message);
      return;
    }

    setCategoryForm({ id: "", name: "", emoji: "", sort: "" });
    setSafeStatus("Category saved.");
    await fetchCategories();
  };

  const deleteCategory = async (id) => {
    const confirmed = window.confirm(
      "Delete this category? Products using it will not be auto-updated."
    );
    if (!confirmed) return;

    const { error } = await supabase.from("categories").delete().eq("id", id);

    if (error) {
      alert(error.message);
      return;
    }

    setSafeStatus("Category deleted.");
    await fetchCategories();
  };

  const updateOrderStatus = async (id, status) => {
    const { error } = await supabase
      .from("orders")
      .update({ status })
      .eq("id", id);

    if (error) {
      alert(error.message);
      return;
    }

    setSafeStatus("Order status updated.");
  };

  const saveSettings = async () => {
    const payload = {
      deliveryFee: Number(settings.deliveryFee || 0),
      platformFee: Number(settings.platformFee || 0),
      taxRate: Number(settings.taxRate || 0),
      deliveryTime: Number(settings.deliveryTime || 0),
    };

    const { error } = await supabase
      .from("config")
      .upsert([{ key: "settings", value: payload }]);

    if (error) {
      alert(error.message);
      return;
    }

    setSafeStatus("Settings saved.");
  };

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const matchesSearch =
        !filters.search ||
        `${product.name || ""} ${product.category || ""} ${product.badge || ""}`
          .toLowerCase()
          .includes(filters.search.toLowerCase());

      const matchesCategory =
        !filters.category || product.category === filters.category;

      const matchesLowStock = !filters.lowStockOnly || Number(product.stock || 0) <= 5;

      return matchesSearch && matchesCategory && matchesLowStock;
    });
  }, [products, filters]);

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      if (!filters.orderStatus) return true;
      return order.status === filters.orderStatus;
    });
  }, [orders, filters.orderStatus]);

  const analytics = useMemo(() => {
    const totalProducts = products.length;
    const totalOrders = orders.length;
    const totalRevenue = orders
      .filter((o) => o.status !== "cancelled")
      .reduce((sum, o) => sum + Number(o.total || 0), 0);

    const pendingOrders = orders.filter((o) => o.status === "pending").length;
    const deliveredOrders = orders.filter((o) => o.status === "delivered").length;
    const outForDelivery = orders.filter(
      (o) => o.status === "out_for_delivery"
    ).length;

    const lowStockProducts = products.filter(
      (p) => Number(p.stock || 0) <= 5
    ).length;

    return {
      totalProducts,
      totalOrders,
      totalRevenue,
      pendingOrders,
      deliveredOrders,
      outForDelivery,
      lowStockProducts,
    };
  }, [products, orders]);

  const lowStockItems = useMemo(() => {
    return products.filter((p) => Number(p.stock || 0) <= 5);
  }, [products]);

  if (authLoading) {
    return (
      <div style={styles.page}>
        <h1 style={styles.heading}>QuickMart Admin Panel</h1>
        <p>Loading session...</p>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <h1 style={styles.heading}>QuickMart Admin Panel</h1>

      <div style={styles.topBar}>
        <div>
          <strong>Admin:</strong>{" "}
          {user ? user.email : "Not logged in"}
        </div>

        {!user ? (
          <button onClick={login} style={styles.button}>
            Login
          </button>
        ) : (
          <button onClick={logout} style={styles.button}>
            Logout
          </button>
        )}
      </div>

      {statusMessage ? (
        <div style={styles.statusBox}>{statusMessage}</div>
      ) : null}

      <hr style={styles.hr} />

      <h2>Dashboard Analytics</h2>
      <div style={styles.grid}>
        <Card title="Total Products" value={analytics.totalProducts} />
        <Card title="Total Orders" value={analytics.totalOrders} />
        <Card title="Revenue" value={`₹${analytics.totalRevenue.toFixed(2)}`} />
        <Card title="Pending Orders" value={analytics.pendingOrders} />
        <Card title="Delivered Orders" value={analytics.deliveredOrders} />
        <Card title="Out for Delivery" value={analytics.outForDelivery} />
        <Card title="Low Stock Alerts" value={analytics.lowStockProducts} />
        <Card title="Categories" value={categories.length} />
      </div>

      <hr style={styles.hr} />

      <h2>Settings</h2>
      <div style={styles.section}>
        <input
          style={styles.input}
          placeholder="Delivery Fee"
          value={settings.deliveryFee}
          onChange={(e) =>
            setSettings((prev) => ({ ...prev, deliveryFee: e.target.value }))
          }
        />
        <input
          style={styles.input}
          placeholder="Platform Fee"
          value={settings.platformFee}
          onChange={(e) =>
            setSettings((prev) => ({ ...prev, platformFee: e.target.value }))
          }
        />
        <input
          style={styles.input}
          placeholder="Tax Rate"
          value={settings.taxRate}
          onChange={(e) =>
            setSettings((prev) => ({ ...prev, taxRate: e.target.value }))
          }
        />
        <input
          style={styles.input}
          placeholder="Delivery Time"
          value={settings.deliveryTime}
          onChange={(e) =>
            setSettings((prev) => ({ ...prev, deliveryTime: e.target.value }))
          }
        />
        <button style={styles.button} onClick={saveSettings}>
          Save Settings
        </button>
      </div>

      <hr style={styles.hr} />

      <h2>{editingProductId ? "Edit Product" : "Add Product"}</h2>
      <div style={styles.section}>
        <input
          style={styles.input}
          placeholder="Name"
          value={form.name}
          onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
        />
        <input
          style={styles.input}
          placeholder="Price"
          value={form.price}
          onChange={(e) => setForm((prev) => ({ ...prev, price: e.target.value }))}
        />
        <input
          style={styles.input}
          placeholder="Original Price"
          value={form.originalPrice}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, originalPrice: e.target.value }))
          }
        />
        <input
          style={styles.input}
          placeholder="Category"
          value={form.category}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, category: e.target.value }))
          }
          list="category-suggestions"
        />
        <datalist id="category-suggestions">
          {categories.map((cat) => (
            <option key={cat.id} value={cat.name} />
          ))}
        </datalist>

        <input
          style={styles.input}
          placeholder="Unit"
          value={form.unit}
          onChange={(e) => setForm((prev) => ({ ...prev, unit: e.target.value }))}
        />
        <input
          style={styles.input}
          placeholder="Badge"
          value={form.badge}
          onChange={(e) => setForm((prev) => ({ ...prev, badge: e.target.value }))}
        />
        <input
          style={styles.input}
          placeholder="Discount %"
          value={form.discount}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, discount: e.target.value }))
          }
        />
        <input
          style={styles.input}
          placeholder="Stock"
          value={form.stock}
          onChange={(e) => setForm((prev) => ({ ...prev, stock: e.target.value }))}
        />
        <input
          style={styles.input}
          placeholder="Image URL"
          value={form.image}
          onChange={(e) => setForm((prev) => ({ ...prev, image: e.target.value }))}
        />
        <textarea
          style={{ ...styles.input, minHeight: 90, resize: "vertical" }}
          placeholder="Description"
          value={form.description}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, description: e.target.value }))
          }
        />

        <label style={styles.checkboxRow}>
          <input
            type="checkbox"
            checked={form.available}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, available: e.target.checked }))
            }
          />
          Available
        </label>

        <div style={styles.inlineRow}>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => uploadImage(e.target.files?.[0])}
          />
          {uploadingImage ? <span>Uploading...</span> : null}
        </div>

        <div style={styles.inlineRow}>
          <button style={styles.button} onClick={saveProduct}>
            {editingProductId ? "Update Product" : "Add Product"}
          </button>
          {editingProductId ? (
            <button style={styles.buttonSecondary} onClick={resetProductForm}>
              Cancel Edit
            </button>
          ) : null}
        </div>
      </div>

      <hr style={styles.hr} />

      <h2>Category Management</h2>
      <div style={styles.section}>
        <input
          style={styles.input}
          placeholder="Category ID"
          value={categoryForm.id}
          onChange={(e) =>
            setCategoryForm((prev) => ({ ...prev, id: e.target.value }))
          }
        />
        <input
          style={styles.input}
          placeholder="Category Name"
          value={categoryForm.name}
          onChange={(e) =>
            setCategoryForm((prev) => ({ ...prev, name: e.target.value }))
          }
        />
        <input
          style={styles.input}
          placeholder="Emoji"
          value={categoryForm.emoji}
          onChange={(e) =>
            setCategoryForm((prev) => ({ ...prev, emoji: e.target.value }))
          }
        />
        <input
          style={styles.input}
          placeholder="Sort"
          value={categoryForm.sort}
          onChange={(e) =>
            setCategoryForm((prev) => ({ ...prev, sort: e.target.value }))
          }
        />
        <button style={styles.button} onClick={addCategory}>
          Save Category
        </button>
      </div>

      <div style={styles.list}>
        {categories.map((cat) => (
          <div key={cat.id} style={styles.listItem}>
            <div>
              <strong>{cat.emoji || "•"} {cat.name}</strong>
              <div style={styles.smallText}>ID: {cat.id}</div>
            </div>
            <button style={styles.buttonDanger} onClick={() => deleteCategory(cat.id)}>
              Delete
            </button>
          </div>
        ))}
      </div>

      <hr style={styles.hr} />

      <h2>Low Stock Alerts</h2>
      {lowStockItems.length === 0 ? (
        <p>No low stock products.</p>
      ) : (
        <div style={styles.list}>
          {lowStockItems.map((item) => (
            <div key={item.id} style={styles.alertItem}>
              <strong>{item.name}</strong> — Stock: {Number(item.stock || 0)}
            </div>
          ))}
        </div>
      )}

      <hr style={styles.hr} />

      <h2>Product Filters</h2>
      <div style={styles.section}>
        <input
          style={styles.input}
          placeholder="Search products"
          value={filters.search}
          onChange={(e) =>
            setFilters((prev) => ({ ...prev, search: e.target.value }))
          }
        />
        <select
          style={styles.input}
          value={filters.category}
          onChange={(e) =>
            setFilters((prev) => ({ ...prev, category: e.target.value }))
          }
        >
          <option value="">All Categories</option>
          {categories.map((cat) => (
            <option key={cat.id} value={cat.name}>
              {cat.name}
            </option>
          ))}
        </select>

        <label style={styles.checkboxRow}>
          <input
            type="checkbox"
            checked={filters.lowStockOnly}
            onChange={(e) =>
              setFilters((prev) => ({
                ...prev,
                lowStockOnly: e.target.checked,
              }))
            }
          />
          Show low stock only
        </label>
      </div>

      <h2>Products {loading.products ? "(Loading...)" : ""}</h2>
      <div style={styles.list}>
        {filteredProducts.map((p) => (
          <div key={p.id} style={styles.productCard}>
            <div style={{ flex: 1 }}>
              <h3 style={{ marginBottom: 6 }}>{p.name}</h3>
              <div style={styles.smallText}>Category: {p.category}</div>
              <div style={styles.smallText}>Price: ₹{Number(p.price || 0).toFixed(2)}</div>
              <div style={styles.smallText}>
                Original Price: ₹{Number(p.originalPrice || 0).toFixed(2)}
              </div>
              <div style={styles.smallText}>Unit: {p.unit || "piece"}</div>
              <div style={styles.smallText}>Discount: {p.discount || 0}%</div>
              <div style={styles.smallText}>Badge: {p.badge || "-"}</div>
              <div style={styles.smallText}>Stock: {Number(p.stock || 0)}</div>
              <div style={styles.smallText}>
                Available: {p.available ? "Yes" : "No"}
              </div>
              {p.image ? (
                <img
                  src={p.image}
                  alt={p.name}
                  style={{ width: 120, height: 120, objectFit: "cover", marginTop: 10, borderRadius: 8 }}
                />
              ) : null}
            </div>

            <div style={styles.actionColumn}>
              <button style={styles.button} onClick={() => editProduct(p)}>
                Edit
              </button>
              <button
                style={styles.buttonSecondary}
                onClick={() => toggleProductAvailability(p)}
              >
                {p.available ? "Mark Unavailable" : "Mark Available"}
              </button>
              <button style={styles.buttonDanger} onClick={() => deleteProduct(p.id)}>
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      <hr style={styles.hr} />

      <h2>Orders</h2>
      <div style={styles.section}>
        <select
          style={styles.input}
          value={filters.orderStatus}
          onChange={(e) =>
            setFilters((prev) => ({ ...prev, orderStatus: e.target.value }))
          }
        >
          <option value="">All Statuses</option>
          {ORDER_STATUSES.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </div>

      <div style={styles.list}>
        {filteredOrders.map((o) => (
          <div key={o.id} style={styles.orderCard}>
            <div style={{ flex: 1 }}>
              <div><strong>Order ID:</strong> {o.id}</div>
              <div><strong>Total:</strong> ₹{Number(o.total || 0).toFixed(2)}</div>
              <div><strong>Subtotal:</strong> ₹{Number(o.subtotal || 0).toFixed(2)}</div>
              <div><strong>Delivery Fee:</strong> ₹{Number(o.deliveryFee || 0).toFixed(2)}</div>
              <div><strong>Platform Fee:</strong> ₹{Number(o.platformFee || 0).toFixed(2)}</div>
              <div><strong>Tax:</strong> ₹{Number(o.tax || 0).toFixed(2)}</div>
              <div><strong>Discount:</strong> ₹{Number(o.discount || 0).toFixed(2)}</div>
              <div><strong>Address:</strong> {o.address || "-"}</div>
              <div><strong>Payment Method:</strong> {o.paymentMethod || "-"}</div>
              <div><strong>Promo Code:</strong> {o.promoCode || "-"}</div>
              <div><strong>Status:</strong> {o.status}</div>
              <div><strong>Created:</strong> {o.createdAt ? new Date(o.createdAt).toLocaleString() : "-"}</div>

              <details style={{ marginTop: 10 }}>
                <summary>Items</summary>
                <pre style={styles.pre}>
                  {JSON.stringify(o.items || [], null, 2)}
                </pre>
              </details>
            </div>

            <div style={styles.actionColumn}>
              <select
                style={styles.input}
                value={o.status}
                onChange={(e) => updateOrderStatus(o.id, e.target.value)}
              >
                {ORDER_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ))}
      </div>

      <hr style={styles.hr} />

      <h2>Offers Summary</h2>
      <div style={styles.section}>
        <div>Total Offers: {offers.length}</div>
        <div>Active Banners: {banners.filter((b) => b.active).length}</div>
      </div>
    </div>
  );
}

function Card({ title, value }) {
  return (
    <div style={styles.card}>
      <div style={styles.cardTitle}>{title}</div>
      <div style={styles.cardValue}>{value}</div>
    </div>
  );
}

const styles = {
  page: {
    padding: 20,
    color: "white",
    background: "#0f172a",
    minHeight: "100vh",
    fontFamily: "Inter, sans-serif",
  },
  heading: {
    marginBottom: 16,
  },
  topBar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
    flexWrap: "wrap",
  },
  statusBox: {
    marginTop: 10,
    marginBottom: 10,
    padding: "10px 12px",
    background: "#1e293b",
    border: "1px solid #334155",
    borderRadius: 8,
  },
  hr: {
    margin: "20px 0",
    borderColor: "#334155",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 12,
  },
  card: {
    background: "#111827",
    border: "1px solid #334155",
    borderRadius: 12,
    padding: 14,
  },
  cardTitle: {
    fontSize: 14,
    opacity: 0.8,
    marginBottom: 8,
  },
  cardValue: {
    fontSize: 22,
    fontWeight: 700,
  },
  section: {
    display: "flex",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 14,
    alignItems: "center",
  },
  input: {
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid #475569",
    background: "#111827",
    color: "white",
    minWidth: 180,
  },
  button: {
    padding: "10px 14px",
    borderRadius: 8,
    border: "none",
    background: "#2563eb",
    color: "white",
    cursor: "pointer",
  },
  buttonSecondary: {
    padding: "10px 14px",
    borderRadius: 8,
    border: "none",
    background: "#475569",
    color: "white",
    cursor: "pointer",
  },
  buttonDanger: {
    padding: "10px 14px",
    borderRadius: 8,
    border: "none",
    background: "#dc2626",
    color: "white",
    cursor: "pointer",
  },
  checkboxRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  inlineRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },
  list: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  listItem: {
    border: "1px solid #334155",
    background: "#111827",
    borderRadius: 10,
    padding: 12,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  alertItem: {
    border: "1px solid #7f1d1d",
    background: "#450a0a",
    borderRadius: 10,
    padding: 12,
  },
  productCard: {
    border: "1px solid #334155",
    background: "#111827",
    borderRadius: 12,
    padding: 14,
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    flexWrap: "wrap",
  },
  orderCard: {
    border: "1px solid #334155",
    background: "#111827",
    borderRadius: 12,
    padding: 14,
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    flexWrap: "wrap",
  },
  actionColumn: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    minWidth: 180,
  },
  pre: {
    marginTop: 10,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    background: "#020617",
    padding: 12,
    borderRadius: 8,
    border: "1px solid #334155",
    color: "#cbd5e1",
  },
  smallText: {
    fontSize: 13,
    opacity: 0.9,
    marginBottom: 4,
  },
};
