import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, saveAuth } from "./api";
import "./auth.css";

function Auth() {
  const [mode, setMode] = useState("login"); // "login" | "register"
  const [form, setForm] = useState({ username: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handle = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const submit = async () => {
    setError("");
    setLoading(true);
    try {
      if (mode === "register") {
        await api.register(form.username, form.email, form.password);
        setMode("login");
        setError("Registered! Please log in.");
      } else {
        const data = await api.login(form.email, form.password);
        saveAuth(data.access_token, data.username, data.user_id);
        navigate("/");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1 className="auth-title">TaskNest</h1>
        <p className="auth-sub">{mode === "login" ? "Welcome back!" : "Create your account"}</p>

        {mode === "register" && (
          <input
            className="auth-input"
            name="username"
            placeholder="Username"
            value={form.username}
            onChange={handle}
          />
        )}
        <input
          className="auth-input"
          name="email"
          type="email"
          placeholder="Email"
          value={form.email}
          onChange={handle}
        />
        <input
          className="auth-input"
          name="password"
          type="password"
          placeholder="Password"
          value={form.password}
          onChange={handle}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />

        {error && <p className="auth-error">{error}</p>}

        <button className="auth-btn" onClick={submit} disabled={loading}>
          {loading ? "Please wait..." : mode === "login" ? "Log In" : "Register"}
        </button>

        <p className="auth-toggle">
          {mode === "login" ? "Don't have an account? " : "Already have an account? "}
          <span onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}>
            {mode === "login" ? "Register" : "Log in"}
          </span>
        </p>
      </div>
    </div>
  );
}

export default Auth;
