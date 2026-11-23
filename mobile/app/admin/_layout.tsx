import { Redirect, Stack } from 'expo-router';

import { useSession } from '@/features/auth/session';

/** Admin stack. The root layout already guards it; the check here is defence in depth. */
export default function AdminLayout() {
  const isAdmin = useSession((state) => state.user?.role === 'admin');
  if (!isAdmin) return <Redirect href="/" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
