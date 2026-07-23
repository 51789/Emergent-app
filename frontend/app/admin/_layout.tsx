import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useAuth } from '../../src/services/auth';

/**
 * Admin section layout: guards every child route behind role=admin.
 * Non-admins are silently redirected to /login (or /home if logged in as user).
 */
export default function AdminLayout() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    if (user.role !== 'admin') {
      router.replace('/');
    }
  }, [user, loading, router]);

  if (loading || !user || user.role !== 'admin') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF' }}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
