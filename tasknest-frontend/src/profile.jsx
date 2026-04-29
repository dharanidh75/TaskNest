import { Link, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import "./profile.css";
import p_logo from "./assets/profile_logo.png";
import { clearAuth, api } from "./api";

function Profile() {
  const navigate = useNavigate();

  // Live data state
  const [profile, setProfile] = useState(null);
  const [stats, setStats] = useState({ projects: 0, tasksCompleted: 0, activeFolders: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        // Fetch logged-in user info
        const me = await api.getProfile();
        setProfile(me);

        // Fetch folders to compute live stats
        const folders = await api.getFolders();
        const activeFolders = folders.length;
        const totalProjects = folders.length;

        // Fetch tasks across all folders and count completed ones
        let completedCount = 0;
        await Promise.all(
          folders.map(async (f) => {
            try {
              const tasks = await api.getTasks(f.id);
              completedCount += tasks.filter(
                (t) => t.status === "completed" || t.completed === true
              ).length;
            } catch {
              // skip folders that fail
            }
          })
        );

        setStats({
          projects: totalProjects,
          tasksCompleted: completedCount,
          activeFolders: activeFolders,
        });
      } catch (err) {
        setError("Could not load profile: " + err.message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleLogout = () => {
    clearAuth();
    navigate("/auth");
  };

  if (loading) {
    return (
      <div className="app">
        <div className="nav">
          <Link to="/" className="link">
            <h1 className="title">TaskNest</h1>
          </Link>
        </div>
        <div className="profile-wrapper">
          <p style={{ textAlign: "center", padding: "40px" }}>Loading profile...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="app">
        <div className="nav">
          <Link to="/" className="link">
            <h1 className="title">TaskNest</h1>
          </Link>
        </div>
        <div className="profile-wrapper">
          <p style={{ textAlign: "center", padding: "40px", color: "red" }}>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="nav">
        <Link to="/" className="link">
          <h1 className="title">TaskNest</h1>
        </Link>
        <Link to="/" className="profile_logo">
          <img src={p_logo} alt="Profile" className="profile_logo" />
        </Link>
      </div>

      <div className="profile-wrapper">
        <div className="profile-header">
          <img src={p_logo} alt="Profile" className="profile-avatar" />
          <div className="profile-basic">
            <h2>{profile.name}</h2>
            <p className="email">{profile.email}</p>
            {profile.bio && <p>{profile.bio}</p>}
          </div>
        <Link to="/edit_profile" className="link">
          <button className="edit-btn" style={{position: "relative", left: "200px"}}>Edit Profile</button>
        </Link>
        </div>

        <div className="profile-stats">
          <div className="stat-card">
            <h3>{stats.projects}</h3>
            <p>Projects</p>
          </div>
          <div className="stat-card">
            <h3>{stats.tasksCompleted}</h3>
            <p>Tasks Completed</p>
          </div>
          <div className="stat-card">
            <h3>{stats.activeFolders}</h3>
            <p>Active Folders</p>
          </div>
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