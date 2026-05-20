import { Link, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import "./profile.css";
import "./loading.css";
import p_logo from "./assets/profile_logo.png";
import { clearAuth, api } from "./api";

/* ── Skeleton for profile page ──────────────────────────────────────────── */
function ProfileSkeleton() {
  return (
    <div className="app">
      <div className="nav">
        <Link to="/" className="link"><h1 className="title">ResHub</h1></Link>
      </div>
      <div className="profile-wrapper">
        {/* Header skeleton */}
        <div className="profile-header" style={{ gap: 20 }}>
          <div className="skeleton" style={{ width: 80, height: 80, borderRadius: "50%" }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
            <div className="skeleton" style={{ width: 160, height: 20, borderRadius: 6 }} />
            <div className="skeleton" style={{ width: 220, height: 14, borderRadius: 6 }} />
          </div>
        </div>
        {/* Stats skeleton */}
        <div className="profile-stats" style={{ marginTop: 24 }}>
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton skeleton-stat" />
          ))}
        </div>
        {/* Info skeleton */}
        <div className="profile-activity" style={{ marginTop: 24 }}>
          <div className="skeleton" style={{ width: 120, height: 18, borderRadius: 6, marginBottom: 16 }} />
          {[180, 220, 160, 140, 200].map((w, i) => (
            <div key={i} className="skeleton skeleton-row" style={{ width: w, height: 14, marginBottom: 10 }} />
          ))}
        </div>
      </div>
    </div>
  );
}

function Profile() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [stats, setStats]     = useState({ projects: 0, tasksCompleted: 0, activeFolders: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        // Run profile + folders in parallel — was sequential before
        const [me, folders] = await Promise.all([
          api.getProfile(),
          api.getFolders(),
        ]);
        setProfile(me);

        // Fetch all tasks in parallel across folders
        const taskResults = await Promise.allSettled(
          folders.map((f) => api.getTasks(f.id))
        );
        const completedCount = taskResults.reduce((sum, r) => {
          if (r.status !== "fulfilled") return sum;
          return sum + r.value.filter((t) => t.status === "completed" || t.completed === true).length;
        }, 0);

        setStats({
          projects:       folders.length,
          tasksCompleted: completedCount,
          activeFolders:  folders.length,
        });
      } catch (err) {
        setError("Could not load profile: " + err.message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleLogout = () => { clearAuth(); navigate("/auth"); };

  if (loading) return <ProfileSkeleton />;

  if (error) {
    return (
      <div className="app">
        <div className="nav"><Link to="/" className="link"><h1 className="title">ResHub</h1></Link></div>
        <div className="profile-wrapper">
          <p style={{ textAlign: "center", padding: "40px", color: "red" }}>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="nav">
        <Link to="/" className="link"><h1 className="title">ResHub</h1></Link>
        <Link to="/" className="profile_logo">
          <img src={p_logo} alt="Profile" className="profile_logo" />
        </Link>
      </div>

      <div className="profile-wrapper" style={{ animation: "fadeSlideUp 0.35s ease" }}>
        <div className="profile-header">
          <img src={p_logo} alt="Profile" className="profile-avatar" />
          <div className="profile-basic">
            <h2>{profile.name}</h2>
            <p className="email">{profile.email}</p>
            {profile.bio && <p>{profile.bio}</p>}
          </div>
          <Link to="/edit_profile" className="link" style={{ marginLeft: "auto" }}>
            <button className="edit-btn">Edit Profile</button>
          </Link>
        </div>

        <div className="profile-stats">
          <div className="stat-card"><h3>{stats.projects}</h3><p>Projects</p></div>
          <div className="stat-card"><h3>{stats.tasksCompleted}</h3><p>Tasks Completed</p></div>
          <div className="stat-card"><h3>{stats.activeFolders}</h3><p>Active Folders</p></div>
        </div>

        <div className="profile-activity">
          <h3>Account Info</h3>
          <ul>
            <li>👤 Name: {profile.name}</li>
            <li>📧 Email: {profile.email}</li>
            {profile.bio && <li>📝 Bio: {profile.bio}</li>}
            <li>📁 Total Folders: {stats.activeFolders}</li>
            <li>✅ Tasks Completed: {stats.tasksCompleted}</li>
          </ul>
        </div>

        <button className="edit-btn" onClick={handleLogout}>Logout</button>
      </div>
    </div>
  );
}

export default Profile;