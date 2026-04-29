import { Link } from "react-router-dom";
import { useState } from "react";
import "./edit_profile.css";
import p_logo from "./assets/profile_logo.png";

function EditProfile() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    bio: "",
  });

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSave = () => {
    console.log("Saved Data:", formData);
    alert("Profile Updated Successfully ✅");
  };

  return (
    <div className="app">
      <div className="nav">
        <Link to="/" className="link">
          <h1 className="title">TaskNest</h1>
        </Link>
        <Link to="/profile" className="profile_logo">
          <img src={p_logo} alt="Profile" className="profile_logo" />
        </Link>
      </div>

      <div className="edit-container">
        <div className="edit-card">
          <h2>Edit Profile</h2>

          <div className="form-group">
            <label>Name</label>
            <input
              type="text"
              name="name"
              placeholder="Enter your name"
              onChange={handleChange}
            />
          </div>

          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              name="email"
              placeholder="Enter your email"
              onChange={handleChange}
            />
          </div>

          <div className="form-group">
            <label>Bio</label>
            <textarea
              name="bio"
              placeholder="Write something about yourself..."
              onChange={handleChange}
            />
          </div>

          <center>
            <Link to="/profile">
              <button className="save-btn" onClick={handleSave}>
                Save Changes
              </button>
            </Link>
          </center>
        </div>
      </div>
    </div>
  );
}

export default EditProfile;