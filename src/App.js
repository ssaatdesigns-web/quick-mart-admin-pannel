import { useState, useEffect, useRef, useCallback } from "react";
import { db, storage, auth } from "./firebase";
import {
  collection, onSnapshot, addDoc, updateDoc, deleteDoc,
  doc, serverTimestamp, query, orderBy, setDoc, getDoc
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from "firebase/auth";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const ADMIN_EMAIL = "admin@quickmart.com"; // Change in Firebase Auth
const STATUS_CONFIG = {
  pending:          { label: "Pending",         color: "#f59f00", bg: "#fffbeb", next: "confirmed" },
  confirmed:        { label: "Confirmed",        color: "#0ea5e9", bg: "#f0f9ff", next: "preparing" },
  preparing:        { label: "Preparing",        color: "#8b5cf6", bg: "#f5f3ff", next: "out_for_delivery" },
  out_for_delivery: { label: "Out for Delivery", color: "#f97316", bg: "#fff7ed", next: "delivered" },
  delivered:        { label: "Delivered",        color: "#22c55e", bg: "#f0fdf4", next: null },
  cancelled:        { label: "Cancelled",        color: "#ef4444", bg: "#fef2f2", next: null },
};

// ─── TOAST ────────────────────────────────────────────────────────────────────
function Toast({ toasts }) {
  return (
    <div style={{ position: "fixed", top: 20, right: 20, zIndex: 9999, display: "flex", flexDirection: "column", gap: 8, maxWidth: 320 }}>
      {toasts.map(t => (
        <div key={t.id} style={{ background: "#1e293b", color: "#fff", borderRadius: 12, padding: "12px 16px", display: "flex", alignItems: "center", gap: 10, fontSize: 13, boxShadow: "0 8px 24px rgba(0,0,0,0.4)", animation: "fadeIn 0.3s ease", borderLeft: `4px solid ${t.type === "error" ? "#ef4444" : t.type === "warn" ? "#f59f00" : "#22c55e"}` }}>
          <span style={{ fontSize: 18 }}>{t.icon}</span><span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}

function useToast() {
  const [toasts, setToasts] = useState([]);
  const tid = useRef(0);
  const addToast = useCallback((message, icon = "✅", type = "success") => {
    const id = ++tid.current;
    setToasts(p => [...p, { id, message, icon, type }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3000);
  }, []);
  return { toasts, addToast };
}

// ─── LOGIN SCREEN ─────────────────────────────────────────────────────────────
function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState(ADMIN_EMAIL);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      await signInWithEmailAndPassword(auth, email, password);
      onLogin();
    } catch (err) {
      setError("Invalid credentials. Please try again.");
    }
    setLoading(false);
  };

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg,#0f172a,#1e293b)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: "#1e293b", borderRadius: 24, padding: 40, width: "100%", maxWidth: 400, boxShadow: "0 25px 50px rgba(0,0,0,0.5)", border: "1px solid #334155" }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🛒</div>
          <h1 style={{ color: "#f1f5f9", margin: 0, fontSize: 24, fontWeight: 800 }}>QuickMart</h1>
          <p style={{ color: "#64748b", margin: "4px 0 0", fontSize: 14 }}>Admin Panel</p>
        </div>
        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", color: "#94a3b8", fontSize: 12, fontWeight: 600, marginBottom: 6, letterSpacing: 0.5 }}>EMAIL</label>
            <input value={email} onChange={e => setEmail(e.target.value)} type="email" style={{ width: "100%", background: "#0f172a", border: "1px solid #334155", borderRadius: 10, padding: "12px 14px", color: "#f1f5f9", fontSize: 14, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
          </div>
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: "block", color: "#94a3b8", fontSize: 12, fontWeight: 600, marginBottom: 6, letterSpacing: 0.5 }}>PASSWORD</label>
            <input value={password} onChange={e => setPassword(e.target.value)} type="password" placeholder="••••••••" style={{ width: "100%", background: "#0f172a", border: "1px solid #334155", borderRadius: 10, padding: "12px 14px", color: "#f1f5f9", fontSize: 14, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
          </div>
          {error && <p style={{ color: "#ef4444", fontSize: 13, margin: "0 0 16px", textAlign: "center" }}>{error}</p>}
          <button type="submit" disabled={loading} style={{ width: "100%", background: "linear-gradient(135deg,#0ea5e9,#06b6d4)", color: "#fff", border: "none", borderRadius: 12, padding: "14px 0", fontWeight: 800, fontSize: 16, cursor: "pointer", fontFamily: "inherit" }}>
            {loading ? "Signing in..." : "Sign In →"}
          </button>
        </form>
        <p style={{ color: "#475569", fontSize: 11, textAlign: "center", marginTop: 20 }}>QuickMart Admin v2.0 · Secure Access</p>
      </div>
    </div>
  );
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
function Dashboard({ orders, products }) {
  const today = new Date(); today.setHours(0,0,0,0);
  const todayOrders = orders.filter(o => o.createdAt?.toDate && o.createdAt.toDate() >= today);
  const revenue = orders.filter(o => o.status === "delivered").reduce((s, o) => s + (o.total || 0), 0);
  const todayRevenue = todayOrders.filter(o => o.status === "delivered").reduce((s, o) => s + (o.total || 0), 0);
  const activeDeliveries = orders.filter(o => o.status === "out_for_delivery").length;
  const pendingOrders = orders.filter(o => o.status === "pending").length;
  const lowStock = products.filter(p => p.available === false).length;

  const stats = [
    { label: "Total Orders", value: orders.length, icon: "📦", color: "#0ea5e9", bg: "#f0f9ff", sub: `${todayOrders.length} today` },
    { label: "Total Revenue", value: `₹${revenue.toLocaleString()}`, icon: "💰", color: "#22c55e", bg: "#f0fdf4", sub: `₹${todayRevenue} today` },
    { label: "Active Deliveries", value: activeDeliveries, icon: "🛵", color: "#f97316", bg: "#fff7ed", sub: "On the way" },
    { label: "Pending Orders", value: pendingOrders, icon: "⏳", color: "#f59f00", bg: "#fffbeb", sub: "Need attention" },
    { label: "Products", value: products.length, icon: "🛒", color: "#8b5cf6", bg: "#f5f3ff", sub: `${lowStock} out of stock` },
  ];

  const recentOrders = orders.slice(0, 8);

  return (
    <div>
      <h2 style={{ color: "#f1f5f9", fontSize: 20, fontWeight: 800, margin: "0 0 20px" }}>📊 Dashboard</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 14, marginBottom: 28 }}>
        {stats.map(s => (
          <div key={s.label} style={{ background: "#1e293b", borderRadius: 16, padding: 18, border: "1px solid #334155" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
              <span style={{ fontSize: 28 }}>{s.icon}</span>
              <span style={{ background: s.bg, color: s.color, borderRadius: 8, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>Live</span>
            </div>
            <p style={{ margin: 0, color: s.color, fontSize: 26, fontWeight: 900 }}>{s.value}</p>
            <p style={{ margin: "4px 0 0", color: "#94a3b8", fontSize: 12 }}>{s.label}</p>
            <p style={{ margin: "2px 0 0", color: "#475569", fontSize: 11 }}>{s.sub}</p>
          </div>
        ))}
      </div>

      <h3 style={{ color: "#f1f5f9", fontSize: 16, fontWeight: 700, margin: "0 0 14px" }}>Recent Orders</h3>
      <div style={{ background: "#1e293b", borderRadius: 16, overflow: "hidden", border: "1px solid #334155" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 600 }}>
            <thead><tr style={{ background: "#0f172a" }}>
              {["Order ID", "Items", "Total", "Address", "Status", "Time"].map(h => <th key={h} style={{ padding: "12px 16px", textAlign: "left", color: "#64748b", fontSize: 11, fontWeight: 700, letterSpacing: 0.5, whiteSpace: "nowrap" }}>{h.toUpperCase()}</th>)}
            </tr></thead>
            <tbody>
              {recentOrders.map((o, idx) => {
                const cfg = STATUS_CONFIG[o.status] || { color: "#94a3b8", bg: "#1e293b", label: o.status };
                return (
                  <tr key={o.id} style={{ borderTop: "1px solid #334155", background: idx % 2 === 0 ? "transparent" : "#162032" }}>
                    <td style={{ padding: "12px 16px", color: "#94a3b8", fontSize: 12, fontFamily: "monospace" }}>#{o.id?.slice(-6).toUpperCase()}</td>
                    <td style={{ padding: "12px 16px", color: "#cbd5e1", fontSize: 13 }}>{o.items?.map(i => i.name).join(", ").slice(0, 30) || "—"}...</td>
                    <td style={{ padding: "12px 16px", color: "#0ea5e9", fontSize: 14, fontWeight: 700 }}>₹{o.total}</td>
                    <td style={{ padding: "12px 16px", color: "#94a3b8", fontSize: 12 }}>{o.address?.slice(0, 25) || "—"}...</td>
                    <td style={{ padding: "12px 16px" }}><span style={{ background: cfg.bg, color: cfg.color, borderRadius: 6, padding: "3px 8px", fontSize: 11, fontWeight: 700 }}>{cfg.label}</span></td>
                    <td style={{ padding: "12px 16px", color: "#64748b", fontSize: 12 }}>{o.createdAt?.toDate ? o.createdAt.toDate().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {recentOrders.length === 0 && <p style={{ color: "#64748b", textAlign: "center", padding: 32 }}>No orders yet</p>}
      </div>
    </div>
  );
}

// ─── PRODUCT MODAL ────────────────────────────────────────────────────────────
function ProductModal({ product, categories, onSave, onClose }) {
  const [form, setForm] = useState({
    name: product?.name || "", category: product?.category || categories[0]?.id || "",
    price: product?.price || "", originalPrice: product?.originalPrice || "",
    unit: product?.unit || "kg", badge: product?.badge || "",
    image: product?.image || "", available: product?.available !== false,
    discount: product?.discount || 0, description: product?.description || ""
  });
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(product?.image || "");
  const fileRef = useRef();

  const handleFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setPreview(URL.createObjectURL(file));
    setUploading(true);
    try {
      const storageRef = ref(storage, `products/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      setForm(f => ({ ...f, image: url }));
    } catch (err) { alert("Image upload failed: " + err.message); }
    setUploading(false);
  };

  const save = () => {
    if (!form.name || !form.price || !form.category) { alert("Name, price, and category are required"); return; }
    onSave({ ...form, price: Number(form.price), originalPrice: Number(form.originalPrice) || 0, discount: Number(form.discount) || 0 });
  };

  const field = (label, key, type = "text", extra = {}) => (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: "block", color: "#94a3b8", fontSize: 11, fontWeight: 600, marginBottom: 5, letterSpacing: 0.5 }}>{label.toUpperCase()}</label>
      <input type={type} value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} {...extra}
        style={{ width: "100%", background: "#0f172a", border: "1px solid #334155", borderRadius: 10, padding: "10px 12px", color: "#f1f5f9", fontSize: 14, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
    </div>
  );

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: "#1e293b", borderRadius: 20, padding: 28, width: "100%", maxWidth: 520, maxHeight: "90vh", overflowY: "auto", border: "1px solid #334155" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 24 }}>
          <h3 style={{ color: "#f1f5f9", margin: 0, fontSize: 18, fontWeight: 800 }}>{product ? "Edit Product" : "Add Product"}</h3>
          <button onClick={onClose} style={{ background: "#334155", border: "none", borderRadius: 8, padding: "6px 12px", color: "#94a3b8", cursor: "pointer", fontFamily: "inherit" }}>✕ Close</button>
        </div>

        {/* IMAGE UPLOAD */}
        <div style={{ marginBottom: 18 }}>
          <label style={{ display: "block", color: "#94a3b8", fontSize: 11, fontWeight: 600, marginBottom: 8, letterSpacing: 0.5 }}>PRODUCT IMAGE</label>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <div onClick={() => fileRef.current?.click()} style={{ width: 80, height: 80, background: "#0f172a", borderRadius: 12, border: "2px dashed #334155", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", overflow: "hidden", flexShrink: 0 }}>
              {preview ? <img src={preview} alt="preview" style={{ width: "100%", height: "100%", objectFit: "contain" }} /> : <span style={{ color: "#475569", fontSize: 28 }}>📷</span>}
            </div>
            <div style={{ flex: 1 }}>
              <button onClick={() => fileRef.current?.click()} style={{ background: "#334155", border: "none", borderRadius: 8, padding: "8px 16px", color: "#e2e8f0", cursor: "pointer", fontSize: 13, fontFamily: "inherit", marginBottom: 6, display: "block" }}>{uploading ? "⏳ Uploading..." : "📁 Upload Image"}</button>
              <input value={form.image} onChange={e => { setForm(f => ({ ...f, image: e.target.value })); setPreview(e.target.value); }} placeholder="or paste image URL / emoji" style={{ width: "100%", background: "#0f172a", border: "1px solid #334155", borderRadius: 8, padding: "7px 10px", color: "#94a3b8", fontSize: 12, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
            </div>
          </div>
          <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} style={{ display: "none" }} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 14px" }}>
          <div style={{ gridColumn: "1/-1" }}>{field("Product Name", "name", "text", { placeholder: "e.g. Fresh Apples" })}</div>
          <div>
            <label style={{ display: "block", color: "#94a3b8", fontSize: 11, fontWeight: 600, marginBottom: 5, letterSpacing: 0.5 }}>CATEGORY</label>
            <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} style={{ width: "100%", background: "#0f172a", border: "1px solid #334155", borderRadius: 10, padding: "10px 12px", color: "#f1f5f9", fontSize: 14, outline: "none", fontFamily: "inherit", marginBottom: 14 }}>
              {categories.map(c => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: "block", color: "#94a3b8", fontSize: 11, fontWeight: 600, marginBottom: 5, letterSpacing: 0.5 }}>UNIT</label>
            <select value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} style={{ width: "100%", background: "#0f172a", border: "1px solid #334155", borderRadius: 10, padding: "10px 12px", color: "#f1f5f9", fontSize: 14, outline: "none", fontFamily: "inherit", marginBottom: 14 }}>
              {["kg", "g", "litre", "ml", "piece", "pack", "dozen", "bunch", "box", "200g", "500g", "1L"].map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          {field("Price (₹)", "price", "number", { placeholder: "0", min: "0" })}
          {field("Original Price (₹) for strikethrough", "originalPrice", "number", { placeholder: "0" })}
          {field("Discount %", "discount", "number", { placeholder: "0", min: "0", max: "100" })}
          {field("Badge (e.g. Fresh, Organic)", "badge", "text", { placeholder: "Optional" })}
          <div style={{ gridColumn: "1/-1" }}>
            <label style={{ display: "block", color: "#94a3b8", fontSize: 11, fontWeight: 600, marginBottom: 5, letterSpacing: 0.5 }}>DESCRIPTION (OPTIONAL)</label>
            <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} placeholder="Short description..." style={{ width: "100%", background: "#0f172a", border: "1px solid #334155", borderRadius: 10, padding: "10px 12px", color: "#f1f5f9", fontSize: 14, outline: "none", fontFamily: "inherit", resize: "none", boxSizing: "border-box", marginBottom: 14 }} />
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
          <div onClick={() => setForm(f => ({ ...f, available: !f.available }))} style={{ width: 44, height: 24, background: form.available ? "#22c55e" : "#334155", borderRadius: 12, position: "relative", cursor: "pointer", transition: "background 0.2s", flexShrink: 0 }}>
            <div style={{ position: "absolute", top: 2, left: form.available ? 22 : 2, width: 20, height: 20, background: "#fff", borderRadius: "50%", transition: "left 0.2s" }} />
          </div>
          <span style={{ color: "#e2e8f0", fontSize: 14 }}>Available for purchase</span>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, background: "#334155", border: "none", borderRadius: 12, padding: "12px 0", color: "#e2e8f0", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
          <button onClick={save} disabled={uploading} style={{ flex: 2, background: "linear-gradient(135deg,#0ea5e9,#06b6d4)", border: "none", borderRadius: 12, padding: "12px 0", color: "#fff", fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>{uploading ? "Wait..." : product ? "Save Changes" : "Add Product"}</button>
        </div>
      </div>
    </div>
  );
}

// ─── PRODUCTS PAGE ────────────────────────────────────────────────────────────
function ProductsPage({ products, categories, addToast }) {
  const [modal, setModal] = useState(null); // null | "add" | product
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("all");
  const [deleting, setDeleting] = useState(null);

  const filtered = products.filter(p =>
    (catFilter === "all" || p.category === catFilter) &&
    (!search || p.name.toLowerCase().includes(search.toLowerCase()))
  );

  const saveProduct = async (data) => {
    try {
      if (modal && modal.id) {
        await updateDoc(doc(db, "products", modal.id), { ...data, updatedAt: serverTimestamp() });
        addToast("Product updated!", "✅");
      } else {
        await addDoc(collection(db, "products"), { ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
        addToast("Product added!", "✅");
      }
      setModal(null);
    } catch (e) { addToast("Error: " + e.message, "❌", "error"); }
  };

  const deleteProduct = async (product) => {
    if (!window.confirm(`Delete "${product.name}"?`)) return;
    setDeleting(product.id);
    try {
      await deleteDoc(doc(db, "products", product.id));
      if (product.image?.startsWith("https://firebasestorage")) {
        try { await deleteObject(ref(storage, product.image)); } catch {}
      }
      addToast("Product deleted", "🗑️");
    } catch (e) { addToast("Error: " + e.message, "❌", "error"); }
    setDeleting(null);
  };

  const toggleAvailable = async (product) => {
    await updateDoc(doc(db, "products", product.id), { available: !product.available, updatedAt: serverTimestamp() });
    addToast(product.available ? "Marked out of stock" : "Marked available", "🔄");
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <h2 style={{ color: "#f1f5f9", fontSize: 20, fontWeight: 800, margin: 0 }}>🛒 Products ({products.length})</h2>
        <button onClick={() => setModal("add")} style={{ background: "linear-gradient(135deg,#0ea5e9,#06b6d4)", color: "#fff", border: "none", borderRadius: 10, padding: "10px 20px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", fontSize: 14 }}>+ Add Product</button>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Search products..." style={{ flex: 1, minWidth: 180, background: "#1e293b", border: "1px solid #334155", borderRadius: 10, padding: "10px 14px", color: "#f1f5f9", fontSize: 14, outline: "none", fontFamily: "inherit" }} />
        <select value={catFilter} onChange={e => setCatFilter(e.target.value)} style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 10, padding: "10px 14px", color: "#f1f5f9", fontSize: 13, outline: "none", fontFamily: "inherit" }}>
          <option value="all">All Categories</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
        </select>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 14 }}>
        {filtered.map(p => {
          const cat = categories.find(c => c.id === p.category) || {};
          return (
            <div key={p.id} style={{ background: "#1e293b", borderRadius: 16, overflow: "hidden", border: `1px solid ${p.available ? "#334155" : "#ef444430"}`, position: "relative" }}>
              {!p.available && <div style={{ position: "absolute", top: 8, right: 8, background: "#ef4444", color: "#fff", borderRadius: 6, padding: "2px 8px", fontSize: 10, fontWeight: 700, zIndex: 2 }}>OUT OF STOCK</div>}
              <div style={{ background: cat.bg || "#1e293b", height: 100, display: "flex", alignItems: "center", justifyContent: "center", opacity: p.available ? 1 : 0.5 }}>
                {p.image?.startsWith("http") ? <img src={p.image} alt={p.name} style={{ height: 80, objectFit: "contain" }} /> : <span style={{ fontSize: 52 }}>{p.image || "🛒"}</span>}
              </div>
              <div style={{ padding: "12px 14px" }}>
                <p style={{ margin: "0 0 2px", color: "#e2e8f0", fontWeight: 700, fontSize: 14 }}>{p.name}</p>
                <p style={{ margin: "0 0 8px", color: "#64748b", fontSize: 12 }}>{cat.emoji} {cat.name} · per {p.unit}</p>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <div>
                    {p.originalPrice > p.price && <span style={{ color: "#64748b", fontSize: 11, textDecoration: "line-through", marginRight: 4 }}>₹{p.originalPrice}</span>}
                    <span style={{ color: "#0ea5e9", fontWeight: 800, fontSize: 18 }}>₹{p.price}</span>
                  </div>
                  {p.discount > 0 && <span style={{ background: "#ef444420", color: "#ef4444", borderRadius: 6, padding: "2px 7px", fontSize: 11, fontWeight: 700 }}>-{p.discount}%</span>}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => setModal(p)} style={{ flex: 1, background: "#334155", border: "none", borderRadius: 8, padding: "7px 0", color: "#e2e8f0", fontWeight: 600, cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>✏️ Edit</button>
                  <button onClick={() => toggleAvailable(p)} style={{ flex: 1, background: p.available ? "#f59f0020" : "#22c55e20", border: "none", borderRadius: 8, padding: "7px 0", color: p.available ? "#f59f00" : "#22c55e", fontWeight: 600, cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>{p.available ? "🚫 Stock" : "✅ Stock"}</button>
                  <button onClick={() => deleteProduct(p)} disabled={deleting === p.id} style={{ background: "#ef444420", border: "none", borderRadius: 8, padding: "7px 10px", color: "#ef4444", cursor: "pointer", fontFamily: "inherit" }}>🗑️</button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && <div style={{ textAlign: "center", padding: "60px 20px" }}><p style={{ color: "#64748b", fontSize: 16 }}>No products found</p></div>}
      {(modal === "add" || (modal && modal.id)) && <ProductModal product={modal === "add" ? null : modal} categories={categories} onSave={saveProduct} onClose={() => setModal(null)} />}
    </div>
  );
}

// ─── ORDERS PAGE ──────────────────────────────────────────────────────────────
function OrdersPage({ orders, addToast }) {
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");

  const filtered = orders.filter(o =>
    (statusFilter === "all" || o.status === statusFilter) &&
    (!search || o.id?.toLowerCase().includes(search.toLowerCase()) || o.address?.toLowerCase().includes(search.toLowerCase()))
  );

  const updateStatus = async (order, newStatus) => {
    try {
      await updateDoc(doc(db, "orders", order.id), { status: newStatus, updatedAt: serverTimestamp() });
      addToast(`Order #${order.id.slice(-6).toUpperCase()} → ${STATUS_CONFIG[newStatus]?.label}`, "🔄");
    } catch (e) { addToast("Update failed", "❌", "error"); }
  };

  const cancelOrder = async (order) => {
    if (!window.confirm("Cancel this order?")) return;
    await updateDoc(doc(db, "orders", order.id), { status: "cancelled", updatedAt: serverTimestamp() });
    addToast("Order cancelled", "❌");
  };

  const counts = Object.fromEntries(Object.keys(STATUS_CONFIG).map(s => [s, orders.filter(o => o.status === s).length]));

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <h2 style={{ color: "#f1f5f9", fontSize: 20, fontWeight: 800, margin: 0 }}>📦 Orders ({orders.length})</h2>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Search by ID or address..." style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 10, padding: "9px 14px", color: "#f1f5f9", fontSize: 13, outline: "none", fontFamily: "inherit", width: 240 }} />
      </div>

      {/* STATUS FILTERS */}
      <div style={{ display: "flex", gap: 8, marginBottom: 18, overflowX: "auto", paddingBottom: 4 }}>
        <button onClick={() => setStatusFilter("all")} style={{ background: statusFilter === "all" ? "#0ea5e9" : "#1e293b", color: statusFilter === "all" ? "#fff" : "#94a3b8", border: "1px solid " + (statusFilter === "all" ? "#0ea5e9" : "#334155"), borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", fontFamily: "inherit" }}>All ({orders.length})</button>
        {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
          <button key={key} onClick={() => setStatusFilter(key)} style={{ background: statusFilter === key ? cfg.color : "#1e293b", color: statusFilter === key ? "#fff" : cfg.color, border: `1px solid ${cfg.color}60`, borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", fontFamily: "inherit" }}>{cfg.label} ({counts[key] || 0})</button>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {filtered.map(order => {
          const cfg = STATUS_CONFIG[order.status] || { label: order.status, color: "#94a3b8", bg: "#1e293b" };
          return (
            <div key={order.id} style={{ background: "#1e293b", borderRadius: 16, padding: 18, border: "1px solid #334155" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
                <div>
                  <p style={{ margin: 0, color: "#f1f5f9", fontWeight: 800, fontSize: 15, fontFamily: "monospace" }}>#{order.id?.slice(-8).toUpperCase()}</p>
                  <p style={{ margin: "2px 0 0", color: "#64748b", fontSize: 12 }}>{order.createdAt?.toDate ? order.createdAt.toDate().toLocaleString() : "Just now"}</p>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ background: cfg.bg || "#1e293b", color: cfg.color, borderRadius: 8, padding: "5px 12px", fontSize: 12, fontWeight: 700, border: `1px solid ${cfg.color}40` }}>{cfg.label}</span>
                  <span style={{ color: "#0ea5e9", fontWeight: 900, fontSize: 18 }}>₹{order.total}</span>
                </div>
              </div>

              <div style={{ background: "#0f172a", borderRadius: 10, padding: "10px 14px", marginBottom: 12 }}>
                <p style={{ margin: "0 0 4px", color: "#94a3b8", fontSize: 11, fontWeight: 600 }}>ITEMS</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {(order.items || []).map((item, i) => <span key={i} style={{ background: "#1e293b", color: "#cbd5e1", borderRadius: 6, padding: "3px 8px", fontSize: 12 }}>{item.name} ×{item.qty}</span>)}
                </div>
              </div>

              <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
                <div style={{ flex: 1, background: "#0f172a", borderRadius: 10, padding: "10px 14px" }}>
                  <p style={{ margin: "0 0 2px", color: "#64748b", fontSize: 11, fontWeight: 600 }}>ADDRESS</p>
                  <p style={{ margin: 0, color: "#cbd5e1", fontSize: 13 }}>{order.address || "—"}</p>
                </div>
                <div style={{ background: "#0f172a", borderRadius: 10, padding: "10px 14px" }}>
                  <p style={{ margin: "0 0 2px", color: "#64748b", fontSize: 11, fontWeight: 600 }}>PAYMENT</p>
                  <p style={{ margin: 0, color: "#cbd5e1", fontSize: 13 }}>{order.paymentMethod?.toUpperCase() || "UPI"}</p>
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {cfg.next && (
                  <button onClick={() => updateStatus(order, cfg.next)} style={{ background: `${STATUS_CONFIG[cfg.next]?.color}20`, color: STATUS_CONFIG[cfg.next]?.color, border: `1px solid ${STATUS_CONFIG[cfg.next]?.color}60`, borderRadius: 8, padding: "8px 16px", fontWeight: 700, cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}>
                    → {STATUS_CONFIG[cfg.next]?.label}
                  </button>
                )}
                {order.status !== "cancelled" && order.status !== "delivered" && (
                  <button onClick={() => cancelOrder(order)} style={{ background: "#ef444420", color: "#ef4444", border: "1px solid #ef444440", borderRadius: 8, padding: "8px 16px", fontWeight: 700, cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}>✕ Cancel</button>
                )}
                {order.promoCode && <span style={{ background: "#22c55e20", color: "#22c55e", borderRadius: 8, padding: "8px 12px", fontSize: 12, fontWeight: 700, border: "1px solid #22c55e40" }}>🏷️ {order.promoCode}</span>}
              </div>
            </div>
          );
        })}
      </div>
      {filtered.length === 0 && <div style={{ textAlign: "center", padding: "60px 20px" }}><p style={{ color: "#64748b" }}>No orders match the filter</p></div>}
    </div>
  );
}

// ─── CATEGORIES PAGE ──────────────────────────────────────────────────────────
function CategoriesPage({ categories, addToast }) {
  const [form, setForm] = useState({ name: "", emoji: "🛒", color: "#0ea5e9", bg: "#f0f9ff" });
  const [editing, setEditing] = useState(null);

  const save = async () => {
    if (!form.name) { addToast("Name required", "❌", "error"); return; }
    try {
      if (editing) {
        await updateDoc(doc(db, "categories", editing), { ...form });
        addToast("Category updated!", "✅");
      } else {
        await addDoc(collection(db, "categories"), { ...form });
        addToast("Category added!", "✅");
      }
      setForm({ name: "", emoji: "🛒", color: "#0ea5e9", bg: "#f0f9ff" }); setEditing(null);
    } catch (e) { addToast(e.message, "❌", "error"); }
  };

  const del = async (cat) => {
    if (!window.confirm(`Delete "${cat.name}"?`)) return;
    await deleteDoc(doc(db, "categories", cat.id));
    addToast("Category deleted", "🗑️");
  };

  const inp = (label, key, type = "text") => (
    <div>
      <label style={{ display: "block", color: "#94a3b8", fontSize: 11, fontWeight: 600, marginBottom: 5 }}>{label}</label>
      <input type={type} value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} style={{ width: "100%", background: "#0f172a", border: "1px solid #334155", borderRadius: 8, padding: "9px 12px", color: "#f1f5f9", fontSize: 13, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
    </div>
  );

  return (
    <div>
      <h2 style={{ color: "#f1f5f9", fontSize: 20, fontWeight: 800, margin: "0 0 20px" }}>📂 Categories</h2>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <div style={{ background: "#1e293b", borderRadius: 16, padding: 20, border: "1px solid #334155" }}>
          <h3 style={{ color: "#f1f5f9", margin: "0 0 16px", fontSize: 15, fontWeight: 700 }}>{editing ? "Edit Category" : "Add Category"}</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {inp("Name", "name")}
            {inp("Emoji", "emoji")}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div><label style={{ display: "block", color: "#94a3b8", fontSize: 11, fontWeight: 600, marginBottom: 5 }}>ACCENT COLOR</label>
                <input type="color" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} style={{ width: "100%", height: 38, background: "#0f172a", border: "1px solid #334155", borderRadius: 8, cursor: "pointer", padding: 2 }} /></div>
              <div><label style={{ display: "block", color: "#94a3b8", fontSize: 11, fontWeight: 600, marginBottom: 5 }}>BG COLOR</label>
                <input type="color" value={form.bg} onChange={e => setForm(f => ({ ...f, bg: e.target.value }))} style={{ width: "100%", height: 38, background: "#0f172a", border: "1px solid #334155", borderRadius: 8, cursor: "pointer", padding: 2 }} /></div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {editing && <button onClick={() => { setEditing(null); setForm({ name: "", emoji: "🛒", color: "#0ea5e9", bg: "#f0f9ff" }); }} style={{ flex: 1, background: "#334155", border: "none", borderRadius: 8, padding: "10px 0", color: "#e2e8f0", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>}
              <button onClick={save} style={{ flex: 2, background: "linear-gradient(135deg,#0ea5e9,#06b6d4)", border: "none", borderRadius: 8, padding: "10px 0", color: "#fff", fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>{editing ? "Save" : "Add Category"}</button>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {categories.map(cat => (
            <div key={cat.id} style={{ background: "#1e293b", borderRadius: 12, padding: "12px 16px", display: "flex", alignItems: "center", gap: 12, border: "1px solid #334155" }}>
              <div style={{ width: 42, height: 42, background: cat.bg, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>{cat.emoji}</div>
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, color: "#e2e8f0", fontWeight: 700, fontSize: 14 }}>{cat.name}</p>
                <div style={{ display: "flex", gap: 6, marginTop: 3 }}>
                  <span style={{ background: cat.color + "30", color: cat.color, borderRadius: 4, padding: "1px 6px", fontSize: 10, fontWeight: 700 }}>Accent</span>
                  <span style={{ background: cat.bg, color: "#64748b", borderRadius: 4, padding: "1px 6px", fontSize: 10, border: "1px solid #334155" }}>BG</span>
                </div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => { setEditing(cat.id); setForm({ name: cat.name, emoji: cat.emoji, color: cat.color, bg: cat.bg }); }} style={{ background: "#334155", border: "none", borderRadius: 8, padding: "6px 10px", color: "#e2e8f0", cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}>✏️</button>
                <button onClick={() => del(cat)} style={{ background: "#ef444420", border: "none", borderRadius: 8, padding: "6px 10px", color: "#ef4444", cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}>🗑️</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── OFFERS PAGE ──────────────────────────────────────────────────────────────
function OffersPage({ addToast }) {
  const [offers, setOffers] = useState([]);
  const [form, setForm] = useState({ code: "", discount: "", type: "percent", minOrder: "", description: "", active: true });
  const [editing, setEditing] = useState(null);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "offers"), snap => setOffers(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    return () => unsub();
  }, []);

  const save = async () => {
    if (!form.code || !form.discount) { addToast("Code and discount required", "❌", "error"); return; }
    const data = { ...form, code: form.code.toUpperCase(), discount: Number(form.discount), minOrder: Number(form.minOrder) || 0 };
    try {
      if (editing) { await updateDoc(doc(db, "offers", editing), data); addToast("Offer updated!", "✅"); }
      else { await addDoc(collection(db, "offers"), { ...data, createdAt: serverTimestamp() }); addToast("Offer created!", "🎉"); }
      setForm({ code: "", discount: "", type: "percent", minOrder: "", description: "", active: true }); setEditing(null);
    } catch (e) { addToast(e.message, "❌", "error"); }
  };

  const toggle = async (offer) => {
    await updateDoc(doc(db, "offers", offer.id), { active: !offer.active });
    addToast(offer.active ? "Offer deactivated" : "Offer activated", "🔄");
  };

  const del = async (offer) => {
    if (!window.confirm(`Delete offer "${offer.code}"?`)) return;
    await deleteDoc(doc(db, "offers", offer.id));
    addToast("Offer deleted", "🗑️");
  };

  return (
    <div>
      <h2 style={{ color: "#f1f5f9", fontSize: 20, fontWeight: 800, margin: "0 0 20px" }}>🏷️ Offers & Promo Codes</h2>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.5fr", gap: 20 }}>
        <div style={{ background: "#1e293b", borderRadius: 16, padding: 20, border: "1px solid #334155", height: "fit-content" }}>
          <h3 style={{ color: "#f1f5f9", margin: "0 0 16px", fontSize: 15, fontWeight: 700 }}>{editing ? "Edit Offer" : "Create Offer"}</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {[["Promo Code", "code", "text"], ["Discount Value", "discount", "number"], ["Min. Order (₹)", "minOrder", "number"], ["Description", "description", "text"]].map(([l, k, t]) => (
              <div key={k}>
                <label style={{ display: "block", color: "#94a3b8", fontSize: 11, fontWeight: 600, marginBottom: 5 }}>{l.toUpperCase()}</label>
                <input type={t} value={form[k]} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))} placeholder={k === "code" ? "e.g. SAVE20" : ""} style={{ width: "100%", background: "#0f172a", border: "1px solid #334155", borderRadius: 8, padding: "9px 12px", color: "#f1f5f9", fontSize: 13, outline: "none", fontFamily: "inherit", boxSizing: "border-box", letterSpacing: k === "code" ? 2 : 0 }} />
              </div>
            ))}
            <div>
              <label style={{ display: "block", color: "#94a3b8", fontSize: 11, fontWeight: 600, marginBottom: 5 }}>DISCOUNT TYPE</label>
              <div style={{ display: "flex", gap: 8 }}>
                {[["percent", "% Off"], ["fixed", "₹ Off"]].map(([v, l]) => (
                  <button key={v} onClick={() => setForm(f => ({ ...f, type: v }))} style={{ flex: 1, background: form.type === v ? "#0ea5e9" : "#0f172a", color: form.type === v ? "#fff" : "#94a3b8", border: `1px solid ${form.type === v ? "#0ea5e9" : "#334155"}`, borderRadius: 8, padding: "9px 0", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>{l}</button>
                ))}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div onClick={() => setForm(f => ({ ...f, active: !f.active }))} style={{ width: 40, height: 22, background: form.active ? "#22c55e" : "#334155", borderRadius: 11, position: "relative", cursor: "pointer", transition: "background 0.2s" }}>
                <div style={{ position: "absolute", top: 2, left: form.active ? 20 : 2, width: 18, height: 18, background: "#fff", borderRadius: "50%", transition: "left 0.2s" }} />
              </div>
              <span style={{ color: "#e2e8f0", fontSize: 13 }}>Active</span>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {editing && <button onClick={() => { setEditing(null); setForm({ code: "", discount: "", type: "percent", minOrder: "", description: "", active: true }); }} style={{ flex: 1, background: "#334155", border: "none", borderRadius: 8, padding: "10px 0", color: "#e2e8f0", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>}
              <button onClick={save} style={{ flex: 2, background: "linear-gradient(135deg,#0ea5e9,#06b6d4)", border: "none", borderRadius: 8, padding: "10px 0", color: "#fff", fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>{editing ? "Save Changes" : "Create Offer"}</button>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {offers.length === 0 && <p style={{ color: "#64748b", textAlign: "center", padding: 32 }}>No offers created yet</p>}
          {offers.map(offer => (
            <div key={offer.id} style={{ background: "#1e293b", borderRadius: 14, padding: 16, border: `1px solid ${offer.active ? "#22c55e40" : "#334155"}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                <div>
                  <p style={{ margin: "0 0 2px", color: "#f1f5f9", fontWeight: 900, fontSize: 18, letterSpacing: 2, fontFamily: "monospace" }}>{offer.code}</p>
                  <p style={{ margin: 0, color: "#94a3b8", fontSize: 12 }}>{offer.description || "No description"}</p>
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span style={{ background: offer.active ? "#22c55e20" : "#ef444420", color: offer.active ? "#22c55e" : "#ef4444", borderRadius: 6, padding: "3px 8px", fontSize: 11, fontWeight: 700 }}>{offer.active ? "Active" : "Inactive"}</span>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ background: "#0ea5e920", color: "#0ea5e9", borderRadius: 8, padding: "4px 10px", fontSize: 13, fontWeight: 700 }}>{offer.type === "percent" ? `${offer.discount}% off` : `₹${offer.discount} off`}</span>
                {offer.minOrder > 0 && <span style={{ color: "#64748b", fontSize: 12 }}>Min: ₹{offer.minOrder}</span>}
                <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                  <button onClick={() => toggle(offer)} style={{ background: "#334155", border: "none", borderRadius: 8, padding: "6px 10px", color: "#e2e8f0", cursor: "pointer", fontFamily: "inherit", fontSize: 12 }}>{offer.active ? "Deactivate" : "Activate"}</button>
                  <button onClick={() => { setEditing(offer.id); setForm({ code: offer.code, discount: offer.discount, type: offer.type, minOrder: offer.minOrder || "", description: offer.description || "", active: offer.active }); }} style={{ background: "#334155", border: "none", borderRadius: 8, padding: "6px 10px", color: "#e2e8f0", cursor: "pointer", fontFamily: "inherit", fontSize: 12 }}>✏️</button>
                  <button onClick={() => del(offer)} style={{ background: "#ef444420", border: "none", borderRadius: 8, padding: "6px 10px", color: "#ef4444", cursor: "pointer", fontFamily: "inherit", fontSize: 12 }}>🗑️</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── BANNERS PAGE ─────────────────────────────────────────────────────────────
function BannersPage({ addToast }) {
  const [banners, setBanners] = useState([]);
  const [form, setForm] = useState({ title: "", subtitle: "", bg: "linear-gradient(135deg,#667eea,#764ba2)", imageUrl: "", active: true, order: 0 });
  const [editing, setEditing] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef();

  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, "banners"), orderBy("order")), snap => setBanners(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    return () => unsub();
  }, []);

  const handleFile = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    setUploading(true);
    try {
      const sRef = ref(storage, `banners/${Date.now()}_${file.name}`);
      await uploadBytes(sRef, file);
      const url = await getDownloadURL(sRef);
      setForm(f => ({ ...f, imageUrl: url }));
      addToast("Image uploaded!", "✅");
    } catch (err) { addToast("Upload failed", "❌", "error"); }
    setUploading(false);
  };

  const save = async () => {
    if (!form.title) { addToast("Title required", "❌", "error"); return; }
    try {
      if (editing) { await updateDoc(doc(db, "banners", editing), form); addToast("Banner updated!", "✅"); }
      else { await addDoc(collection(db, "banners"), { ...form, createdAt: serverTimestamp() }); addToast("Banner created!", "🎉"); }
      setForm({ title: "", subtitle: "", bg: "linear-gradient(135deg,#667eea,#764ba2)", imageUrl: "", active: true, order: banners.length }); setEditing(null);
    } catch (e) { addToast(e.message, "❌", "error"); }
  };

  const del = async (b) => {
    if (!window.confirm("Delete banner?")) return;
    await deleteDoc(doc(db, "banners", b.id));
    addToast("Banner deleted", "🗑️");
  };

  const PRESETS = ["linear-gradient(135deg,#667eea,#764ba2)", "linear-gradient(135deg,#f093fb,#f5576c)", "linear-gradient(135deg,#4facfe,#00f2fe)", "linear-gradient(135deg,#43e97b,#38f9d7)", "linear-gradient(135deg,#fa709a,#fee140)", "linear-gradient(135deg,#a18cd1,#fbc2eb)"];

  return (
    <div>
      <h2 style={{ color: "#f1f5f9", fontSize: 20, fontWeight: 800, margin: "0 0 20px" }}>🖼️ Banners & Promotions</h2>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.5fr", gap: 20 }}>
        <div style={{ background: "#1e293b", borderRadius: 16, padding: 20, border: "1px solid #334155", height: "fit-content" }}>
          <h3 style={{ color: "#f1f5f9", margin: "0 0 16px", fontSize: 15, fontWeight: 700 }}>{editing ? "Edit Banner" : "Create Banner"}</h3>

          {/* PREVIEW */}
          <div style={{ background: form.bg, borderRadius: 12, padding: 16, marginBottom: 14, position: "relative", overflow: "hidden", minHeight: 70 }}>
            {form.imageUrl && <img src={form.imageUrl} alt="" style={{ position: "absolute", right: 0, top: 0, height: "100%", objectFit: "cover", opacity: 0.3 }} />}
            <p style={{ margin: "0 0 2px", color: "rgba(255,255,255,0.8)", fontSize: 11 }}>{form.subtitle || "Subtitle here"}</p>
            <p style={{ margin: 0, color: "#fff", fontWeight: 900, fontSize: 16 }}>{form.title || "Banner Title"}</p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[["Title", "title"], ["Subtitle", "subtitle"]].map(([l, k]) => (
              <div key={k}><label style={{ display: "block", color: "#94a3b8", fontSize: 11, fontWeight: 600, marginBottom: 4 }}>{l.toUpperCase()}</label>
                <input value={form[k]} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))} style={{ width: "100%", background: "#0f172a", border: "1px solid #334155", borderRadius: 8, padding: "9px 12px", color: "#f1f5f9", fontSize: 13, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} /></div>
            ))}
            <div>
              <label style={{ display: "block", color: "#94a3b8", fontSize: 11, fontWeight: 600, marginBottom: 6 }}>GRADIENT PRESETS</label>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {PRESETS.map(g => <div key={g} onClick={() => setForm(f => ({ ...f, bg: g }))} style={{ width: 28, height: 28, background: g, borderRadius: 6, cursor: "pointer", border: form.bg === g ? "2px solid #fff" : "2px solid transparent" }} />)}
              </div>
            </div>
            <div>
              <label style={{ display: "block", color: "#94a3b8", fontSize: 11, fontWeight: 600, marginBottom: 6 }}>BANNER IMAGE (optional)</label>
              <button onClick={() => fileRef.current?.click()} style={{ background: "#334155", border: "none", borderRadius: 8, padding: "8px 14px", color: "#e2e8f0", cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>{uploading ? "Uploading..." : "📁 Upload Image"}</button>
              <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} style={{ display: "none" }} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div onClick={() => setForm(f => ({ ...f, active: !f.active }))} style={{ width: 40, height: 22, background: form.active ? "#22c55e" : "#334155", borderRadius: 11, position: "relative", cursor: "pointer" }}>
                <div style={{ position: "absolute", top: 2, left: form.active ? 20 : 2, width: 18, height: 18, background: "#fff", borderRadius: "50%", transition: "left 0.2s" }} />
              </div>
              <span style={{ color: "#e2e8f0", fontSize: 13 }}>Show on app</span>
            </div>
            <button onClick={save} style={{ background: "linear-gradient(135deg,#0ea5e9,#06b6d4)", border: "none", borderRadius: 8, padding: "11px 0", color: "#fff", fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>{editing ? "Save Changes" : "Create Banner"}</button>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {banners.map(b => (
            <div key={b.id} style={{ borderRadius: 14, overflow: "hidden", border: `1px solid ${b.active ? "#334155" : "#ef444440"}` }}>
              <div style={{ background: b.bg, padding: "16px 20px", position: "relative" }}>
                {b.imageUrl && <img src={b.imageUrl} alt="" style={{ position: "absolute", right: 0, top: 0, height: "100%", objectFit: "cover", opacity: 0.25 }} />}
                <p style={{ margin: "0 0 2px", color: "rgba(255,255,255,0.8)", fontSize: 11 }}>{b.subtitle}</p>
                <p style={{ margin: 0, color: "#fff", fontWeight: 900, fontSize: 16 }}>{b.title}</p>
              </div>
              <div style={{ background: "#1e293b", padding: "10px 16px", display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ background: b.active ? "#22c55e20" : "#ef444420", color: b.active ? "#22c55e" : "#ef4444", borderRadius: 6, padding: "3px 8px", fontSize: 11, fontWeight: 700 }}>{b.active ? "Live" : "Hidden"}</span>
                <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                  <button onClick={() => { setEditing(b.id); setForm({ title: b.title, subtitle: b.subtitle || "", bg: b.bg, imageUrl: b.imageUrl || "", active: b.active, order: b.order || 0 }); }} style={{ background: "#334155", border: "none", borderRadius: 8, padding: "6px 10px", color: "#e2e8f0", cursor: "pointer", fontFamily: "inherit", fontSize: 12 }}>✏️ Edit</button>
                  <button onClick={() => updateDoc(doc(db, "banners", b.id), { active: !b.active })} style={{ background: b.active ? "#ef444420" : "#22c55e20", border: "none", borderRadius: 8, padding: "6px 10px", color: b.active ? "#ef4444" : "#22c55e", cursor: "pointer", fontFamily: "inherit", fontSize: 12 }}>{b.active ? "Hide" : "Show"}</button>
                  <button onClick={() => del(b)} style={{ background: "#ef444420", border: "none", borderRadius: 8, padding: "6px 10px", color: "#ef4444", cursor: "pointer", fontFamily: "inherit", fontSize: 12 }}>🗑️</button>
                </div>
              </div>
            </div>
          ))}
          {banners.length === 0 && <p style={{ color: "#64748b", textAlign: "center", padding: 32 }}>No banners created yet</p>}
        </div>
      </div>
    </div>
  );
}

// ─── SETTINGS PAGE ────────────────────────────────────────────────────────────
function SettingsPage({ addToast }) {
  const [settings, setSettings] = useState({ deliveryFee: 30, platformFee: 5, taxRate: 5, deliveryTime: 8 });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    getDoc(doc(db, "config", "settings")).then(snap => { if (snap.exists()) setSettings(snap.data()); setLoaded(true); });
  }, []);

  const save = async () => {
    await setDoc(doc(db, "config", "settings"), settings);
    addToast("Settings saved! App updated instantly ✅", "✅");
  };

  if (!loaded) return <p style={{ color: "#64748b" }}>Loading...</p>;

  return (
    <div>
      <h2 style={{ color: "#f1f5f9", fontSize: 20, fontWeight: 800, margin: "0 0 20px" }}>⚙️ App Settings</h2>
      <div style={{ background: "#1e293b", borderRadius: 16, padding: 28, border: "1px solid #334155", maxWidth: 500 }}>
        <p style={{ color: "#64748b", fontSize: 13, margin: "0 0 20px" }}>Changes here apply instantly to the customer app via real-time sync.</p>
        {[["Delivery Fee (₹)", "deliveryFee"], ["Platform Fee (₹)", "platformFee"], ["Tax Rate (%)", "taxRate"], ["Delivery Time (minutes)", "deliveryTime"]].map(([label, key]) => (
          <div key={key} style={{ marginBottom: 18 }}>
            <label style={{ display: "block", color: "#94a3b8", fontSize: 11, fontWeight: 600, marginBottom: 6, letterSpacing: 0.5 }}>{label.toUpperCase()}</label>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <button onClick={() => setSettings(s => ({ ...s, [key]: Math.max(0, (s[key] || 0) - 1) }))} style={{ background: "#334155", border: "none", borderRadius: 8, padding: "8px 14px", color: "#e2e8f0", cursor: "pointer", fontSize: 18, fontFamily: "inherit" }}>−</button>
              <input type="number" value={settings[key]} onChange={e => setSettings(s => ({ ...s, [key]: Number(e.target.value) }))} style={{ flex: 1, background: "#0f172a", border: "1px solid #334155", borderRadius: 8, padding: "10px 14px", color: "#f1f5f9", fontSize: 16, fontWeight: 700, outline: "none", fontFamily: "inherit", textAlign: "center" }} />
              <button onClick={() => setSettings(s => ({ ...s, [key]: (s[key] || 0) + 1 }))} style={{ background: "#334155", border: "none", borderRadius: 8, padding: "8px 14px", color: "#e2e8f0", cursor: "pointer", fontSize: 18, fontFamily: "inherit" }}>+</button>
            </div>
          </div>
        ))}
        <button onClick={save} style={{ width: "100%", background: "linear-gradient(135deg,#22c55e,#16a34a)", color: "#fff", border: "none", borderRadius: 12, padding: "14px 0", fontWeight: 800, fontSize: 16, cursor: "pointer", fontFamily: "inherit", marginTop: 8 }}>💾 Save Settings</button>
      </div>
    </div>
  );
}

// ─── ADMIN APP ROOT ───────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [page, setPage] = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [orders, setOrders] = useState([]);
  const { toasts, addToast } = useToast();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, u => { setUser(u); setAuthLoading(false); });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user) return;
    const unsubs = [];
    unsubs.push(onSnapshot(query(collection(db, "products"), orderBy("name")), snap => setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() })))));
    unsubs.push(onSnapshot(collection(db, "categories"), snap => setCategories(snap.docs.map(d => ({ id: d.id, ...d.data() })))));
    unsubs.push(onSnapshot(query(collection(db, "orders"), orderBy("createdAt", "desc")), snap => setOrders(snap.docs.map(d => ({ id: d.id, ...d.data() }))), () => {}));
    return () => unsubs.forEach(u => u());
  }, [user]);

  const pendingCount = orders.filter(o => o.status === "pending").length;
  const activeCount = orders.filter(o => ["confirmed", "preparing", "out_for_delivery"].includes(o.status)).length;

  const NAV = [
    { id: "dashboard", icon: "📊", label: "Dashboard" },
    { id: "orders", icon: "📦", label: "Orders", badge: pendingCount },
    { id: "products", icon: "🛒", label: "Products" },
    { id: "categories", icon: "📂", label: "Categories" },
    { id: "offers", icon: "🏷️", label: "Offers" },
    { id: "banners", icon: "🖼️", label: "Banners" },
    { id: "settings", icon: "⚙️", label: "Settings" },
  ];

  if (authLoading) return <div style={{ minHeight: "100vh", background: "#0f172a", display: "flex", alignItems: "center", justifyContent: "center" }}><p style={{ color: "#64748b" }}>Loading...</p></div>;
  if (!user) return <LoginScreen onLogin={() => {}} />;

  return (
    <>
      <style>{`
        * { box-sizing: border-box; }
        body { margin: 0; font-family: 'Inter', sans-serif; background: #0f172a; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: #0f172a; } ::-webkit-scrollbar-thumb { background: #334155; border-radius: 2px; }
        @keyframes fadeIn { from { opacity: 0; transform: translateX(8px); } to { opacity: 1; transform: translateX(0); } }
        input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; }
      `}</style>
      <Toast toasts={toasts} />
      <div style={{ display: "flex", minHeight: "100vh" }}>
        {/* SIDEBAR */}
        <div style={{ width: sidebarOpen ? 240 : 70, background: "#1e293b", borderRight: "1px solid #334155", transition: "width 0.25s", flexShrink: 0, display: "flex", flexDirection: "column", position: "fixed", top: 0, left: 0, bottom: 0, zIndex: 100 }}>
          <div style={{ padding: "20px 16px", display: "flex", alignItems: "center", gap: 10, borderBottom: "1px solid #334155" }}>
            <span style={{ fontSize: 28, flexShrink: 0 }}>🛒</span>
            {sidebarOpen && <div><p style={{ margin: 0, color: "#f1f5f9", fontWeight: 800, fontSize: 15 }}>QuickMart</p><p style={{ margin: 0, color: "#64748b", fontSize: 11 }}>Admin Panel</p></div>}
            <button onClick={() => setSidebarOpen(s => !s)} style={{ marginLeft: "auto", background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: 18, flexShrink: 0 }}>{sidebarOpen ? "◀" : "▶"}</button>
          </div>

          {activeCount > 0 && sidebarOpen && (
            <div style={{ margin: "12px 12px 0", background: "#f9731620", borderRadius: 10, padding: "8px 12px", border: "1px solid #f9731640" }}>
              <p style={{ margin: 0, color: "#f97316", fontSize: 12, fontWeight: 700 }}>🛵 {activeCount} active {activeCount === 1 ? "delivery" : "deliveries"}</p>
            </div>
          )}

          <nav style={{ flex: 1, padding: "12px 8px", overflowY: "auto" }}>
            {NAV.map(item => (
              <button key={item.id} onClick={() => setPage(item.id)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 10, background: page === item.id ? "#0ea5e920" : "none", border: `1px solid ${page === item.id ? "#0ea5e940" : "transparent"}`, color: page === item.id ? "#0ea5e9" : "#94a3b8", cursor: "pointer", fontFamily: "inherit", fontWeight: page === item.id ? 700 : 400, fontSize: 14, marginBottom: 2, position: "relative", transition: "all 0.15s", textAlign: "left" }}>
                <span style={{ fontSize: 18, flexShrink: 0 }}>{item.icon}</span>
                {sidebarOpen && <span>{item.label}</span>}
                {item.badge > 0 && <span style={{ position: "absolute", top: 8, right: sidebarOpen ? 10 : 4, background: "#ef4444", color: "#fff", borderRadius: "50%", width: 18, height: 18, fontSize: 10, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center" }}>{item.badge}</span>}
              </button>
            ))}
          </nav>

          <div style={{ padding: "12px 8px", borderTop: "1px solid #334155" }}>
            <button onClick={() => signOut(auth)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 10, background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontFamily: "inherit", fontSize: 14 }}>
              <span style={{ fontSize: 18 }}>🚪</span>
              {sidebarOpen && <span>Sign Out</span>}
            </button>
          </div>
        </div>

        {/* MAIN CONTENT */}
        <div style={{ flex: 1, marginLeft: sidebarOpen ? 240 : 70, transition: "margin 0.25s", padding: "28px 32px", minHeight: "100vh", overflowY: "auto" }}>
          <div style={{ maxWidth: 1200, margin: "0 auto" }}>
            {page === "dashboard" && <Dashboard orders={orders} products={products} />}
            {page === "products" && <ProductsPage products={products} categories={categories} addToast={addToast} />}
            {page === "orders" && <OrdersPage orders={orders} addToast={addToast} />}
            {page === "categories" && <CategoriesPage categories={categories} addToast={addToast} />}
            {page === "offers" && <OffersPage addToast={addToast} />}
            {page === "banners" && <BannersPage addToast={addToast} />}
            {page === "settings" && <SettingsPage addToast={addToast} />}
          </div>
        </div>
      </div>
    </>
  );
}
