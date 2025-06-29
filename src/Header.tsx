// ...existing imports...
import { FaGithub, FaLinkedin, FaInstagram, FaYoutube, FaHome, FaInfoCircle } from "react-icons/fa";

// ...existing code...

const Header: React.FC = () => (
    <header className="app-header">
        <div className="header-row">
            <div className="header-title-links">
                <a href="/" className="header-logo-link" aria-label="Home">
                    <FaHome className="header-icon" />
                </a>
                <h1 className="header-title">Knowledge Tree Generator</h1>
                <a href="/about" className="header-link" aria-label="About">
                    <FaInfoCircle className="header-icon" />
                    <span>About</span>
                </a>
            </div>
            <nav className="header-social-links">
                <a href="https://github.com/yourusername/yourrepo" target="_blank" rel="noopener noreferrer" aria-label="GitHub">
                    <FaGithub className="header-icon" />
                </a>
                <a href="https://linkedin.com/in/yourprofile" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn">
                    <FaLinkedin className="header-icon" />
                </a>
                <a href="https://instagram.com/yourprofile" target="_blank" rel="noopener noreferrer" aria-label="Instagram">
                    <FaInstagram className="header-icon" />
                </a>
                <a href="https://youtube.com/@yourchannel" target="_blank" rel="noopener noreferrer" aria-label="YouTube">
                    <FaYoutube className="header-icon" />
                </a>
            </nav>
        </div>
        <p className="header-subtitle">
            Generate and explore knowledge trees powered by Google Gemini AI.
        </p>
    </header>
);

export default Header;

