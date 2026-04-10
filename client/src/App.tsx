import { useAuth } from './hooks/useAuth';
import LoginScreen from './components/LoginScreen';
import Dashboard from './components/Dashboard';

function App() {
  const auth = useAuth();

  if (auth.isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!auth.isAuthenticated) {
    return <LoginScreen onLogin={auth.login} />;
  }

  return <Dashboard wsToken={auth.wsToken} onLogout={auth.logout} />;
}

export default App;
