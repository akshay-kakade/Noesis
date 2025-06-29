import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { FaSignOutAlt, FaUser } from 'react-icons/fa';
import './Dashboard.css';

// Import the existing App component
import App from '../App';

const Dashboard: React.FC = () => {
  const { user, logout } = useAuth();

  const handleLogout = () => {
    logout();
  };

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <div className="header-content">
          <div className="header-left">
            <h1>Knowledge Tree Generator</h1>
            <p>Interactive AI-powered knowledge visualization</p>
          </div>
          <div className="header-right">
            <div className="user-info">
              <FaUser className="user-icon" />
              <span className="user-name">{user?.name}</span>
              <span className="user-email">{user?.email}</span>
            </div>
            <button onClick={handleLogout} className="logout-button">
              <FaSignOutAlt />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </header>
      
      <main className="dashboard-main">
        <App />
      </main>
    </div>
  );
};

export default Dashboard; 