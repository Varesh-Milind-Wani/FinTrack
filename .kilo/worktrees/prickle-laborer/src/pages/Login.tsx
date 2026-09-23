import { useState } from "react";
import {
  ArrowRight,
  CircleDollarSign,
  ShieldCheck,
} from "lucide-react";
import {
  createAccount,
  loginUser,
} from "../utils/storage";
import type { UserAccount } from "../types/finance";

interface Props {
  onAuthenticated: (
    user: UserAccount
  ) => void;
}

const Login = ({
  onAuthenticated,
}: Props) => {
  const [mode, setMode] =
    useState<"login" | "signup">(
      "signup"
    );

  const [name, setName] =
    useState("");

  const [email, setEmail] =
    useState("");

  const [password, setPassword] =
    useState("");

  const [startingBalance, setStartingBalance] =
    useState("100000");

  const [error, setError] =
    useState("");

  const handleSubmit = (
    event: React.FormEvent
  ) => {
    event.preventDefault();

    setError("");

    try {
      let user: UserAccount;

      if (mode === "signup") {
        user = createAccount(
          name,
          email,
          password,
          Number(startingBalance) || 0
        );
      } else {
        user = loginUser(
          email,
          password
        );
      }

      onAuthenticated(user);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Something went wrong."
      );
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-background-circle circle-one" />
      <div className="auth-background-circle circle-two" />

      <div className="auth-card">
        <div className="auth-brand">
          <div className="brand-logo">
            <CircleDollarSign size={23} />
          </div>

          <span>FinTrack</span>
        </div>

        <div className="auth-heading">
          <span className="eyebrow">
            PERSONAL FINANCE
          </span>

          <h1>
            {mode === "signup"
              ? "Take control of your money."
              : "Welcome back."}
          </h1>

          <p>
            Track your profit, loss,
            balance and spending from
            one simple dashboard.
          </p>
        </div>

        <form
          className="auth-form"
          onSubmit={handleSubmit}
        >
          {mode === "signup" && (
            <>
              <label>
                Full name

                <input
                  type="text"
                  placeholder="Your name"
                  value={name}
                  onChange={(e) =>
                    setName(e.target.value)
                  }
                  required
                />
              </label>

              <label>
                Starting balance

                <input
                  type="number"
                  min="0"
                  placeholder="100000"
                  value={
                    startingBalance
                  }
                  onChange={(e) =>
                    setStartingBalance(
                      e.target.value
                    )
                  }
                  required
                />
              </label>
            </>
          )}

          <label>
            Email

            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) =>
                setEmail(e.target.value)
              }
              required
            />
          </label>

          <label>
            Password

            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) =>
                setPassword(e.target.value)
              }
              minLength={4}
              required
            />
          </label>

          {error && (
            <div className="error-message">
              {error}
            </div>
          )}

          <button
            className="primary-button auth-submit"
            type="submit"
          >
            {mode === "signup"
              ? "Create account"
              : "Login"}

            <ArrowRight size={17} />
          </button>
        </form>

        <div className="auth-switch">
          {mode === "signup"
            ? "Already have an account?"
            : "Don't have an account?"}

          <button
            onClick={() => {
              setError("");

              setMode(
                mode === "signup"
                  ? "login"
                  : "signup"
              );
            }}
          >
            {mode === "signup"
              ? "Login"
              : "Create account"}
          </button>
        </div>

        <div className="local-storage-note">
          <ShieldCheck size={15} />

          <span>
            Your finance data is stored
            locally in this browser.
          </span>
        </div>
      </div>
    </div>
  );
};

export default Login;