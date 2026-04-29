import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import "./profile.css";
import p_logo from "./assets/profile_logo.png";
import { clearAuth } from "./api"; // Add this line
function Profile() {
  const navigate = useNavigate();
  const [profile] = useState({
    name: "Dharani Dharan",
    role: "Frontend Developer",
    email: "dharani@example.com",
    projects: 12,
    tasksCompleted: 48,
    activeFolders: 6,
  });
  const handleLogout = () => {
    clearAuth();
    navigate("/auth");
  };

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
            <p>{profile.role}</p>
            <p className="email">{profile.email}</p>
          </div>
          <button className="logout-btn" onClick={handleLogout}>Logout</button>
        </div>

        <div className="profile-stats">
          <div className="stat-card">
            <h3>{profile.projects}</h3>
            <p>Projects</p>
          </div>
          <div className="stat-card">
            <h3>{profile.tasksCompleted}</h3>
            <p>Tasks Completed</p>
          </div>
          <div className="stat-card">
            <h3>{profile.activeFolders}</h3>
            <p>Active Folders</p>
          </div>
        </div>

        <div className="profile-activity">
          <h3>Recent Activity</h3>
          <ul>
            <li>✔ Completed UI redesign</li>
            <li>📁 Created new project folder</li>
            <li>📝 Updated profile information</li>
          </ul>
        </div>

        <Link to="/edit_profile" className="link">
          <button className="edit-btn">Edit Profile</button>
        </Link>
      </div>
    </div>
  );
}

export default Profile;