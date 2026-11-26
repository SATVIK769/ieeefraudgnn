import { useEffect, useMemo, useRef, useState } from "react";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000/api";
// Edit these names to match your dataset's meaning for each product code.
const EMAIL_DOMAINS = ["gmail.com", "yahoo.com", "hotmail.com", "outlook.com"];

const PRODUCT_NAMES = {
  W: "Normal purchase",
  H: "Hotel & travel",
  R: "Retail",
  S: "Services",
  C: "Card-not-present",
};
const productLabel = (code) =>
  code ? `${code} – ${PRODUCT_NAMES[code] || "Other"}` : "—";

const EMPTY = {
  amount: "",
  product: "W",
  cardNumber: "", // 16 digits, stored without spaces
  card4: "visa",
  card6: "debit",
  email: "gmail.com",
  device: "desktop",
  time: "12:00:00", // hh:mm:ss
};

const money = (value) =>
  Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const formatCard = (digits) =>
  String(digits || "")
    .replace(/\D/g, "")
    .slice(0, 16)
    .replace(/(.{4})(?=.)/g, "$1 ");
const maskCard = (digits) => {
  const d = String(digits || "")
    .replace(/\D/g, "")
    .slice(0, 16);
  if (!d) return "—";
  // Digits 1-12 shown as X, digits 13-16 shown as typed.
  return [...d]
    .map((ch, i) => (i < 12 ? "X" : ch))
    .join("")
    .replace(/(.{4})(?=.)/g, "$1 ");
};

const normTime = (t) => {
  if (!t) return "";
  return /^\d{2}:\d{2}$/.test(t) ? `${t}:00` : t;
};

// Accepts fields coming from the backend (card1 / hour) or from this form.
const normalizeFields = (f = {}) => {
  const out = { ...EMPTY, ...f };
  if (!out.cardNumber && f.card1 !== undefined && f.card1 !== "")
    out.cardNumber = String(f.card1)
      .replace(/\D/g, "")
      .padStart(16, "0")
      .slice(-16);
  if (!f.time && f.hour !== undefined && f.hour !== "")
    out.time = `${String(f.hour).padStart(2, "0")}:00:00`;
  delete out.hour;
  delete out.card1;
  delete out.addr1;
  return out;
};

const pct = (value) => `${(Number(value || 0) * 100).toFixed(1)}%`;

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "");

// Every field the person enters, in display order.
const SUMMARY_FIELDS = [
  ["Amount", (f) => (f.amount === "" ? "—" : money(f.amount))],
  ["Type of Payment", (f) => productLabel(f.product)],
  ["Card Number", (f) => maskCard(f.cardNumber)],
  ["Card Network", (f) => cap(f.card4) || "Unknown"],
  ["Card Type", (f) => cap(f.card6) || "Unknown"],
  ["Email Domain", (f) => f.email || "Not given"],
  ["Device Type", (f) => cap(f.device) || "Unknown"],
  ["Time", (f) => normTime(f.time) || "—"],
];

const riskTone = (risk) =>
  risk === "High" ? "bad" : risk === "Medium" ? "warn" : risk === "Low"  ?"good" : "mute";

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');

html, body, #root { margin: 0; padding: 0; width: 100%; max-width: none; text-align: left; }
body { background: #f4f6f9; }

.fc {
  width: 100%;
  --ink: #12202e;
  --ink-soft: #5b6b7b;
  --line: #dde3ea;
  --paper: #f4f6f9;
  --card: #ffffff;
  --brand: #0e5a6e;
  --brand-dark: #0a4352;
  --good: #15803d;   --good-bg: #e3f5e9;
  --warn: #b45309;   --warn-bg: #fdf0d9;
  --bad:  #c62828;   --bad-bg:  #fde4e4;
  font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
  color: var(--ink);
  background: var(--paper);
  min-height: 100vh;
  line-height: 1.5;
}
.fc *, .fc *::before, .fc *::after { box-sizing: border-box; }
.fc .fc-top h1 { color: #fff; }
.fc .fc-card { color: var(--ink); }
.fc .fc-card h2 { color: var(--ink); }
.fc .fc-field label { color: var(--ink); }
.fc .fc-stat b { color: var(--ink); }
.fc .fc-kv b { color: var(--ink); }
.fc .fc-kv .empty b { color: #98a5b3; }
.fc td { color: var(--ink); }

.fc-top {
  background: var(--brand-dark);
  color: #fff;
  padding: 26px 0 74px;
}
.fc-wrap { width: 100%; max-width:1280px; margin: 0 auto; padding: 0 24px; }
.fc-top h1 { margin: 0; font-size: 28px; font-weight: 800; letter-spacing: -0.02em; }
.fc-top p { margin: 4px 0 0; color: #b9d4dc; font-size: 14px; }

.fc-body { width: 100%; max-width:1280px; margin: -52px auto 0; padding: 0 24px 40px; }

.fc-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 14px; margin-bottom: 20px; }
.fc-stat { background: var(--card); border-radius: 12px; padding: 16px 18px; box-shadow: 0 1px 2px rgba(18,32,46,.08); border-left: 4px solid var(--brand); }
.fc-stat.alert { border-left-color: var(--bad); }
.fc-stat small { color: var(--ink-soft); font-size: 13px; }
.fc-stat b { display: block; font-size: 26px; font-weight: 800; letter-spacing: -0.02em; }

.fc-grid { display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr); gap: 20px; align-items: start; }
@media (max-width: 900px) { .fc-grid { grid-template-columns: minmax(0, 1fr); } }

.fc-card { background: var(--card); border-radius: 14px; padding: 22px; box-shadow: 0 1px 2px rgba(18,32,46,.08); }
.fc-card + .fc-card { margin-top: 20px; }
.fc-card h2 { margin: 0; font-size: 18px; font-weight: 700; }
.fc-sub { color: var(--ink-soft); font-size: 13px; margin: 3px 0 0; }

.fc-section { margin-top: 22px; }
.fc-section h3 { margin: 0 0 10px; font-size: 14px; font-weight: 700; color: var(--brand); padding-bottom: 6px; border-bottom: 1px solid var(--line); }
.fc-fields { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 200px), 1fr)); gap: 14px; }

.fc-field label { display: block; font-size: 13px; font-weight: 600; margin-bottom: 5px; }
.fc-field .opt { font-weight: 400; color: var(--ink-soft); }
.fc-field small { display: block; color: var(--ink-soft); font-size: 12px; margin-top: 4px; }
.fc input, .fc select {
  width: 100%; padding: 10px 12px; font: inherit; font-size: 14px; color: var(--ink);
  background: #fff; border: 1.5px solid var(--line); border-radius: 8px;
}
.fc input:hover, .fc select:hover { border-color: #b7c2cd; }
.fc input:focus-visible, .fc select:focus-visible, .fc button:focus-visible {
  outline: 3px solid rgba(14,90,110,.35); outline-offset: 1px; border-color: var(--brand);
}

.fc-chips { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px; }
.fc-chip { padding: 5px 12px; font: inherit; font-size: 13px; font-weight: 600; color: var(--brand); background: #e6f1f4; border: 0; border-radius: 999px; cursor: pointer; }
.fc-chip:hover { background: #d3e7ec; }

.fc-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 24px; padding-top: 18px; border-top: 1px solid var(--line); }
.fc-btn { padding: 11px 18px; font: inherit; font-size: 14px; font-weight: 600; border-radius: 8px; border: 1.5px solid var(--line); background: #fff; color: var(--ink); cursor: pointer; }
.fc-btn:hover:not(:disabled) { background: var(--paper); }
.fc-btn.primary { background: var(--brand); border-color: var(--brand); color: #fff; }
.fc-btn.primary:hover:not(:disabled) { background: var(--brand-dark); }
.fc-btn:disabled { opacity: .6; cursor: not-allowed; }
.fc-btn.ghost { border-color: transparent; color: var(--ink-soft); }

.fc-error { background: var(--bad-bg); color: #8e1b1b; border-radius: 10px; padding: 12px 16px; margin-bottom: 16px; font-size: 14px; border-left: 4px solid var(--bad); }

/* Result */
.fc-verdict { margin-top: 16px; border-radius: 12px; padding: 18px; display: flex; gap: 18px; align-items: center; flex-wrap: wrap; }
.fc-verdict.good { background: var(--good-bg); }
.fc-verdict.bad { background: var(--bad-bg); }
.fc-verdict h4 { margin: 0; font-size: 20px; font-weight: 800; }
.fc-verdict.good h4 { color: var(--good); }
.fc-verdict.bad h4 { color: var(--bad); }
.fc-verdict p { margin: 2px 0 0; font-size: 14px; }
.fc-gauge { flex: none; width: 130px; }
.fc-gauge text { font-family: inherit; }

.fc-pill { display: inline-block; padding: 3px 10px; border-radius: 999px; font-size: 12px; font-weight: 700; white-space: nowrap; }
.fc-pill.good { background: var(--good-bg); color: var(--good); }
.fc-pill.warn { background: var(--warn-bg); color: var(--warn); }
.fc-pill.bad  { background: var(--bad-bg);  color: var(--bad); }
.fc-pill.mute { background: #e8edf2; color: var(--ink-soft); }

.fc-kv { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; margin-top: 14px; }
.fc-kv div { background: var(--paper); border-radius: 10px; padding: 10px 12px; min-width: 0; }
.fc-kv small { display: block; color: var(--ink-soft); font-size: 12px; }
.fc-kv b { display: block; font-size: 15px; font-weight: 700; overflow-wrap: anywhere; }
.fc-kv .empty b { color: #98a5b3; font-weight: 500; }

.fc-note { margin: 12px 0 0; font-size: 13px; color: var(--warn); background: var(--warn-bg); padding: 10px 12px; border-radius: 8px; }
.fc-empty { margin: 16px 0 0; padding: 26px 18px; text-align: center; color: var(--ink-soft); font-size: 14px; border: 1.5px dashed var(--line); border-radius: 12px; }

.fc-head-row { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; }

/* Tables */
.fc-scroll { overflow-x: auto; margin-top: 10px; }
.fc table { width: 100%; border-collapse: collapse; min-width: 560px; }
.fc th { text-align: left; padding: 10px 12px; font-size: 13px; font-weight: 700; color: var(--ink-soft); background: var(--paper); }
.fc th:first-child { border-radius: 8px 0 0 8px; } .fc th:last-child { border-radius: 0 8px 8px 0; }
.fc td { padding: 11px 12px; font-size: 14px; border-bottom: 1px solid var(--line); }
.fc tr.click { cursor: pointer; }
.fc tr.click:hover td { background: #f0f6f8; }
.fc tr.sel td { background: #e6f1f4; }

.fc-tabs { display: flex; gap: 6px; flex-wrap: wrap; }
.fc-tab { padding: 8px 16px; font: inherit; font-size: 14px; font-weight: 600; border: 0; border-radius: 8px; background: transparent; color: var(--ink-soft); cursor: pointer; }
.fc-tab.on { background: var(--brand); color: #fff; }
.fc-tab:not(.on):hover { background: var(--paper); }
.fc-hint { font-size: 12px; color: var(--ink-soft); margin: 10px 0 0; }
`;

function Gauge({ value, tone }) {
  const p = Math.max(0, Math.min(1, Number(value || 0)));
  const r = 52;
  const arc = Math.PI * r;
  const color = tone === "bad" ? "#c62828" : "#15803d";
  return (
    <svg
      className="fc-gauge"
      viewBox="0 0 130 80"
      role="img"
      aria-label={`Fraud probability ${pct(p)}`}
    >
      <path
        d="M13 70 A52 52 0 0 1 117 70"
        fill="none"
        stroke="#ffffff"
        strokeWidth="12"
        strokeLinecap="round"
      />
      <path
        d="M13 70 A52 52 0 0 1 117 70"
        fill="none"
        stroke={color}
        strokeWidth="12"
        strokeLinecap="round"
        strokeDasharray={`${arc * p} ${arc}`}
      />
      <text
        x="65"
        y="62"
        textAnchor="middle"
        fontSize="20"
        fontWeight="800"
        fill="#12202e"
      >
        {pct(p)}
      </text>
    </svg>
  );
}

function Field({ label, optional, hint, children }) {
  return (
    <div className="fc-field">
      <label>
        {label} {optional && <span className="opt">(optional)</span>}
        <div style={{ marginTop: 5, fontWeight: 400 }}>{children}</div>
      </label>
      {hint && <small>{hint}</small>}
    </div>
  );
}

function ValueGrid({ fields }) {
  return (
    <div className="fc-kv">
      {SUMMARY_FIELDS.map(([label, fmt]) => {
        const text = fmt(fields);
        const empty =
          text === "—" || text === "Not given" || text === "Unknown";
        return (
          <div key={label} className={empty ? "empty" : ""}>
            <small>{label}</small>
            <b>{text}</b>
          </div>
        );
      })}
    </div>
  );
}

function StatusPill({ status }) {
  const flagged = status === "FLAGGED";
  return (
    <span className={`fc-pill ${flagged ? "bad" : "good"}`}>
      {flagged ? "Fraud alert" : "Normal"}
    </span>
  );
}

function App() {
  const [form, setForm] = useState({ ...EMPTY });
  const [result, setResult] = useState(null);
  const [live, setLive] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [stats, setStats] = useState(null);
  const [tab, setTab] = useState("live");
  const [counter, setCounter] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [statsLoading, setStatsLoading] = useState(true);
  const [otherEmail, setOtherEmail] = useState(false);
  const errorRef = useRef(null);
  const resultRef = useRef(null);

  useEffect(() => {
    if (error)
      errorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [error]);

  useEffect(() => {
    if (result && window.innerWidth <= 900)
      resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [result?.id]);

  const call = async (url, options = {}) => {
    const response = await fetch(url, options);
    let data;
    try {
      data = await response.json();
    } catch {
      throw new Error(
        "The server returned an invalid response. Check the backend.",
      );
    }
    if (!response.ok) {
      const detail = data?.detail;
      throw new Error(
        Array.isArray(detail)
          ? "Please check the transaction form values."
          : detail || response.statusText || "Request failed.",
      );
    }
    return data;
  };

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [statsData, alertData] = await Promise.all([
          call(`${API}/stats`),
          call(`${API}/alerts`).catch(() => []),
        ]);
        if (active) {
          setStats(statsData);
          setAlerts(Array.isArray(alertData) ? alertData : []);
          setError("");
        }
      } catch (err) {
        if (active)
          setError(
            `${err.message} Make sure the FastAPI backend is running at ${API}.`,
          );
      } finally {
        if (active) setStatsLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const updateField = (key) => (event) => {
    let value = event.target.value;
    if (key === "cardNumber") value = value.replace(/\D/g, "").slice(0, 16);
    if (key === "time") value = normTime(value);
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const resetForm = () => {
    setForm({ ...EMPTY });
    setResult(null);
    setError("");
  };

  const loadExample = async (kind) => {
    setError("");
    setLoading(true);
    try {
      const example = await call(`${API}/example?kind=${kind}`);
      if (!example?.fields)
        throw new Error(
          "The example endpoint did not return transaction fields.",
        );
      setForm(normalizeFields(example.fields));
      setResult(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const runCheck = async (values = form) => {
    setError("");
    const amount = Number(values.amount);
    const digits = String(values.cardNumber || "");
    const time = normTime(values.time);

    if (values.amount === "" || !Number.isFinite(amount) || amount <= 0) {
      setError("Enter a transaction amount greater than 0.");
      return;
    }
    if (!/^\d{16}$/.test(digits)) {
      setError("Card number must be exactly 16 digits.");
      return;
    }
    const tm = /^(\d{2}):(\d{2}):(\d{2})$/.exec(time);
    if (!tm || +tm[1] > 23 || +tm[2] > 59 || +tm[3] > 59) {
      setError("Enter the time as hh:mm:ss (24-hour).");
      return;
    }

    setLoading(true);
    try {
      // Backend still receives card1 and hour. Leading zeros drop out of the
      // number, so a card like 0000000000012345 maps to card1 = 12345.
      const asNumber = Number(digits);
      const body = {
        amount,
        product: values.product,
        card1: Number.isSafeInteger(asNumber) ? asNumber : digits,
        card4: values.card4,
        card6: values.card6,
        addr1: "",
        email: values.email,
        device: values.device,
        hour: Number(tm[1]),
      };

      const prediction = await call(`${API}/check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const entry = {
        ...prediction,
        id: `TXN-${String(counter).padStart(4, "0")}`,
        amount: body.amount,
        cardNumber: digits,
        // Keep the exact values that were submitted, so they stay visible.
        fields: {
          amount,
          product: values.product,
          cardNumber: digits,
          card4: values.card4,
          card6: values.card6,
          email: values.email,
          device: values.device,
          time,
        },
        history: Array.isArray(prediction.history) ? prediction.history : [],
      };

      setResult(entry);
      setLive((prev) => [entry, ...prev].slice(0, 15));
      setCounter((prev) => prev + 1);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const pickAlert = (transaction) => {
    const nextForm = normalizeFields(transaction.fields || transaction);
    setForm(nextForm);
    setTab("live");
    runCheck(nextForm);
  };

  // Click a past live check to bring its values and result back.
  const reopen = (entry) => {
    setForm(normalizeFields(entry.fields));
    setResult(entry);
    setError("");
  };

  const showOtherEmail =
    otherEmail || (form.email !== "" && !EMAIL_DOMAINS.includes(form.email));
  const isFlagged = result?.status === "FLAGGED";
  const tone = isFlagged ? "bad" : "good";

  // Has the form changed since the result on screen was produced?
  const edited = useMemo(() => {
    if (!result?.fields) return false;
    return Object.keys(EMPTY).some(
      (k) => String(result.fields[k] ?? "") !== String(form[k] ?? ""),
    );
  }, [result, form]);

  const rows = tab === "live" ? live : alerts;

  return (
    <div className="fc">
      <style>{CSS}</style>

      <div className="fc-top">
        <div className="fc-wrap" style={{ textAlign: "center" }}>
          <h1>Live Credit Card Fraud Check</h1>
          <p>
            IEEE-CIS transaction analysis powered by{" "}
            {stats?.model || "GraphSAGE"}
          </p>
        </div>
      </div>

      <div className="fc-body">
        {error && (
          <div className="fc-error" role="alert" ref={errorRef}>
            {error}
          </div>
        )}

        {/*{statsLoading && (
          <p style={{ color: "#fff" }}>Loading dashboard statistics...</p>
        )}*/}

        {/*{stats && (
          <div className="fc-stats">
            <div className="fc-stat">
              <small>Test transactions</small>
              <b>{Number(stats.test_transactions || 0).toLocaleString()}</b>
            </div>
            <div className="fc-stat alert">
              <small>Fraud alerts</small>
              <b>{Number(stats.flagged || 0).toLocaleString()}</b>
            </div>
            <div className="fc-stat alert">
              <small>Amount under alert</small>
              <b>{money(stats.flagged_amount)}</b>
            </div>
          </div>
        )}*/}

        <div className="fc-grid">
          {/* ---------- FORM ---------- */}
          <section className="fc-card">
            <h2>Transaction details</h2>
            <p className="fc-sub">
              Fill in the fields below.
              {/* Optional fields can stay blank. Everything you
              enter is mirrored in the “Entered values” panel.*/}
            </p>

            <div className="fc-section">
              <h3>Payment</h3>
              <div className="fc-fields">
                <Field label="Amount" hint="Enter an amount.">
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={form.amount ?? ""}
                    onChange={updateField("amount")}
                    placeholder="e.g. 125.50"
                  />
                </Field>

                <Field
                  label="Type of Payment"
                  hint={`Selected: ${productLabel(form.product)}`}
                >
                  <select
                    value={form.product ?? "W"}
                    onChange={updateField("product")}
                  >
                    {Object.keys(PRODUCT_NAMES).map((p) => (
                      <option key={p} value={p}>
                        {productLabel(p)}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Time" hint="24-hour format">
                  <input
                    type="time"
                    step="1"
                    value={normTime(form.time)}
                    onChange={updateField("time")}
                  />
                </Field>
              </div>
            </div>

            <div className="fc-section">
              <h3>Card Details</h3>
              <div className="fc-fields">
                <Field
                  label="Card Number"
                  hint={`${String(form.cardNumber || "").length}/16 digits entered`}
                >
                  <input
                    inputMode="numeric"
                    autoComplete="off"
                    maxLength={19}
                    value={formatCard(form.cardNumber)}
                    onChange={updateField("cardNumber")}
                    placeholder="0000 0000 0000 0000"
                  />
                </Field>

                <Field label="Card Network">
                  <select
                    value={form.card4 ?? ""}
                    onChange={updateField("card4")}
                  >
                    {[
                      "visa",
                      "mastercard",
                      "american express",
                      "discover",
                      "",
                    ].map((n) => (
                      <option key={n || "unknown"} value={n}>
                        {cap(n) || "Unknown"}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Card Type">
                  <select
                    value={form.card6 ?? ""}
                    onChange={updateField("card6")}
                  >
                    {["debit", "credit", ""].map((t) => (
                      <option key={t || "unknown"} value={t}>
                        {cap(t) || "Unknown"}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            </div>

            <div className="fc-section">
              <h3>Customer Context</h3>
              <div className="fc-fields">
                <Field label="Email Domain">
                  <select
                    value={showOtherEmail ? "__other__" : (form.email ?? "")}
                    onChange={(e) => {
                      if (e.target.value === "__other__") {
                        setOtherEmail(true);
                        setForm((p) => ({ ...p, email: "" }));
                      } else {
                        setOtherEmail(false);
                        setForm((p) => ({ ...p, email: e.target.value }));
                      }
                    }}
                  >
                    <option value="">Unknown</option>
                    {EMAIL_DOMAINS.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                    <option value="__other__">Other (type it in)</option>
                  </select>
                  {showOtherEmail && (
                    <input
                      style={{ marginTop: 8 }}
                      value={form.email ?? ""}
                      onChange={updateField("email")}
                      placeholder="e.g. company.com"
                    />
                  )}
                </Field>

                <Field label="Device Type">
                  <select
                    value={form.device ?? ""}
                    onChange={updateField("device")}
                  >
                    {["desktop", "mobile", ""].map((d) => (
                      <option key={d || "Unknown"} value={d}>
                        {cap(d) || "Unknown"}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            </div>

            <div className="fc-actions">
              <button
                className="fc-btn primary"
                disabled={loading}
                onClick={() => runCheck(form)}
              >
                {loading ? "Checking..." : "Check transaction"}
              </button>
              <button
                className="fc-btn"
                disabled={loading}
                onClick={() => loadExample("fraud")}
              >
                Load random example
              </button>
              <button
                className="fc-btn"
                disabled={loading}
                onClick={() => loadExample("normal")}
              >
                Load normal example
              </button>
              <button
                className="fc-btn ghost"
                type="button"
                onClick={resetForm}
              >
                Reset fields
              </button>
            </div>
          </section>

          {/* ---------- RIGHT COLUMN ---------- */}
          <div>
            <section className="fc-card" ref={resultRef}>
              <div className="fc-head-row">
                <h2>Prediction Result</h2>
                {result &&
                  (edited ? (
                    <span className="fc-pill warn">
                      Form edited since this check
                    </span>
                  ) : (
                    <span className="fc-pill mute">Matches form</span>
                  ))}
              </div>

              {!result ? (
                <div className="fc-empty">
                  Enter transaction details or load an example, then select{" "}
                  <b>Check transaction</b>.
                </div>
              ) : (
                <>
                  <div className={`fc-verdict ${tone}`}>
                    <Gauge value={result.probability} tone={tone} />
                    <div>
                      <h4>
                        {isFlagged ? "Possible fraud detected" : "Looks normal"}
                      </h4>
                      <p>
                        Fraud probability: <b>{pct(result.probability)}</b>
                      </p>
                      <p style={{ marginTop: 6 }}>
                        <span className={`fc-pill ${riskTone(result.risk)}`}>
                          {result.risk || "Unknown"} risk
                        </span>
                      </p>
                    </div>
                  </div>

                  <div className="fc-kv">
                    <div>
                      <small>Transaction ID</small>
                      <b>{result.id || "—"}</b>
                    </div>
                    <div>
                      <small>Card Number</small>
                      <b>{maskCard(result.cardNumber)}</b>
                    </div>
                    <div>
                      <small>Type of Payment</small>
                      <b>{productLabel(result.fields?.product)}</b>
                    </div>
                    <div>
                      <small>Earlier transactions on this card</small>
                      <b>{result.card_history_count ?? 0}</b>
                    </div>
                  </div>

                  {result.note && <p className="fc-note">{result.note}</p>}

                  {result.history.length > 0 && (
                    <>
                      <h3
                        style={{
                          margin: "20px 0 0",
                          fontSize: 14,
                          fontWeight: 700,
                        }}
                      >
                        Previous transactions on this card
                      </h3>
                      <div className="fc-scroll">
                        <table style={{ minWidth: 0 }}>
                          <thead>
                            <tr>
                              <th>ID</th>
                              <th>Amount</th>
                              <th>Fraud probability</th>
                            </tr>
                          </thead>
                          <tbody>
                            {result.history.map((item, i) => (
                              <tr key={item.id ?? i}>
                                <td>{item.id ?? "—"}</td>
                                <td>{money(item.amount)}</td>
                                <td>{pct(item.probability)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </>
              )}
            </section>

            <section className="fc-card">
              <div className="fc-head-row">
                <h2>Entered Values</h2>
                {result &&
                  (edited ? (
                    <span className="fc-pill warn">
                      Edited since last check
                    </span>
                  ) : (
                    <span className="fc-pill mute">Matches result above</span>
                  ))}
              </div>
              <p className="fc-sub">Updates as you type.</p>
              <ValueGrid fields={form} />
            </section>
          </div>
        </div>

        {/* ---------- TABLE ---------- */}
        <section className="fc-card" style={{ marginTop: 20 }}>
          <div className="fc-tabs">
            {[
              ["live", `Live checks (${live.length})`],
              ["alerts", "Fraud alerts (test data)"],
            ].map(([key, label]) => (
              <button
                key={key}
                className={`fc-tab ${tab === key ? "on" : ""}`}
                onClick={() => setTab(key)}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="fc-scroll">
            <table>
              <thead>
                <tr>
                  <th>Transaction</th>
                  <th>Amount</th>
                  {tab === "live" && <th>Card Number</th>}
                  {tab === "live" && <th>Entered Values</th>}
                  <th>Fraud Probability</th>
                  <th>Status of Transaction</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td
                      colSpan={tab === "live" ? 6 : 4}
                      style={{ color: "#5b6b7b" }}
                    >
                      {tab === "live"
                        ? "No live checks yet. Run a check and it will appear here."
                        : "No fraud alerts were returned by the backend."}
                    </td>
                  </tr>
                )}

                {rows.map((t, i) => {
                  const f = t.fields;
                  return (
                    <tr
                      key={t.id ?? i}
                      className={`click ${tab === "live" && result?.id === t.id ? "sel" : ""}`}
                      onClick={() =>
                        tab === "alerts" ? pickAlert(t) : reopen(t)
                      }
                    >
                      <td>
                        {tab === "alerts" ? `Dataset #${t.id ?? i}` : t.id}
                      </td>
                      <td>{money(t.amount)}</td>
                      {tab === "live" && <td>{maskCard(t.cardNumber)}</td>}
                      {tab === "live" && (
                        <td style={{ color: "#5b6b7b", fontSize: 13 }}>
                          {f
                            ? `${productLabel(f.product)} · ${cap(f.card4) || "Unknown"} ${
                                f.card6 || ""
                              } · ${f.email || "no email"} · ${cap(f.device) || "Unknown"} · ${f.time}`
                            : "—"}
                        </td>
                      )}
                      <td>{pct(t.probability)}</td>
                      <td>
                        <StatusPill status={t.status} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="fc-hint">
            {tab === "alerts"
              ? "Select an alert row to load its details and run a live check."
              : "Select a row to bring its entered values and result back."}
          </p>
        </section>
      </div>
    </div>
  );
}

export default App;
