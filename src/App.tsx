import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { API_BASE_URL } from "./config";

type CustomerDetails = {
  firstName: string;
  email: string;
  phone: string;
};

type Product = {
  id: number;
  name: string;
  description?: string | null;
  price: number;
  active: boolean;
};

type CartItem = Product & { quantity: number };
type CheckoutRequest = CustomerDetails & {
  items: Array<{ productId: number; quantity: number }>;
};
type CheckoutResponse = {
  actionUrl: string;
  fields: Record<string, string>;
};
type PaymentItem = {
  productId: number;
  name: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
};
type PaymentRecord = {
  orderId: string;
  receiptId: string;
  txnid: string;
  amount: number;
  productInfo: string;
  status: string;
  payuTransactionId: string | null;
  createdAt: string;
  items: PaymentItem[];
};
type ReconciliationResult = {
  message: string;
};
type ProductForm = {
  name: string;
  description: string;
  price: string;
  active: boolean;
};

const CURRENCY = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The request could not be completed.";
}

async function requestJson<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, options);
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (!response.ok) {
    const message = isRecord(body) ? body.detail ?? body.message : undefined;
    throw new Error(typeof message === "string" ? message : "The request could not be completed.");
  }
  return body as T;
}

function CheckoutForm({ cart }: { cart: CartItem[] }) {
  const [values, setValues] = useState<CustomerDetails>({ firstName: "", email: "", phone: "" });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const checkoutAttempt = useRef({ payload: "", key: "" });
  const total = cart.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const payload: CheckoutRequest = {
        items: cart.map((item) => ({ productId: item.id, quantity: item.quantity })),
        ...values,
      };
      const payloadFingerprint = JSON.stringify(payload);
      if (checkoutAttempt.current.payload !== payloadFingerprint) {
        checkoutAttempt.current = {
          payload: payloadFingerprint,
          key: crypto.randomUUID(),
        };
      }

      const body = await requestJson<CheckoutResponse>(`${API_BASE_URL}/api/payments/checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": checkoutAttempt.current.key,
        },
        body: JSON.stringify(payload),
      });

      const form = document.createElement("form");
      form.method = "POST";
      form.action = body.actionUrl;
      form.acceptCharset = "UTF-8";
      Object.entries(body.fields).forEach(([name, value]: [string, string]) => {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = name;
        input.value = value;
        form.appendChild(input);
      });
      document.body.appendChild(form);
      form.submit();
    } catch (requestError: unknown) {
      setError(errorMessage(requestError) || "Could not connect to the backend.");
      setSubmitting(false);
    }
  }

  return (
    <form className="checkout-form" onSubmit={submit}>
      <div className="cart-total">
        <span>Order total</span>
        <strong>{CURRENCY.format(total)}</strong>
      </div>
      <label>
        First name
        <input name="firstName" value={values.firstName}
          onChange={(event: ChangeEvent<HTMLInputElement>) =>
            setValues((current) => ({ ...current, firstName: event.target.value }))}
          autoComplete="given-name" maxLength="60" required />
      </label>
      <label>
        Email
        <input name="email" type="email" value={values.email}
          onChange={(event: ChangeEvent<HTMLInputElement>) =>
            setValues((current) => ({ ...current, email: event.target.value }))}
          autoComplete="email" maxLength="120" required />
      </label>
      <label>
        Phone
        <input name="phone" type="tel" value={values.phone}
          onChange={(event: ChangeEvent<HTMLInputElement>) =>
            setValues((current) => ({ ...current, phone: event.target.value }))}
          inputMode="numeric" pattern="[0-9]{10}" maxLength="10"
          placeholder="10-digit number" autoComplete="tel" required />
      </label>
      {error && <p className="error-message" role="alert">{error}</p>}
      <button className="primary-button" type="submit" disabled={submitting}>
        {submitting ? "Preparing secure checkout..." : "Continue to PayU"}
        {!submitting && <span aria-hidden="true">→</span>}
      </button>
      <p className="form-footnote">The server checks prices and calculates your total.</p>
    </form>
  );
}

function ShopPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    requestJson<Product[]>(`${API_BASE_URL}/api/products`)
      .then(setProducts)
      .catch((requestError: unknown) => setError(errorMessage(requestError)))
      .finally(() => setLoading(false));
  }, []);

  const cart = useMemo(
    (): CartItem[] => products
      .filter((product) => quantities[product.id] > 0)
      .map((product) => ({ ...product, quantity: quantities[product.id] })),
    [products, quantities],
  );

  function adjust(productId: number, delta: number) {
    setQuantities((current) => {
      const next = Math.max(0, Math.min(99, (current[productId] ?? 0) + delta));
      return { ...current, [productId]: next };
    });
  }

  return (
    <main>
      <section className="shop-heading">
        <div>
          <p className="eyebrow">PAYU HOSTED CHECKOUT · TEST MODE</p>
          <h1>Pick your demo items.</h1>
          <p className="intro-copy">Add an item to your cart. The backend looks up its current price before checkout.</p>
        </div>
        <div className="secure-note">
          <span className="lock-icon" aria-hidden="true">⌑</span>
          <span><strong>Prices confirmed on the server</strong><small>Demo only · no real charge</small></span>
        </div>
      </section>

      {error && <p className="error-message page-error" role="alert">{error}</p>}
      {loading ? <p className="empty-state">Loading products…</p> : (
        <div className="shop-layout">
          <section className="products-section">
            <div className="section-title">
              <h2>Demo shop</h2>
              <span>{products.length} {products.length === 1 ? "item" : "items"}</span>
            </div>
            {products.length === 0 ? (
              <div className="empty-state">No items yet. Add a few from the <a href="/admin">admin page</a>.</div>
            ) : (
              <div className="product-grid">
                {products.map((product) => (
                  <article className="product-card" key={product.id}>
                    <div className="product-illustration" aria-hidden="true">
                      <span>{product.name.slice(0, 1).toUpperCase()}</span>
                    </div>
                    <div className="product-copy">
                      <h3>{product.name}</h3>
                      <p>{product.description || "A demo product for the checkout flow."}</p>
                      <div className="product-action">
                        <strong>{CURRENCY.format(product.price)}</strong>
                        {quantities[product.id] ? (
                          <div className="quantity-control" aria-label={`Quantity for ${product.name}`}>
                            <button type="button" onClick={() => adjust(product.id, -1)} aria-label="Remove one">−</button>
                            <span>{quantities[product.id]}</span>
                            <button type="button" onClick={() => adjust(product.id, 1)} aria-label="Add one">+</button>
                          </div>
                        ) : (
                          <button className="add-button" type="button" onClick={() => adjust(product.id, 1)}>Add +</button>
                        )}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <aside className="cart-card">
            <div className="section-title">
              <h2>Your cart</h2>
              <span>{cart.reduce((sum, item) => sum + item.quantity, 0)} items</span>
            </div>
            {cart.length === 0 ? (
              <p className="empty-cart">Your cart is empty.<br />Add something to get started.</p>
            ) : (
              <>
                <ul className="cart-lines">
                  {cart.map((item) => (
                    <li key={item.id}>
                      <span>{item.name}<small>Qty {item.quantity} × {CURRENCY.format(item.price)}</small></span>
                      <strong>{CURRENCY.format(Number(item.price) * item.quantity)}</strong>
                    </li>
                  ))}
                </ul>
                <CheckoutForm cart={cart} />
              </>
            )}
          </aside>
        </div>
      )}
    </main>
  );
}

function AdminPage() {
  const [adminKey, setAdminKey] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [reconciling, setReconciling] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<ProductForm>({
    name: "",
    description: "",
    price: "",
    active: true,
  });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);

  async function loadProducts(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await requestJson<Product[]>(`${API_BASE_URL}/api/admin/products`, {
        headers: { "X-Admin-Key": adminKey },
      });
      setProducts(result);
      const savedPayments = await requestJson<PaymentRecord[]>(`${API_BASE_URL}/api/admin/payments`, {
        headers: { "X-Admin-Key": adminKey },
      });
      setPayments(savedPayments);
    } catch (requestError: unknown) {
      setError(errorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }

  function edit(product: Product) {
    setEditingId(product.id);
    setForm({
      name: product.name,
      description: product.description ?? "",
      price: String(product.price),
      active: product.active,
    });
    setNotice("");
  }

  function resetForm() {
    setEditingId(null);
    setForm({ name: "", description: "", price: "", active: true });
  }

  async function saveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    try {
      const url = editingId
        ? `${API_BASE_URL}/api/admin/products/${editingId}`
        : `${API_BASE_URL}/api/admin/products`;
      await requestJson<unknown>(url, {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json", "X-Admin-Key": adminKey },
        body: JSON.stringify({ ...form, price: Number(form.price) }),
      });
      resetForm();
      setNotice(editingId ? "Item updated." : "Item added.");
      await loadProducts();
    } catch (requestError: unknown) {
      setError(errorMessage(requestError));
    }
  }

  async function reconcilePayment(txnid: string) {
    setError("");
    setNotice("");
    setReconciling(txnid);
    try {
      const result = await requestJson<ReconciliationResult>(
        `${API_BASE_URL}/api/admin/payments/${encodeURIComponent(txnid)}/reconcile`,
        { method: "POST", headers: { "X-Admin-Key": adminKey } },
      );
      setNotice(result.message);
      const savedPayments = await requestJson<PaymentRecord[]>(`${API_BASE_URL}/api/admin/payments`, {
        headers: { "X-Admin-Key": adminKey },
      });
      setPayments(savedPayments);
    } catch (requestError: unknown) {
      setError(errorMessage(requestError));
    } finally {
      setReconciling("");
    }
  }

  return (
    <main className="admin-page">
      <section className="shop-heading">
        <div>
          <p className="eyebrow">LOCAL DEMO · CATALOGUE MANAGEMENT</p>
          <h1>Manage shop items.</h1>
          <p className="intro-copy">Add products and set prices. The backend uses these saved prices at checkout.</p>
        </div>
        <a className="secondary-button header-link" href="/">View shop</a>
      </section>

      <form className="admin-key-form" onSubmit={loadProducts}>
        <label>
          Local admin key
          <input type="password" value={adminKey} onChange={(event) => setAdminKey(event.target.value)}
            autoComplete="off" required />
        </label>
        <button className="secondary-button" type="submit" disabled={loading}>
          {loading ? "Loading…" : "Load catalogue"}
        </button>
        <small>Enter the DEMO_ADMIN_KEY configured on the backend. It is not saved by this page.</small>
      </form>

      {error && <p className="error-message page-error" role="alert">{error}</p>}
      {notice && <p className="success-message" role="status">{notice}</p>}

      <div className="admin-layout">
        <section className="admin-panel">
          <div className="section-title"><h2>{editingId ? "Edit item" : "Add an item"}</h2></div>
          <form className="checkout-form" onSubmit={saveProduct}>
            <label>Item name<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })}
              maxLength="100" required /></label>
            <label>Description<textarea value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
              rows="3" maxLength="500" /></label>
            <label>Price (INR)<input type="number" value={form.price}
              onChange={(event) => setForm({ ...form, price: event.target.value })}
              min="0.01" max="99999999.99" step="0.01" required /></label>
            {editingId && (
              <label className="checkbox-label">
                <input type="checkbox" checked={form.active}
                  onChange={(event) => setForm({ ...form, active: event.target.checked })} />
                Available in shop
              </label>
            )}
            <button className="primary-button" type="submit">{editingId ? "Save changes" : "Add item"}</button>
            {editingId && <button className="text-button" type="button" onClick={resetForm}>Cancel editing</button>}
          </form>
        </section>

        <section className="admin-panel">
          <div className="section-title"><h2>Catalogue</h2><span>{products.length} items</span></div>
          {products.length === 0 ? <p className="empty-cart">Load the catalogue to see saved items.</p> : (
            <ul className="admin-product-list">
              {products.map((product) => (
                <li key={product.id}>
                  <span><strong>{product.name}</strong>
                    <small>{CURRENCY.format(product.price)} · {product.active ? "Available" : "Hidden"}</small></span>
                  <button className="text-button" type="button" onClick={() => edit(product)}>Edit</button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="admin-panel orders-panel">
          <div className="section-title"><h2>Orders & payments</h2><span>{payments.length} orders</span></div>
          {payments.length === 0 ? <p className="empty-cart">Orders will appear here after a checkout starts.</p> : (
            <ul className="admin-product-list">
              {payments.map((payment) => (
                <li className="order-list-item" key={payment.txnid}>
                  <span>
                    <strong>{payment.orderId} · {CURRENCY.format(payment.amount)}</strong>
                    <small>{payment.status} · PayU ID: {payment.payuTransactionId || "Not received"} · {payment.txnid}</small>
                  </span>
                  {payment.status === "PENDING" && (
                    <button className="text-button" type="button" disabled={Boolean(reconciling)}
                      onClick={() => reconcilePayment(payment.txnid)}>
                      {reconciling === payment.txnid ? "Checking…" : "Reconcile"}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}

function PaymentResult({ txnid }: { txnid: string | null }) {
  const [payment, setPayment] = useState<PaymentRecord | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!txnid) {
      setError("No transaction ID was provided.");
      return undefined;
    }

    let active = true;
    requestJson<PaymentRecord>(`${API_BASE_URL}/api/payments/${encodeURIComponent(txnid)}`)
      .then((result) => { if (active) setPayment(result); })
      .catch((requestError: unknown) => { if (active) setError(errorMessage(requestError)); });
    return () => { active = false; };
  }, [txnid]);

  const successful = payment?.status === "SUCCESS";

  return (
    <section className="result-card" aria-live="polite">
      <div className={`result-mark ${successful ? "success" : payment ? "failure" : ""}`}>
        {payment ? (successful ? "✓" : "!") : "…"}
      </div>
      <p className="eyebrow">PAYMENT RESULT</p>
      <h1>{error ? "Status unavailable" : !payment ? "Checking your payment..." : successful ? "Payment successful" : "Payment not completed"}</h1>
      <p className="result-copy">
        {error || (!payment
          ? "We’re checking the verified result with the server."
          : successful
            ? "PayU confirmed the transaction and the result is saved."
            : "The transaction was not completed. You can try another test payment.")}
      </p>
      {payment && (
        <dl className="payment-details">
          <div><dt>Amount</dt><dd>{CURRENCY.format(payment.amount)}</dd></div>
          <div><dt>Order ID</dt><dd>{payment.orderId}</dd></div>
          <div><dt>Receipt ID</dt><dd>{payment.receiptId}</dd></div>
          <div><dt>Merchant transaction ID</dt><dd>{payment.txnid}</dd></div>
          <div><dt>PayU transaction ID</dt><dd>{payment.payuTransactionId || "Pending"}</dd></div>
          <div><dt>Status</dt><dd>{payment.status}</dd></div>
          {payment.items.map((item) => (
            <div key={item.productId}><dt>{item.name} × {item.quantity}</dt><dd>{CURRENCY.format(item.lineTotal)}</dd></div>
          ))}
        </dl>
      )}
      <a className="secondary-button" href="/">Back to shop</a>
    </section>
  );
}

export default function App() {
  const txnid = new URLSearchParams(window.location.search).get("txnid");
  const isAdmin = window.location.pathname === "/admin";
  const isResult = window.location.pathname === "/payment-result" || Boolean(txnid);

  return (
    <div className="page-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="PayU demo shop">
          <span className="brand-mark">P</span>
          <span>checkout<span className="brand-dot">.</span>lab</span>
        </a>
        <nav className="top-nav">
          <a className={!isAdmin ? "active" : ""} href="/">Shop</a>
          <a className={isAdmin ? "active" : ""} href="/admin">Admin</a>
          <span className="environment-tag"><span /> TEST MODE</span>
        </nav>
      </header>
      {isResult ? (
        <div className="result-page"><PaymentResult txnid={txnid} /></div>
      ) : isAdmin ? <AdminPage /> : <ShopPage />}
      <footer className="page-footer">
        <span>Local demo · PayU India test mode</span>
        <span>Never use production credentials here</span>
      </footer>
    </div>
  );
}
