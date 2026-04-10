import { useState, FormEvent } from 'react';

interface LoginScreenProps {
  onLogin: (password: string) => Promise<boolean>;
}

export default function LoginScreen({ onLogin }: LoginScreenProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const ok = await onLogin(password);
    if (!ok) setError('Invalid password. Please try again.');
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-accent/20 border border-accent/30 mb-4">
            <span className="text-3xl">🏠</span>
          </div>
          <h1 className="text-2xl font-semibold text-white">HubiDash</h1>
          <p className="text-sm text-muted mt-1">Hubitat smart home dashboard</p>
        </div>

        <form onSubmit={handleSubmit} className="glass rounded-2xl p-6 space-y-4">
          <div>
            <label htmlFor="password" className="block text-sm text-muted mb-1.5">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter dashboard password"
              autoFocus
              required
              className="w-full px-4 py-2.5 rounded-lg bg-surface-2 border border-border text-white placeholder-muted/50 focus:outline-none focus:ring-2 focus:ring-accent/60 focus:border-accent/60 transition"
            />
          </div>

          {error && <p className="text-sm text-red-400 text-center">{error}</p>}

          <button
            type="submit"
            disabled={loading || !password}
            className="w-full py-2.5 px-4 rounded-lg bg-accent text-white font-medium hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
