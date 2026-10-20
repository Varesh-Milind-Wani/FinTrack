import { useEffect, useState } from "react";
import { CircleUserRound, Save } from "lucide-react";
import type { UserAccount } from "../types/finance";

interface Props {
  user: UserAccount;
  onSave: (updatedUser: UserAccount) => void;
}

const Profile = ({ user, onSave }: Props) => {
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setName(user.name);
    setEmail(user.email);
  }, [user.name, user.email]);

  const saveProfile = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextName = name.trim();
    const nextEmail = email.trim();
    if (!nextName || !nextEmail) {
      setMessage("Name and email address are required.");
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(nextEmail)) {
      setMessage("Enter a valid email address.");
      return;
    }
    onSave({ ...user, name: nextName, email: nextEmail });
    setMessage("Profile updated successfully.");
  };

  return (
    <div className="page-content profile-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">ACCOUNT</span>
          <h1>Profile</h1>
          <p>Manage the name and email shown across your FinTrack account.</p>
        </div>
      </div>

      <section className="chart-panel profile-details-panel" aria-labelledby="profile-details-title">
        <div className="chart-panel-header">
          <div>
            <h3 id="profile-details-title"><CircleUserRound size={18} /> Profile details</h3>
            <p>These details are stored locally with your account.</p>
          </div>
          <div className="profile-page-avatar" aria-hidden="true">{name.trim().charAt(0).toUpperCase() || "U"}</div>
        </div>

        <form onSubmit={saveProfile}>
          <div className="form-grid profile-form-grid">
            <label>
              Full name
              <input autoComplete="name" value={name} onChange={(event) => { setName(event.target.value); setMessage(null); }} placeholder="Your full name" required />
            </label>
            <label>
              Email address
              <input type="email" autoComplete="email" value={email} onChange={(event) => { setEmail(event.target.value); setMessage(null); }} placeholder="you@example.com" required />
            </label>
          </div>
          <div className="profile-form-footer">
            {message && <span className={message.includes("successfully") ? "field-hint" : "error-message"} role="status">{message}</span>}
            <button className="primary-button" type="submit"><Save size={16} /> Save profile</button>
          </div>
        </form>
      </section>

      <section className="profile-account-note" aria-label="Profile account information">
        <div><span>Account created</span><strong>{new Date(user.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}</strong></div>
        <div><span>Preferred currency</span><strong>{user.currency}</strong></div>
        <div><span>Saved transactions</span><strong>{user.transactions.length}</strong></div>
      </section>
    </div>
  );
};

export default Profile;
