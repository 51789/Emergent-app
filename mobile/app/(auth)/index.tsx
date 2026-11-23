import { AuthForm } from '@/features/auth/AuthForm';

/** Shared route: `/` is the login screen while signed out and the home tab once signed in. */
export default function LoginRoute() {
  return <AuthForm mode="login" />;
}
