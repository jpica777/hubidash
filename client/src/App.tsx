import { useAuth } from './hooks/useAuth';
import { LoginScreen } from './components/LoginScreen';
import { Dashboard } from './components/Dashboard';

export default function App() {
  // The single auth instance for the whole app; values flow down as props.
  const auth = useAuth();

  if (auth.status === 'checking') {
    return (
      <div className="flex min-h-screen items-center justify-center" aria-busy="true">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
      </div>
    );
  }

  if (auth.status === 'unauthenticated' || !auth.wsToken) {
    return <LoginScreen onLogin={auth.login} />;
  }

  return (
    <Dashboard
      key={auth.wsToken}
      wsToken={auth.wsToken}
      mode={auth.mode}
      onLogout={() => void auth.logout()}
      onSessionExpired={auth.expire}
    />
  );
}
