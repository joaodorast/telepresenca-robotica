import { useState } from 'react';
import type { SessionCredentials } from '../lib/api';
import { LoginScreen } from './LoginScreen';
import { SessionSetup } from './SessionSetup';
import { Console } from './Console';

const K_ADMIN = 'tp.admin';
const K_SESSION = 'tp.session';

function read<T extends { expiresAt: number }>(key: string): T | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(key) || 'null') as T | null;
    return v && v.expiresAt > Date.now() ? v : null;
  } catch {
    return null;
  }
}

/** Central do operador: login → criação da sessão → console de teleoperação. */
export default function OperatorApp() {
  const [admin, setAdmin] = useState(() => read<{ token: string; expiresAt: number }>(K_ADMIN));
  const [creds, setCreds] = useState(() => read<SessionCredentials>(K_SESSION));

  const logout = () => {
    sessionStorage.removeItem(K_ADMIN);
    sessionStorage.removeItem(K_SESSION);
    setAdmin(null);
    setCreds(null);
  };

  if (!admin) {
    return (
      <LoginScreen
        onLogin={(a) => {
          sessionStorage.setItem(K_ADMIN, JSON.stringify(a));
          setAdmin(a);
        }}
      />
    );
  }
  if (!creds) {
    return (
      <SessionSetup
        adminToken={admin.token}
        onCreated={(c) => {
          sessionStorage.setItem(K_SESSION, JSON.stringify(c));
          setCreds(c);
        }}
        onLogout={logout}
      />
    );
  }
  return (
    <Console
      key={creds.sessionId}
      creds={creds}
      onClose={() => {
        sessionStorage.removeItem(K_SESSION);
        setCreds(null);
      }}
      onLogout={logout}
    />
  );
}
