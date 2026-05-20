import { Link, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import "./edit_profile.css";
import p_logo from "./assets/profile_logo.png";
import { api } from "./api";

function EditProfile() {
  const navigate = useNavigate();

  const [formData, setFormData]   = useState({ name: "", bio: "" });
  const [loading, setLoading]     = useState(true);   // initial fetch
  const [saving, setSaving]       = useState(false);  // save in-flight
  const [error, setError]         = useState("");
  const [success, setSuccess]     = useState("");

  // ── On mount: pre-populate fields with live profile data ──────────────────
  useEffect(() => {
    api.getProfile()
      .then((profile) => {
        setFormData({
          name: profile.name  ?? "",
          bio:  profile.bio   ?? "",
        });
      })
      .catch((err) => setError("Could not load profile: " + err.message))
      .finally(() => setLoading(false));
  }, []);

  const handleChange = (e) => {
    setError("");
    setSuccess("");
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  // ── Save: call API, then navigate back to /profile on success ─────────────
  const handleSave = async () => {
    if (!formData.name.trim()) {
      setError("Name cannot be empty.");
      return;
    }
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await api.updateProfile({ name: formData.name.trim(), bio: formData.bio });
      setSuccess("✅ Profile updated!");
      // Short delay so the user sees the success message, then navigate back
      setTimeout(() => navigate("/profile"), 900);
    } catch (err) {
      setError(err.message || "Update failed.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="app">
      <div className="nav">
        <Link to="/" className="link">
          <h1 className="title">ResHub</h1>
        </Link>
        <Link to="/profile" className="profile_logo">
          <img src={p_logo} alt="Profile" className="profile_logo" />
        </Link>
      </div>

      <div className="edit-container">
        <div className="edit-card">
          <h2>Edit Profile</h2>

          {/* Inline feedback */}
          {error   && <p style={{ color: "#c0392b", margin: "4px 0", fontSize: 13 }}>{error}</p>}
          {success && <p style={{ color: "#1a5c2e", margin: "4px 0", fontSize: 13 }}>{success}</p>}

          <div className="form-group">
            <label>Name</label>
            <input
              type="text"
              name="name"
              placeholder="Enter your name"
              value={formData.name}
              onChange={handleChange}
              disabled={loading || saving}
            />
          </div>

          {/* Email is display-only — backend does not support email updates */}
          <div className="form-group">
            <label>Bio</label>
            <textarea
              name="bio"
              placeholder="Write something about yourself..."
              value={formData.bio}
              onChange={handleChange}
              disabled={loading || saving}
            />
          </div>

          <button
            className="save-btn"
            onClick={handleSave}
            disabled={loading || saving}
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default EditProfile;
